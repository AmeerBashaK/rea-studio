# SPDX-License-Identifier: AGPL-3.0-only
"""Independent checks on retained decoding, not a claim of complete code recovery."""
import contextlib
import io
from pathlib import Path
import random
import struct
import tempfile
import unittest
from iced_x86 import Decoder, FlowControl
from engine import analyze
from test_engine import fixture


def compare_result(result):
    bits = 64 if result['subject']['architecture'] == 'x64' else 32
    count = 0
    for function in result['functions']:
        for row in function['instructions']:
            address = int(row['address'], 16)
            code = bytes.fromhex(row['bytes'])
            independent = Decoder(bits, code, ip=address).decode()
            if independent.is_invalid or independent.len != row['size'] or independent.len != len(code):
                raise AssertionError(f'Instruction boundary disagreement at {row["address"]}')
            control = independent.flow_control
            refs = [r for r in row['references'] if r['kind'] in ('call', 'branch')]
            direct = {FlowControl.CALL: 'call', FlowControl.CONDITIONAL_BRANCH: 'branch', FlowControl.UNCONDITIONAL_BRANCH: 'branch'}
            if control in direct:
                expected = (direct[control], hex(independent.near_branch_target))
                if expected not in [(r['kind'], r['target']) for r in refs]:
                    raise AssertionError(f'Direct target disagreement at {row["address"]}')
            elif control in (FlowControl.INDIRECT_CALL, FlowControl.INDIRECT_BRANCH):
                if not any(r['target'] is None and not r['resolved'] for r in refs):
                    raise AssertionError(f'Indirect target incorrectly resolved at {row["address"]}')
            elif control == FlowControl.RETURN and row['successors']:
                raise AssertionError(f'Return has a fallthrough successor at {row["address"]}')
            if independent.is_ip_rel_memory_operand:
                # Only mapped operand references are emitted by Studio Native.
                for ref in row['references']:
                    if ref['kind'] in ('memory', 'import') and ref['target'] != hex(independent.ip_rel_memory_address):
                        raise AssertionError(f'IP-relative operand disagreement at {row["address"]}')
            count += 1
    return count


class DifferentialTests(unittest.TestCase):
    def run_bytes(self, raw):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            target=Path(folder)/'fixture.exe';target.write_bytes(raw)
            with contextlib.redirect_stderr(io.StringIO()):
                return analyze(target)

    def test_calls_branches_and_returns_both_modes(self):
        for bits in (32,64):
            with self.subTest(bits=bits):
                self.assertEqual(compare_result(self.run_bytes(fixture(bits))),9)

    def test_seeded_arithmetic_and_short_branches(self):
        rng=random.Random(20261016)
        checked=0
        for bits in (32,64):
            for case in range(40):
                code=bytearray()
                for _ in range(10):
                    reg=rng.randrange(8)
                    choices=[bytes([0xb8+reg])+struct.pack('<I',rng.getrandbits(32)),bytes([0x83,0xc0+reg,rng.randrange(256)]),bytes([0x85,0xc0+reg*9]),b'\x75\x00',b'\x90']
                    code.extend(rng.choice(choices))
                code.append(0xc3)
                with self.subTest(bits=bits,case=case):
                    result=self.run_bytes(fixture(bits,bytes(code)))
                    count=compare_result(result)
                    self.assertEqual(count,11)
                    checked+=count
        self.assertEqual(checked,880)

    def test_indirect_and_rip_relative_operands(self):
        for code in ('ffe0','ffd0c3','488b0510000000c3'):
            with self.subTest(code=code):
                self.assertGreater(compare_result(self.run_bytes(fixture(code=bytes.fromhex(code)))),0)

    def test_real_windows_binary_retained_instructions(self):
        target=Path('C:/Windows/System32/kernel32.dll')
        if not target.exists():self.skipTest('Windows system corpus unavailable')
        with contextlib.redirect_stderr(io.StringIO()):result=analyze(target)
        self.assertEqual(result['scope']['kind'],'discovery')
        self.assertGreater(compare_result(result),100)

if __name__=='__main__':unittest.main()
