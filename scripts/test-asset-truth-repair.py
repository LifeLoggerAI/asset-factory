#!/usr/bin/env python3
"""Zero-spend executable fixtures for asset manifest and recertification contracts."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "image_asset_generator"
sys.path.insert(0, str(GEN))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ledger = load_module("build_multimodal_ledger", ROOT / "scripts/build-v1-v5-multimodal-ledger.py")
# The fixture exercises receipt ordering only; isolate it from image scoring and
# validation imports so it cannot touch provider or asset-generation paths.
sys.modules.setdefault("score_v1_assets", types.ModuleType("score_v1_assets"))
sys.modules.setdefault("validate_assets", types.ModuleType("validate_assets"))
recertify = load_module("recertify_v1_recovery_artifact", GEN / "recertify_v1_recovery_artifact.py")


class ManifestPathTests(unittest.TestCase):
    def test_v2_uses_generated_manifest_name(self) -> None:
        self.assertEqual(ledger.canonical_manifest_name("v2"), "v2.manifest.json")

    def test_other_version_names_remain_explicit(self) -> None:
        self.assertEqual(ledger.canonical_manifest_name("v1"), "v1.manifest.json")
        for version in ("v3", "v4", "v5"):
            self.assertEqual(ledger.canonical_manifest_name(version), f"{version}-canonical.manifest.json")

    def test_unknown_version_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unsupported visual manifest version"):
            ledger.canonical_manifest_name("v6")


class CheckpointReceiptTests(unittest.TestCase):
    def test_checkpoint_receipt_exists_before_certifier_runs(self) -> None:
        receipt = {
            "schemaVersion": "1.0.0",
            "status": "passed",
            "version": "v1",
            "ready": 53,
            "missing": 0,
            "providerCallsDuringRecertification": 0,
            "promotionAuthorized": False,
            "deploymentAuthorized": False,
        }
        commands: list[list[str]] = []

        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)

            def observe(command, *, cwd, check):
                self.assertEqual(cwd, base)
                self.assertTrue(check)
                commands.append(command)
                if command[1] == "certify_version_handoff.py":
                    checkpoint = base / "forge_receipt.json"
                    self.assertTrue(checkpoint.is_file())
                    self.assertEqual(json.loads(checkpoint.read_text(encoding="utf-8")), receipt)

            with mock.patch.object(recertify.subprocess, "run", side_effect=observe):
                recertify.run_handoff_certification(receipt, base=base)

        self.assertEqual(
            [command[1] for command in commands],
            [
                "create_preview.py",
                "create_firebase_seed.py",
                "export_assets.py",
                "export_spatial_handoff.py",
                "certify_version_handoff.py",
            ],
        )


if __name__ == "__main__":
    unittest.main()
