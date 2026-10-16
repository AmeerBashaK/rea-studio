# SPDX-License-Identifier: AGPL-3.0-only
from unittest.mock import patch
from types import SimpleNamespace
import hashlib
import contextlib
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
import random
import pefile

from engine import analyze, AnalysisError, Image


def fixture(bits=64, code=None):
    """Minimal PE with explicit machine-code ground truth; no compiler heuristics."""
    data = bytearray(1024)
    data[:2] = b'MZ'
    struct.pack_into('<I', data, 0x3c, 0x80)
    data[0x80:0x84] = b'PE\0\0'
    optional_size = 0xf0 if bits == 64 else 0xe0
    struct.pack_into('<HHIIIHH', data, 0x84, 0x8664 if bits == 64 else 0x14c, 1, 0, 0, 0, optional_size, 0x22 if bits == 64 else 0x102)
    opt = 0x98
    struct.pack_into('<H', data, opt, 0x20b if bits == 64 else 0x10b)
    struct.pack_into('<I', data, opt + 4, 512)
    struct.pack_into('<I', data, opt + 16, 0x1000)
    struct.pack_into('<I', data, opt + 20, 0x1000)
    if bits == 64:
        struct.pack_into('<Q', data, opt + 24, 0x140000000)
        struct.pack_into('<I', data, opt + 108, 16)
    else:
        struct.pack_into('<I', data, opt + 28, 0x400000)
        struct.pack_into('<I', data, opt + 92, 16)
    struct.pack_into('<II', data, opt + 32, 0x1000, 0x200)
    struct.pack_into('<II', data, opt + 56, 0x2000, 0x200)
    struct.pack_into('<H', data, opt + 68, 3)
    sec = opt + optional_size
    data[sec:sec + 8] = b'.text\0\0\0'
    struct.pack_into('<IIIIIIHHI', data, sec + 8, 512, 0x1000, 512, 512, 0, 0, 0, 0, 0x60000020)
    data[512:] = b'\xcc' * 512
    if code is None:
        code = bytes.fromhex('e8 1b000000 83f800 7403 31c0 c3 b801000000 c3')
        data[544:550] = bytes.fromhex('b82a000000 c3')
    data[512:512 + len(code)] = code
    data[600:613] = b'Hello Studio\0'
    return data


class EngineTests(unittest.TestCase):
    def run_bytes(self, raw, **kwargs):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            p = Path(folder) / 'fixture.exe'
            p.write_bytes(raw)
            with contextlib.redirect_stderr(io.StringIO()):
                return analyze(p, **kwargs)

    def test_input_larger_than_previous_size_cap(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            p = Path(folder) / 'large.exe'
            with p.open('wb') as stream:
                stream.write(fixture())
                stream.truncate(129 * 1024 * 1024)
            with p.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            with contextlib.redirect_stderr(io.StringIO()):
                result = analyze(p)
            self.assertEqual(result['subject']['size'], 129 * 1024 * 1024)
            self.assertEqual(result['subject']['sha256'], digest)
            self.assertIn('0x140001000', [f['address'] for f in result['functions']])
            self.assertIn('0x140001020', [f['address'] for f in result['functions']])

    def test_focused_helper_outside_initial_budget(self):
        raw = fixture()
        initial = self.run_bytes(raw, max_functions=1)
        self.assertEqual(len(initial['functions']), 1)
        r = self.run_bytes(raw, address=0x140001020, expected_sha256=initial['subject']['sha256'])
        self.assertEqual([f['address'] for f in r['functions']], ['0x140001020'])
        self.assertEqual(r['functions'][0]['instructions'][0]['operands'], 'eax, 0x2a')
        self.assertEqual(r['scope']['kind'], 'focused')
        self.assertFalse(r['scope']['strings_scanned'])
        self.assertEqual(r['strings'], [])

    def test_focused_rejects_replaced_input(self):
        raw = fixture()
        digest = hashlib.sha256(raw).hexdigest()
        raw[544] = 0xc3
        with self.assertRaisesRegex(AnalysisError, 'SHA-256 changed'):
            self.run_bytes(raw, address=0x140001020, expected_sha256=digest)

    def test_focused_requires_hash_and_executable_mapping(self):
        raw = fixture()
        with self.assertRaisesRegex(AnalysisError, 'requires the original'):
            self.run_bytes(raw, address=0x140001020)
        with self.assertRaisesRegex(AnalysisError, 'not backed by executable'):
            self.run_bytes(raw, address=0x140000010, expected_sha256=hashlib.sha256(raw).hexdigest())

    def test_focused_does_not_follow_calls_into_more_functions(self):
        raw = fixture()
        r = self.run_bytes(raw, address=0x140001000, expected_sha256=hashlib.sha256(raw).hexdigest())
        self.assertEqual(len(r['functions']), 1)
        self.assertTrue(any(s['address'] == '0x140001020' and not s['analyzed'] for s in r['seeds']))

    def test_focused_x86_address(self):
        raw = fixture(32)
        r = self.run_bytes(raw, address=0x401020, expected_sha256=hashlib.sha256(raw).hexdigest())
        self.assertEqual(r['functions'][0]['address'], '0x401020')

    def test_exports_do_not_change_requested_analysis_scope(self):
        def exported(pe, **kwargs):
            pe.DIRECTORY_ENTRY_EXPORT = SimpleNamespace(symbols=[SimpleNamespace(address=0x1020, name=b'helper', forwarder=None, ordinal=1)])
        raw = fixture()
        with patch.object(pefile.PE, 'parse_data_directories', exported):
            discovery = self.run_bytes(raw)
            self.assertEqual(discovery['scope']['kind'], 'discovery')
            self.assertEqual(len(discovery['functions']), 2)
            self.assertTrue(discovery['scope']['strings_scanned'])
            focused = self.run_bytes(raw, address=0x140001000, expected_sha256=hashlib.sha256(raw).hexdigest())
            self.assertEqual(focused['scope']['requested_address'], '0x140001000')
            self.assertEqual(focused['functions'][0]['address'], '0x140001000')

    def test_disputed_ud_traps_stop_without_fake_boundaries(self):
        for bits in (32,64):
            for code in ('0fb9c0c3', '0fffc0c3'):
                with self.subTest(bits=bits,code=code):
                    result=self.run_bytes(fixture(bits,bytes.fromhex(code)))
                    function=result['functions'][0]
                    self.assertEqual(function['instructions'],[])
                    self.assertEqual(function['decode_failures'],[function['address']])

    def test_x64_calls_and_branches(self):
        r = self.run_bytes(fixture())
        self.assertEqual(r['subject']['architecture'], 'x64')
        funcs = {f['address']: f for f in r['functions']}
        self.assertEqual(set(funcs), {'0x140001000', '0x140001020'})
        first = funcs['0x140001000']
        self.assertEqual(first['instructions'][0]['bytes'], 'e8 1b 00 00 00')
        refs = {(x['kind'], x['source'], x['target']) for x in r['references']}
        self.assertIn(('call', '0x140001000', '0x140001020'), refs)
        self.assertIn(('branch', '0x140001008', '0x14000100d'), refs)
        self.assertEqual(funcs['0x140001020']['instructions'][0]['operands'], 'eax, 0x2a')
        self.assertGreaterEqual(len(first['blocks']), 3)
        self.assertTrue(any(x['text'] == 'Hello Studio' for x in r['strings']))

    def test_x86_address_width(self):
        r = self.run_bytes(fixture(32))
        self.assertEqual(r['subject']['image_base'], '0x400000')
        self.assertEqual(r['functions'][0]['address'], '0x401000')

    def test_negative_branch_is_not_unsigned_wrap(self):
        r = self.run_bytes(fixture(code=bytes.fromhex('31c0 75fc c3')))
        self.assertEqual(r['references'][0]['target'], '0x140001000')
        self.assertEqual(r['coverage']['instructions'], 3)

    def test_indirect_jump_remains_unresolved(self):
        r = self.run_bytes(fixture(code=bytes.fromhex('ffe0')))
        self.assertIsNone(r['references'][0]['target'])
        self.assertFalse(r['references'][0]['resolved'])
        self.assertEqual(r['coverage']['instructions'], 1)

    def test_rip_relative_data_address(self):
        r = self.run_bytes(fixture(code=bytes.fromhex('488d0551000000 c3')))
        self.assertEqual(r['references'][0]['target'], '0x140001058')
        self.assertEqual(r['references'][0]['kind'], 'memory')

    def test_instruction_budget_is_reported(self):
        r = self.run_bytes(fixture(), max_instructions=2)
        self.assertEqual(r['coverage']['instructions'], 2)
        self.assertTrue(r['coverage']['limits'])

    def test_function_budget_is_reported(self):
        r = self.run_bytes(fixture(), max_functions=1)
        self.assertEqual(len(r['functions']), 1)
        self.assertTrue(r['coverage']['limits'])

    def test_truncated_section_rejected(self):
        with self.assertRaises(AnalysisError):
            self.run_bytes(fixture()[:-10])

    def test_wrong_machine_rejected(self):
        raw = fixture(); struct.pack_into('<H', raw, 0x84, 0xaa64)
        with self.assertRaises(AnalysisError):
            self.run_bytes(raw)

    def test_managed_assembly_routed_elsewhere(self):
        raw = fixture(); struct.pack_into('<II', raw, 0x98 + 112 + 14 * 8, 0x1100, 72)
        with self.assertRaisesRegex(AnalysisError, 'Managed'):
            self.run_bytes(raw)

    def test_header_mismatch_rejected(self):
        raw = fixture(); struct.pack_into('<H', raw, 0x98, 0x10b)
        with self.assertRaises(AnalysisError):
            self.run_bytes(raw)

    def test_unknown_bytes_do_not_become_fake_instructions(self):
        raw = fixture(code=b'\x0f')
        raw[513:] = b'\x0f' * 511
        r = self.run_bytes(raw)
        self.assertTrue(r['functions'][0]['decode_failures'])

    def test_import_thunk_reference(self):
        raw=fixture(code=bytes.fromhex('ff1562010000 c3'))
        struct.pack_into('<II',raw,0x98+112+8,0x1100,40)
        raw[0x300:0x390]=b'\0'*0x90
        struct.pack_into('<IIIII',raw,0x300,0x1150,0,0,0x1140,0x1168)
        raw[0x340:0x34d]=b'KERNEL32.dll\0'
        struct.pack_into('<QQ',raw,0x350,0x1180,0)
        struct.pack_into('<QQ',raw,0x368,0x1180,0)
        raw[0x382:0x38e]=b'ExitProcess\0'
        r=self.run_bytes(raw)
        self.assertEqual(r['imports'][0]['name'],'ExitProcess')
        imported=[x for x in r['references'] if x['kind']=='import']
        self.assertEqual(imported[0]['label'],'KERNEL32.dll!ExitProcess')
        self.assertEqual(imported[0]['target'],'0x140001168')
        self.assertIsNone([x for x in r['references'] if x['kind']=='call'][0]['target'])

    def test_virtual_tail_is_not_read_from_next_file_bytes(self):
        raw=fixture();struct.pack_into('<I',raw,0x98+0xf0+8,0x800)
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            p=Path(folder)/'image.exe';p.write_bytes(raw);im=Image(p)
            self.assertIsNone(im.locate(im.base+0x1300))

    def test_seeded_header_mutations_fail_cleanly(self):
        rng=random.Random(42)
        for _ in range(60):
            raw=fixture()
            for _ in range(rng.randint(1,4)):
                raw[rng.randrange(512)]=rng.randrange(256)
            try:
                result=self.run_bytes(raw,max_functions=4,max_instructions=20,max_seconds=1)
                self.assertLessEqual(result['coverage']['instructions'],20)
            except (AnalysisError,pefile.PEFormatError):
                pass


if __name__ == '__main__':
    unittest.main(verbosity=2)
