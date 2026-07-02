"""Run the V1 asset production cycle with targeted retry rounds."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import create_firebase_seed
import create_preview
import export_assets
import export_spatial_handoff
import render_v1_round
import score_v1_assets
import validate_assets
import validate_manifest

BASE_DIR = Path(__file__).resolve().parent
RECEIPT_PATH = BASE_DIR / "forge_receipt.json"


def env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def write_blocked_receipt(*, round_number: int, error: str, rounds: list[dict]) -> None:
    receipt = {
        "schemaVersion": "1.2.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "blocked-billing",
        "blockedRound": round_number,
        "errorCode": "billing_hard_limit_reached",
        "error": error,
        "rounds": rounds,
        "resolution": "Restore API billing/credits for the organization or project that owns the GitHub Actions image-renderer key, then rerun V1 AAA Asset Forge.",
    }
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    max_rounds = env_int("ASSET_FORGE_MAX_ROUNDS", 3)
    require_provider = os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER", "1") == "1"
    os.environ["ASSET_QUALITY_REQUIRE_PROVIDER"] = "1" if require_provider else "0"

    manifest_errors = validate_manifest.validate_manifest()
    if manifest_errors:
        for error in manifest_errors:
            print(f"MANIFEST_ERROR {error}")
        return 1

    rounds = []
    passed = False
    final_quality_exit = 4

    for round_number in range(1, max_rounds + 1):
        print(f"=== V1 ASSET ROUND {round_number}/{max_rounds} ===")
        try:
            generation = render_v1_round.render_round(round_number)
        except RuntimeError as exc:
            message = str(exc)
            if "billing_hard_limit_reached" in message or "Billing hard limit has been reached" in message:
                write_blocked_receipt(round_number=round_number, error=message, rounds=rounds)
                print("::error title=V1 forge blocked by API billing::The image-provider key reached its billing hard limit. Restore billing for the API organization/project tied to the GitHub secret, then rerun this workflow.")
                print(f"FORGE_RECEIPT={RECEIPT_PATH}")
                return 6
            raise

        validation_errors = validate_assets.validate()
        quality_exit = score_v1_assets.main()
        rounds.append({
            "round": round_number,
            "generation": generation,
            "validationErrors": validation_errors,
            "qualityExit": quality_exit,
        })
        final_quality_exit = quality_exit
        if not validation_errors and quality_exit == 0:
            passed = True
            break
        print("The next round will render entries listed in upgrade_feedback.json.")

    if not passed:
        receipt = {
            "schemaVersion": "1.2.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "needs-upgrade",
            "rounds": rounds,
            "qualityReport": "quality_report.json",
            "upgradeFeedback": "upgrade_feedback.json",
        }
        RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(f"V1 asset cycle needs another art pass after {max_rounds} round(s).")
        print(f"FORGE_RECEIPT={RECEIPT_PATH}")
        return final_quality_exit or 4

    create_preview.main()
    create_firebase_seed.main()
    asset_pack = export_assets.export()
    export_spatial_handoff.main()

    handoff_manifest = BASE_DIR / "spatial_handoff" / "assets" / "urai" / "final" / "manifests" / "asset-factory-spatial-handoff.json"
    handoff = json.loads(handoff_manifest.read_text(encoding="utf-8"))
    if handoff.get("missing"):
        print(f"Spatial handoff has {handoff['missing']} missing asset(s).")
        return 5

    receipt = {
        "schemaVersion": "1.2.0",
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
    print("V1 asset cycle passed.")
    print(f"FORGE_RECEIPT={RECEIPT_PATH}")
    print(f"SPATIAL_HANDOFF={BASE_DIR / 'spatial_handoff'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
