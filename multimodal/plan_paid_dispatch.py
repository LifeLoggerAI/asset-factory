from __future__ import annotations

import json
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
    providers = {item["name"]: item for item in registry["providers"]}

    missing = [
        asset for asset in manifest["assets"]
        if asset["lane"] in PAID_LANES and asset["currentStatus"] not in COMPLETE
    ]
    by_lane: dict[str, list[str]] = {}
    for asset in missing:
        by_lane.setdefault(asset["lane"], []).append(asset["assetId"])

    selectable = [
        name for name, provider in providers.items()
        if provider["paid"] and provider["status"] == "production-ready"
    ]
    plan = {
        "schemaVersion": "1.0.0",
        "dispatchAuthorized": False,
        "reason": "No exact bounded approval token is present; production paid adapters are not ready.",
        "sourceManifest": str(MANIFEST.relative_to(ROOT.parent)),
        "missingOnlyCount": len(missing),
        "missingByLane": {lane: len(ids) for lane, ids in sorted(by_lane.items())},
        "assetIds": sorted(asset["assetId"] for asset in missing),
        "productionReadyPaidProviders": selectable,
        "approvalRequiredFields": [
            "provider", "branchSha", "assetIds", "calls", "retryLimit",
            "maxCostPerAttemptUsd", "maxTotalExposureUsd", "stopConditions"
        ],
        "safety": {
            "providerCallsMade": 0,
            "costUsedUsd": 0,
            "duplicatesProhibited": True,
            "certifiedAssetsExcluded": True,
            "placeholderAdaptersRejected": True
        }
    }
    OUT.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "dispatchAuthorized": False,
        "missingOnlyCount": len(missing),
        "missingByLane": plan["missingByLane"],
        "productionReadyPaidProviders": selectable
    }, indent=2))


if __name__ == "__main__":
    main()
