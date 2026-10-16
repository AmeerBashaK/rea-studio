# SPDX-License-Identifier: AGPL-3.0-only
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from engine import analyze
from test_differential import compare_result

ROOT=Path(__file__).resolve().parent
@unittest.skipUnless(importlib.util.find_spec('ziglang'), 'Install requirements-corpus.txt for compiler validation')
class CompilerCorpusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (ROOT.parent/'verification').mkdir(exist_ok=True)
        cls.folder=Path(tempfile.mkdtemp(prefix='compiler-',dir=ROOT.parent/'verification'))
        cls.results=[]
        cls.compiler=subprocess.run([sys.executable,'-m','ziglang','version'],check=True,capture_output=True,text=True).stdout.strip()
        env=os.environ.copy();env['ZIG_GLOBAL_CACHE_DIR']=str(cls.folder/'cache');env['ZIG_LOCAL_CACHE_DIR']=str(cls.folder/'local-cache')
        for bits,target in [(32,'x86-windows-msvc'),(64,'x86_64-windows-msvc')]:
            for optimization in ['-O0','-O2','-Os']:
                output=cls.folder/f'fixture-{bits}-{optimization[1:]}.exe'
                flags=['cc','-target',target,optimization,'-nostdlib','-fno-stack-protector','-fno-builtin','-Wl,--entry,entry','-Wl,--subsystem,console',str(ROOT/'corpus/control_flow.c'),'-o',str(output)]
                compiled=subprocess.run([sys.executable,'-m','ziglang',*flags],env=env,capture_output=True,text=True,timeout=120)
                if compiled.returncode:raise RuntimeError(compiled.stderr)
                with contextlib.redirect_stderr(io.StringIO()):result=analyze(output)
                cls.results.append((bits,optimization,result))
                (output.with_suffix('.build.json')).write_text(json.dumps({'compiler':cls.compiler,'flags':flags,'source_sha256':hashlib.sha256((ROOT/'corpus/control_flow.c').read_bytes()).hexdigest(),'binary_sha256':result['subject']['sha256'],'instructions':result['coverage']['instructions']},indent=2),encoding='utf-8')

    def test_exported_entries_are_recovered(self):
        required={'arithmetic','choose','sum_loop','dispatch','indirect','entry'}
        for bits,optimization,result in self.results:
            with self.subTest(bits=bits,optimization=optimization):
                self.assertEqual(result['scope']['kind'],'discovery')
                self.assertEqual(result['subject']['architecture'],'x64' if bits==64 else 'x86')
                exports={row['name'].lstrip('_'):row['address'] for row in result['exports']}
                self.assertTrue(required<=exports.keys())
                functions={row['address']:row for row in result['functions']}
                for name in required:
                    self.assertIn(exports[name],functions)
                    self.assertTrue(functions[exports[name]]['instructions'])
                self.assertFalse(result['coverage']['limits'])

    def test_independent_instruction_decoding(self):
        for bits,optimization,result in self.results:
            with self.subTest(bits=bits,optimization=optimization):self.assertGreater(compare_result(result),20)

    def test_indirect_call_stays_unresolved(self):
        for bits,optimization,result in self.results:
            with self.subTest(bits=bits,optimization=optimization):
                address=next(e['address'] for e in result['exports'] if e['name'].lstrip('_')=='indirect')
                function=next(f for f in result['functions'] if f['address']==address)
                refs=[r for row in function['instructions'] for r in row['references'] if r['kind'] in ('call','branch')]
                self.assertTrue(any(r['target'] is None and not r['resolved'] for r in refs))

if __name__=='__main__':unittest.main()
