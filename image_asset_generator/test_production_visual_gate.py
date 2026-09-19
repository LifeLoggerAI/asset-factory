from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

import create_firebase_seed
import run_pipeline


class ProductionVisualGateTests(unittest.TestCase):
    def test_semantic_duplicate_hashes_are_blocking(self) -> None:
        entries = [
            {"name": "home", "status": "approved"},
            {"name": "life_map", "status": "approved"},
        ]
        assets = [
            {
                "name": "home",
                "category": "home",
                "path": "a.png",
                "exists": True,
                "renderer": "provider",
                "render_metadata_path": "a.png.render.json",
                "sha256": "same",
            },
            {
                "name": "life_map",
                "category": "life_map",
                "path": "b.png",
                "exists": True,
                "renderer": "provider",
                "render_metadata_path": "b.png.render.json",
                "sha256": "same",
            },
        ]
        gate = run_pipeline.build_production_visual_gate(entries, assets, [])
        self.assertEqual(gate["status"], "blocked")
        self.assertFalse(gate["production_visual_authority"])
        self.assertFalse(gate["promotion_allowed"])
        self.assertEqual(len(gate["semantic_duplicate_hash_groups"]), 1)

    def test_missing_provenance_is_blocking(self) -> None:
        entries = [{"name": "home", "status": "approved"}]
        assets = [
            {
                "name": "home",
                "category": "home",
                "path": "home.png",
                "exists": True,
                "renderer": "provider",
                "render_metadata_path": None,
                "sha256": "unique",
            }
        ]
        gate = run_pipeline.build_production_visual_gate(entries, assets, [])
        self.assertEqual(gate["status"], "blocked")
        self.assertEqual(gate["missing_render_metadata"], ["home.png"])

    def test_unapproved_provider_asset_is_blocking(self) -> None:
        entries = [{"name": "home", "status": "generated"}]
        assets = [
            {
                "name": "home",
                "category": "home",
                "path": "home.png",
                "exists": True,
                "renderer": "provider",
                "render_metadata_path": "home.png.render.json",
                "sha256": "unique",
            }
        ]
        gate = run_pipeline.build_production_visual_gate(entries, assets, [])
        self.assertEqual(gate["status"], "blocked")
        self.assertEqual(gate["unapproved_assets"], [{"name": "home", "status": "generated"}])

    def test_blocked_global_gate_forces_seed_diagnostic(self) -> None:
        self._exercise_seed(
            gate={
                "status": "blocked",
                "production_visual_authority": False,
                "promotion_allowed": False,
            },
            expected_eligible=False,
        )

    def test_eligible_global_gate_allows_provider_approved_seed(self) -> None:
        self._exercise_seed(
            gate={
                "status": "eligible",
                "production_visual_authority": True,
                "promotion_allowed": True,
            },
            expected_eligible=True,
        )

    def _exercise_seed(self, gate: dict[str, object], expected_eligible: bool) -> None:
        old_base = create_firebase_seed.BASE_DIR
        old_manifest = create_firebase_seed.MANIFEST_PATH
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                asset = root / "assets" / "home.png"
                asset.parent.mkdir(parents=True)
                asset.write_bytes(b"provider-image")
                asset.with_suffix(".png.render.json").write_text(
                    json.dumps({"renderer": "provider", "attempt": 1}) + "\n",
                    encoding="utf-8",
                )
                manifest = [
                    {
                        "name": "home",
                        "category": "home",
                        "prompt": "home",
                        "sizes": [1],
                        "alpha": False,
                        "status": "approved",
                        "path_template": "assets/home.png",
                        "renderer": "provider",
                    }
                ]
                manifest_path = root / "manifest.json"
                manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                create_firebase_seed.BASE_DIR = root
                create_firebase_seed.MANIFEST_PATH = manifest_path

                seed = create_firebase_seed.make_seed(gate)
                self.assertEqual(seed["productionEligible"], expected_eligible)
                self.assertEqual(seed["productionGateEligible"], expected_eligible)
                self.assertEqual(seed["records"][0]["productionEligible"], expected_eligible)
                self.assertTrue(seed["records"][0]["renderProvenanceKnown"])
                self.assertEqual(
                    seed["usagePolicy"],
                    "production-import-allowed"
                    if expected_eligible
                    else "diagnostic-only-do-not-promote",
                )
        finally:
            create_firebase_seed.BASE_DIR = old_base
            create_firebase_seed.MANIFEST_PATH = old_manifest


if __name__ == "__main__":
    unittest.main()
