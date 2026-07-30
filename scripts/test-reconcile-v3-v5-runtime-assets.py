#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name('reconcile-v3-v5-runtime-assets.py')
spec = importlib.util.spec_from_file_location('reconcile_v3_v5_runtime_assets', MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReconciliationRegressionTests(unittest.TestCase):
    def test_checked_in_contract_validator_is_invoked(self) -> None:
        self.assertEqual(module.CONTRACT_VALIDATOR.name, 'check_canonical_version_contract.py')
        self.assertTrue(module.CONTRACT_VALIDATOR.is_file())
        with patch.object(module.subprocess, 'run') as run:
            module.run_contract_validator()
        run.assert_called_once_with(
            ['python', 'check_canonical_version_contract.py'],
            cwd=module.GEN,
            check=True,
        )

    def test_only_real_not_found_is_classified_missing(self) -> None:
        missing = subprocess.CompletedProcess(
            args=['gh'], returncode=1,
            stdout=json.dumps({'message': 'Not Found', 'status': '404'}), stderr=''
        )
        with patch.object(module.subprocess, 'run', return_value=missing):
            present, metadata = module.api_exists('missing.webp', 'main')
        self.assertFalse(present)
        self.assertEqual(metadata['lookupStatus'], 'not-found')

    def test_auth_or_provider_failure_fails_closed(self) -> None:
        unauthorized = subprocess.CompletedProcess(
            args=['gh'], returncode=1, stdout='', stderr='HTTP 401: Bad credentials'
        )
        with patch.object(module.subprocess, 'run', return_value=unauthorized):
            with self.assertRaisesRegex(RuntimeError, 'GitHub lookup failed'):
                module.api_exists('asset.webp', 'main')


if __name__ == '__main__':
    unittest.main()
