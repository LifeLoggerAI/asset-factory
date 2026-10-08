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
import validate_manifest


class ProductionVisualGateTests(unittest.TestCase):
    def test_empty_manifest_rejected_by_actual_validator(self) -> None:
        self.assertEqual(
            validate_manifest.validate_manifest_entries([]),
            ["manifest must contain at least one asset"],
        )

    def test_empty_manifest_and_outputs_have_no_production_authority(self) -> None:
        gate = run_pipeline.build_production_visual_gate([], [], [])
        self.assertEqual(gate["status"], "blocked")
        self.assertFalse(gate["production_visual_authority"])
        self.assertFalse(gate["promotion_allowed"])
        self.assertIn("manifest contains no assets", gate["reasons"])
        self.assertIn("no retained output assets", gate["reasons"])

    def test_approved_manifest_without_outputs_has_no_production_authority(self) -> None:
        gate = run_pipeline.build_production_visual_gate(
            [{"name": "home", "status": "approved"}], [], []
        )
        self.assertEqual(gate["status"], "blocked")
        self.assertFalse(gate["production_visual_authority"])
        self.assertFalse(gate["promotion_allowed"])

    def test_missing_output_blocks_without_relying_on_mechanical_errors(self) -> None:
        gate = run_pipeline.build_production_visual_gate(
            [{"name": "home", "status": "approved"}],
            [{"name": "home", "path": "home.png", "exists": False}],
            [],
        )
        self.assertEqual(gate["status"], "blocked")
        self.assertFalse(gate["production_visual_authority"])
        self.assertFalse(gate["promotion_allowed"])
        self.assertEqual(gate["missing_assets"], ["home.png"])

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

    def test_fabricated_eligible_dict_never_grants_production_import(self) -> None:
        self._exercise_seed(
            gate={
                "status": "eligible",
                "production_visual_authority": True,
                "promotion_allowed": True,
                "charges_reconciled": True,
                "independent_review_approved": True,
            },
            expected_eligible=False,
        )


    def test_provider_approved_unique_candidate_has_no_production_authority(self) -> None:
        gate = run_pipeline.build_production_visual_gate(
            [{"name": "home", "status": "approved"}],
            [{
                "name": "home", "path": "home.png", "exists": True,
                "renderer": "provider", "render_metadata_path": "home.png.render.json",
                "sha256": "a" * 64,
            }],
            [],
        )
        self.assertEqual(gate["candidate_status"], "eligible")
        self.assertTrue(gate["candidate_eligible"])
        self.assertEqual(gate["authority_scope"], "mechanical-candidate-only")
        self.assertEqual(gate["status"], "blocked")
        self.assertEqual(gate["production_admission_status"], "not-verified")
        self.assertFalse(gate["production_visual_authority"])
        self.assertFalse(gate["promotion_allowed"])
        self.assertTrue(any("final-charge" in reason for reason in gate["reasons"]))

    def test_current_mechanical_candidate_seed_is_never_an_import_authorization(self) -> None:
        self._exercise_seed(
            gate={
                "status": "blocked", "authority_scope": "mechanical-candidate-only",
                "candidate_status": "eligible", "candidate_eligible": True,
                "production_visual_authority": False, "promotion_allowed": False,
            },
            expected_eligible=False,
            expected_candidate=True,
        )

    def test_production_flags_cannot_replace_missing_candidate_gate(self) -> None:
        for gate in (None, {}, {"status": "eligible", "production_visual_authority": True, "promotion_allowed": True}):
            self._exercise_seed(gate, expected_eligible=False)

    def test_candidate_claim_does_not_make_missing_output_a_candidate(self) -> None:
        self._exercise_seed(
            gate={
                "authority_scope": "mechanical-candidate-only",
                "candidate_status": "eligible", "candidate_eligible": True,
            },
            expected_eligible=False,
            missing_output=True,
        )

    def _exercise_seed(
        self,
        gate: dict[str, object] | None,
        expected_eligible: bool,
        expected_candidate: bool = False,
        missing_output: bool = False,
    ) -> None:
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
                if missing_output:
                    asset.unlink()

                seed = create_firebase_seed.make_seed(gate)
                self.assertEqual(seed["productionEligible"], expected_eligible)
                self.assertEqual(seed["productionGateEligible"], expected_eligible)
                self.assertEqual(seed["records"][0]["productionEligible"], expected_eligible)
                self.assertTrue(seed["records"][0]["renderProvenanceKnown"])
                self.assertEqual(seed["productionCandidateEligible"], expected_candidate)
                self.assertEqual(seed["records"][0]["productionCandidateEligible"], expected_candidate)
                self.assertEqual(seed["productionAdmissionStatus"], "not-verified")
                self.assertEqual(seed["authorityScope"], "mechanical-candidate-only")
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
