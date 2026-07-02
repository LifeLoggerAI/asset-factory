"""Autonomous V1 asset forge.

Runs provider generation, validation, measurable quality scoring, feedback-driven
regeneration, and Spatial handoff export. Production mode fails closed when the
provider is unavailable or assets remain below the measurable floor.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import create_firebase_seed
import create_preview
import export_assets
import export_spatial_handoff
import generate_assets
import score_assets
import validate_assets
import validate_manifest

BASE_DIR = Path(__file__).resolve().parent
RECEIPT_PATH = BASE_DIR / "forge_receipt.json"


def env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def main() -> int:
    max_rounds = env_int("ASSET_FORGE_MAX_ROUNDS", 3)
    require_provider = os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER", "1") == "1"
    os.environ["ASSET_QUALITY_REQUIRE_PROVIDER"] = "1" if require_provider else "0"
    os.environ["ASSET_RENDERER_FORCE"] = "1"

    manifest_errors = validate_manifest.validate_manifest()
    if manifest_errors:
        for error in manifest_errors:
            print(f"MANIFEST_FAIL {error}")
        return 1

    rounds = []
    final_status = "failed"
    final_quality_exit = 4

    for round_number in range(1, max_rounds + 1):
        print(f"=== V1 ASSET FORGE ROUND {round_number}/{max_rounds} ===")
        generate_assets.main()
        validation_errors = validate_assets.validate()
        quality_exit = score_assets.main()
        rounds.append(
            {
                "round": round_number,
                "validationErrors": validation_errors,
                "qualityExit": quality_exit,
            }
        )
        final_quality_exit = quality_exit

        if not validation_errors and quality_exit == 0:
            final_status = "passed"
            break

        print("Round rejected; upgrade_feedback.json will steer the next replacement pass.")

    if final_status != "passed":
        receipt = {
            "schemaVersion": "1.0.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "failed",
            "rounds": rounds,
            "qualityReport": "quality_report.json",
            "upgradeFeedback": "upgrade_feedback.json",
        }
        RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(f"V1 asset forge failed after {max_rounds} round(s).")
        print(f"FORGE_RECEIPT={RECEIPT_PATH}")
        return final_quality_exit or 4

    create_preview.main()
    create_firebase_seed.main()
    asset_pack = export_assets.export()
    export_spatial_handoff.main()

    handoff_manifest = (
        BASE_DIR
        / "spatial_handoff"
        / "assets"
        / "urai"
        / "final"
        / "manifests"
        / "asset-factory-spatial-handoff.json"
    )
    handoff = json.loads(handoff_manifest.read_text(encoding="utf-8"))
    if handoff.get("missing"):
        print(f"Spatial handoff still has {handoff['missing']} missing asset(s).")
        return 5

    receipt = {
        "schemaVersion": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "passed",
        "rounds": rounds,
        "assetPack": str(asset_pack.relative_to(BASE_DIR)),
        "spatialHandoff": str(handoff_manifest.relative_to(BASE_DIR)),
        "ready": handoff.get("ready"),
        "missing": handoff.get("missing"),
        "qualityReport": "quality_report.json",
    }
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print("V1 asset forge passed.")
    print(f"FORGE_RECEIPT={RECEIPT_PATH}")
    print(f"SPATIAL_HANDOFF={BASE_DIR / 'spatial_handoff'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
