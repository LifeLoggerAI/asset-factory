"""Current IMAGE semantic binding against the literal Model request consumer."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import unittest

import paid_request_guard as guard

ROOT = Path(__file__).resolve().parents[2]


class SemanticInput(unittest.TestCase):
    def test_equivalent_numeric_spellings_share_semantics_but_not_wire_bytes(self):
        pairs = [
            (b'{"n":1}', b'{"n":1.0}'),
            (b'{"n":1e0}', b'{"n":1.000}'),
            (b'{"n":0}', b'{"n":-0.0}'),
            (b'{"n":1e-7}', b'{"n":0.0000001}'),
            (b'{"n":1e20}', b'{"n":100000000000000000000.0}'),
            (b'{"x":1,"n":[1.0,-0.0]}', b'{ "n":[1,0],"x":1.0}'),
        ]
        for left, right in pairs:
            with self.subTest(left=left, right=right):
                self.assertEqual(guard.semantic_input_digest(json.loads(left)), guard.semantic_input_digest(json.loads(right)))
                self.assertNotEqual(guard.request_digest('https://synthetic.invalid', left), guard.request_digest('https://synthetic.invalid', right))
        self.assertNotEqual(guard.semantic_input_digest({'n': 1}), guard.semantic_input_digest({'n': 2}))

    def test_actual_model_client_and_python_produce_identical_semantic_hashes(self):
        bodies = [
            '{"n":1}', '{"n":1.0}', '{"n":-0.0}', '{"n":1e-7}',
            '{"n":0}', '{"b":[1.0,-0.0],"a":1e-7}', '{"a":0.0000001,"b":[1,0]}',
            '{"n":1e21}', '{"n":1e20}', '{"n":333333333.3333333}',
            '{"n":[null,true,false,4.5,0.002,1e-27]}',
            '{"\\ue000":1,"\\ud800\\udc00":2,"ascii":3}',
            '{"text":"é/\\n","nested":{"z":1,"a":2}}',
            '{"text":"𝄞","nested":{"a":2.0,"z":1.0}}',
        ]
        code = """import {freezeRequest} from './model_forge/model-spend-client.mjs';
let data=''; for await(const chunk of process.stdin) data+=chunk;
const hashes=[]; for(const body of JSON.parse(data)) {
 const frozen=await freezeRequest('https://api.replicate.com/v1/models/synthetic/model/predictions', {method:'POST',headers:{authorization:'Bearer SYNTHETIC-ONLY','content-type':'application/json'},body},'replicate');
 hashes.push(frozen.semantic_input_sha256);
} process.stdout.write(JSON.stringify(hashes));"""
        result = subprocess.run(['node', '--input-type=module', '-e', code], input=json.dumps(bodies), text=True, capture_output=True, cwd=ROOT, check=True, timeout=20)
        actual = json.loads(result.stdout)
        for body, counterpart in zip(bodies, actual):
            with self.subTest(body=body):
                self.assertEqual(guard.semantic_input_digest(json.loads(body)), counterpart)
        self.assertEqual(actual[0], actual[1])

    def test_original_source_fingerprints_remain_exact_and_separate(self):
        value = {'n': 1.0, 'text': 'é'}
        original = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.assertEqual(guard.source_input_digest(value), hashlib.sha256(original).hexdigest())
        self.assertNotEqual(guard.source_input_digest({'n': 1}), guard.source_input_digest({'n': 1.0}))

    def test_nonfinite_unsafe_and_invalid_unicode_inputs_fail_closed(self):
        invalid = [math.inf, -math.inf, math.nan, 9007199254740992, -9007199254740992, '\ud800', {'\udfff': 1}, {1: 'non-string-key'}, object()]
        for value in invalid:
            with self.subTest(type=type(value).__name__):
                with self.assertRaises(guard.PaidRequestUnauthorized):
                    guard.semantic_input_digest(value)


if __name__ == '__main__':
    unittest.main()
