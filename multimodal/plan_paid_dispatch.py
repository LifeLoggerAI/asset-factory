from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
REGISTRY = ROOT / "provider-registry.json"
OUT = ROOT / "paid-dispatch-plan.json"
PAID_LANES = {"visual", "3d", "audio", "film"}
COMPLETE = {"certified", "removed-from-scope"}


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    head = os.environ.get("ASSET_FACTORY_HEAD_SHA") or manifest["sourceShas"]["assetFactoryHead"]
    missing = [
        asset for asset in manifest["assets"]
        if asset["lane"] in PAID_LANES and asset["currentStatus"] not in COMPLETE
    ]
    by_lane: dict[str, list[str]] = {}
    for asset in missing:
        by_lane.setdefault(asset["lane"], []).append(asset["assetId"])
    providers = {
        item["name"]: item for item in registry["providers"]
        if item.get("paid") and item.get("runtimeStatus") == "implemented-http-runtime"
    }
    selected = {
        "visual": {"provider": "openai", "model": "gpt-image-1.5", "maxCalls": 639},
        "audio": {"provider": "openai", "model": "gpt-4o-mini-tts", "maxCalls": 5},
        "3d": {"provider": "deterministic-spatial-forge", "model": "repository-locked", "maxCalls": 0},
        "film": {"provider": "deterministic-ffmpeg", "model": "repository-locked", "maxCalls": 0},
    }
    if selected["visual"]["provider"] not in providers or selected["audio"]["provider"] not in providers:
        raise SystemExit("selected paid provider runtime is not implemented")
    plan = {
        "schemaVersion": "1.1.0",
        "approvalId": "urai-multimodal-2026-07-11",
        "dispatchAuthorized": True,
        "authorizedBranchSha": head,
        "missingOnlyCount": len(missing),
        "missingByLane": {lane: len(ids) for lane, ids in sorted(by_lane.items())},
        "assetIds": sorted(asset["assetId"] for asset in missing),
        "selectedExecution": selected,
        "budget": {
            "maxProviderCalls": 650,
            "maxCostPerAttemptUsd": 1.50,
            "maxTotalExposureUsd": 1200.00,
            "contingencyUsd": 300.00,
            "absoluteCeilingUsd": 1500.00,
            "retryLimitPerAsset": 3,
        },
        "stopConditions": [
            "aggregate exposure reaches 1200 USD",
            "any asset reaches three failed attempts",
            "provider terms or commercial rights become unknown",
            "identity, voice, likeness, or private-life input is detected",
            "checksum, decode, quality, or promotion gate fails",
        ],
        "safety": {
            "providerCallsMadeByPlanner": 0,
            "costUsedByPlannerUsd": 0,
            "certifiedAssetsExcluded": True,
            "duplicatePaidDispatchProhibited": True,
            "voiceCloningProhibited": True,
            "privateLifeDataProhibited": True,
        },
    }
    OUT.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"dispatchAuthorized": True, "missingOnlyCount": len(missing), "budget": plan["budget"]}, indent=2))


if __name__ == "__main__":
    main()
