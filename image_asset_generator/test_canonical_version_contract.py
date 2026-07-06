from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

import canonical_version_contract as contract
import forge_versioned_legacy

BASE_DIR = Path(__file__).resolve().parent


class CanonicalVersionContractTests(unittest.TestCase):
    def test_catalog_has_exact_release_matrix(self) -> None:
        catalog = contract.load_catalog()["versions"]
        self.assertEqual(set(catalog), set(contract.EXPECTED_MATRIX))
        for version, (expected_count, expected_label, expected_prefix) in contract.EXPECTED_MATRIX.items():
            config = catalog[version]
            self.assertEqual(config["expectedOutputs"], expected_count)
            self.assertEqual(config["label"], expected_label)
            self.assertEqual(config["assetPrefix"].rstrip("/"), expected_prefix)

    def test_every_version_builds_the_catalog_manifest(self) -> None:
        hashes: set[str] = set()
        for version in contract.EXPECTED_MATRIX:
            result = contract.build_and_validate(version)
            self.assertEqual(result["expectedOutputs"], result["actualOutputs"])
            self.assertTrue(result["manifestPath"].exists())
            self.assertEqual(len(result["manifestSha256"]), 64)
            hashes.add(result["manifestSha256"])
        self.assertEqual(len(hashes), len(contract.EXPECTED_MATRIX))

    def test_compatibility_entry_uses_canonical_catalog(self) -> None:
        self.assertEqual(forge_versioned_legacy.CATALOG_PATH, contract.CATALOG_PATH)
        for version in contract.EXPECTED_MATRIX:
            config, manifest_path = forge_versioned_legacy.resolve_version(version)
            validated = contract.build_and_validate(version)
            self.assertEqual(config["label"], validated["label"])
            self.assertEqual(manifest_path, validated["manifestPath"])

    def test_dry_run_executes_zero_provider_calls(self) -> None:
        env = os.environ.copy()
        env.update(
            {
                "ASSET_FORGE_MAX_ROUNDS": "3",
                "ASSET_FORGE_MAX_ATTEMPTS": "3",
                "ASSET_PROVIDER_UNIT_COST_USD": "0.04",
                "ASSET_FORGE_MAX_BATCH_USD": "100.00",
            }
        )
        for entry in ("forge_versioned.py", "canonical_forge_entry.py", "forge_versioned_legacy.py"):
            result = subprocess.run(
                [sys.executable, str(BASE_DIR / entry), "--version", "v3", "--dry-run-contract"],
                cwd=BASE_DIR,
                env=env,
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout)
            self.assertEqual(payload["expectedOutputs"], 14)
            self.assertEqual(payload["costExposure"]["providerCallsExecuted"], 0)

    def test_provider_mode_requires_unit_cost_and_ceiling(self) -> None:
        previous = os.environ.copy()
        try:
            os.environ.pop("ASSET_PROVIDER_UNIT_COST_USD", None)
            os.environ.pop("ASSET_FORGE_MAX_BATCH_USD", None)
            with self.assertRaisesRegex(RuntimeError, "ASSET_PROVIDER_UNIT_COST_USD"):
                contract.assert_provider_budget("v2")

            os.environ["ASSET_PROVIDER_UNIT_COST_USD"] = "1.00"
            os.environ["ASSET_FORGE_MAX_BATCH_USD"] = "10.00"
            with self.assertRaisesRegex(RuntimeError, "exceeds"):
                contract.assert_provider_budget("v2")
        finally:
            os.environ.clear()
            os.environ.update(previous)


if __name__ == "__main__":
    unittest.main()
