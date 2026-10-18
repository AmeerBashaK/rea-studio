# SPDX-License-Identifier: AGPL-3.0-only
import json
import unittest
from result import validate

class Results(unittest.TestCase):
    def setUp(self):
        self.data = dict(schema='studio-decompiler/1', engine='Ghidra', engineVersion='fixture', sha256='a'*64, address='0x00001000', status='complete', code='int f(void) { return 42; }')
    def check(self, **changes):
        return validate(json.dumps(dict(self.data, **changes)).encode(), 'a'*64, '0x1000')
    def test_success_and_identity(self):
        self.assertEqual(self.check()['status'], 'complete')
        for change in [dict(sha256='b'*64),dict(address='0x1001'),dict(engine='unknown'),dict(schema='other')]:
            with self.assertRaises(ValueError): self.check(**change)
    def test_failure_cannot_carry_code(self):
        for status in ['failed','timeout','no-function','output-limit']:
            with self.assertRaises(ValueError): self.check(status=status)
            data=dict(self.data,status=status); del data['code']
            self.assertEqual(validate(json.dumps(data).encode(),'a'*64,'0x1000')['status'],status)
    def test_limits_and_malformed(self):
        for raw in [b'null',b'[]',b'bad',b'x'*(3*1024*1024+1)]:
            with self.assertRaises(ValueError): validate(raw,'a'*64,'0x1000')
        for change in [dict(code=''),dict(code='x'*(2*1024*1024+1)),dict(status='invented'),dict(address='invalid')]:
            with self.assertRaises(ValueError): self.check(**change)

if __name__ == '__main__': unittest.main()
