from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
REGISTRY = ROOT / "provider-registry.json"
OUT = ROOT / "paid-dispatch-plan.json"
PAID_LANES = {"visual", "audio"}
DETERMINISTIC_LANES = {"3d", "film"}
INITIAL_DISPATCH_STATES = {"required", "planned"}
MAX_POLICY_EXPOSURE_CENTS = 20_000
MAX_UNIT_COST_CENTS = 30
RETRY_LIMIT_PER_ASSET = 3
ATOMIC_ONE_TIME_LEDGER_CONFIGURED = False


def valid_sha(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 40
        and all(char in "0123456789abcdef" for char in value)
    )


def positive_int_env(name: str) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return 0
    try:
        value = int(raw)
    except ValueError:
        return 0
    return value if value > 0 else 0


def parse_future_time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(timezone.utc)
    return parsed if parsed > datetime.now(timezone.utc) else None


def parse_asset_scope() -> list[str]:
    raw = os.environ.get("ASSET_FACTORY_PAID_ASSET_IDS", "").strip()
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return values


def has_existing_paid_progress(asset: dict[str, object]) -> bool:
    if asset.get("currentStatus") not in INITIAL_DISPATCH_STATES:
        return True
    if int(asset.get("attemptCount") or 0) > 0:
        return True
    return any(
        asset.get(field)
        for field in (
            "checksum",
            "providerJobId",
            "generatedAt",
            "generationRequest",
            "qualityReport",
            "artifactId",
            "artifactDigest",
        )
    )


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    head = os.environ.get("ASSET_FACTORY_HEAD_SHA", "").strip() or manifest["sourceShas"]["assetFactoryHead"]
    if not valid_sha(head):
        raise SystemExit("asset-factory head must be an exact lowercase full SHA")
    if manifest["sourceShas"].get("assetFactoryHead") != head:
        raise SystemExit("manifest assetFactoryHead does not match the exact planner head")

    paid_candidates = [
        asset
        for asset in manifest["assets"]
        if asset["lane"] in PAID_LANES and not has_existing_paid_progress(asset)
    ]
    eligible_by_id = {asset["assetId"]: asset for asset in paid_candidates}
    deterministic_pending = [
        asset["assetId"]
        for asset in manifest["assets"]
        if asset["lane"] in DETERMINISTIC_LANES
        and asset["currentStatus"] not in {"certified", "removed-from-scope"}
    ]

    providers = {
        item["name"]: item
        for item in registry["providers"]
        if item.get("paid") and item.get("runtimeStatus") == "implemented-http-runtime"
    }
    selected_execution = {
        "visual": {"provider": "openai", "model": "gpt-image-1.5"},
        "audio": {"provider": "openai", "model": "gpt-4o-mini-tts"},
    }
    if any(config["provider"] not in providers for config in selected_execution.values()):
        raise SystemExit("selected paid provider runtime is not implemented")

    enabled = os.environ.get("ASSET_FACTORY_ENABLE_PAID_MEDIA", "").strip() == "true"
    approval_id = os.environ.get("ASSET_FACTORY_PAID_APPROVAL_ID", "").strip()
    approval_sha = os.environ.get("ASSET_FACTORY_PAID_APPROVAL_SHA", "").strip()
    authorization_expires_at = os.environ.get("ASSET_FACTORY_PAID_AUTHORIZATION_EXPIRES_AT", "").strip()
    expiration = parse_future_time(authorization_expires_at)
    max_cost_cents = positive_int_env("ASSET_FACTORY_PAID_MAX_COST_CENTS")
    requested_scope = parse_asset_scope()

    blockers: list[str] = []
    if not ATOMIC_ONE_TIME_LEDGER_CONFIGURED:
        blockers.append("atomic one-time authorization and consumption ledger is not implemented")
    if not enabled:
        blockers.append("paid execution is not explicitly enabled")
    if not approval_id:
        blockers.append("approval ID is missing")
    if not valid_sha(approval_sha) or approval_sha != head:
        blockers.append("approval SHA must equal the exact Asset Factory head")
    if expiration is None:
        blockers.append("authorization expiry must be a future ISO-8601 timestamp")
    if max_cost_cents < 1 or max_cost_cents > MAX_POLICY_EXPOSURE_CENTS:
        blockers.append("approved cost ceiling must be between 1 and 20000 cents")
    if not requested_scope:
        blockers.append("an explicit non-empty asset ID scope is required")
    if len(requested_scope) != len(set(requested_scope)):
        blockers.append("asset ID scope contains duplicates")

    unknown_or_ineligible = sorted(set(requested_scope) - set(eligible_by_id))
    if unknown_or_ineligible:
        blockers.append(
            "asset scope contains unknown, already-started, generated, or otherwise ineligible assets: "
            + ", ".join(unknown_or_ineligible)
        )

    scoped_assets = [eligible_by_id[asset_id] for asset_id in requested_scope if asset_id in eligible_by_id]
    maximum_calls_by_scope = len(scoped_assets) * RETRY_LIMIT_PER_ASSET
    maximum_calls_by_cost = max_cost_cents // MAX_UNIT_COST_CENTS if max_cost_cents else 0
    bounded_calls_if_ledger_existed = min(maximum_calls_by_scope, maximum_calls_by_cost)
    if requested_scope and bounded_calls_if_ledger_existed < len(scoped_assets):
        blockers.append("approved cost ceiling cannot fund even one bounded attempt per selected asset")

    # This clean control-plane candidate intentionally cannot authorize paid dispatch.
    # Environment strings are planning inputs only and cannot substitute for an atomic,
    # one-time authorization/consumption record.
    dispatch_authorized = False
    by_lane: dict[str, list[str]] = {}
    for asset in scoped_assets:
        by_lane.setdefault(asset["lane"], []).append(asset["assetId"])

    plan = {
        "schemaVersion": "1.4.0",
        "approvalId": approval_id or None,
        "approvalSha": approval_sha or None,
        "authorizationExpiresAt": authorization_expires_at or None,
        "atomicLedgerConfigured": ATOMIC_ONE_TIME_LEDGER_CONFIGURED,
        "dispatchAuthorized": dispatch_authorized,
        "authorizationBlockers": blockers,
        "authorizedBranchSha": head,
        "eligibleUnstartedPaidAssets": len(paid_candidates),
        "scopedAssetCount": len(scoped_assets),
        "scopedByLane": {lane: len(ids) for lane, ids in sorted(by_lane.items())},
        "assetIds": requested_scope,
        "selectedExecution": selected_execution,
        "deterministicPending": {
            "count": len(deterministic_pending),
            "assetIds": sorted(deterministic_pending),
            "paidProviderCalls": 0,
        },
        "budget": {
            "maxProviderCalls": 0,
            "plannedProviderCalls": 0,
            "boundedCallsIfLedgerExisted": bounded_calls_if_ledger_existed,
            "maxCostPerAttemptUsd": MAX_UNIT_COST_CENTS / 100,
            "maxTotalExposureUsd": 0,
            "retryLimitPerAsset": RETRY_LIMIT_PER_ASSET,
            "singleCumulativeLedger": False,
        },
        "stopConditions": [
            "atomic one-time authorization and consumption ledger is unavailable",
            "aggregate exposure reaches the explicitly approved cost ceiling",
            "the exact asset scope is exhausted",
            "any asset reaches three failed quality rounds",
            "provider terms or commercial rights become unknown",
            "identity, voice, likeness, or private-life input is detected",
            "checksum, decode, quality, certification, or promotion gate fails",
            "authorization expiry is reached",
        ],
        "safety": {
            "providerCallsMadeByPlanner": 0,
            "costUsedByPlannerUsd": 0,
            "generatedOrPreviouslyAttemptedAssetsExcluded": True,
            "duplicatePaidDispatchProhibited": True,
            "environmentOnlyAuthorizationProhibited": True,
            "voiceCloningProhibited": True,
            "privateLifeDataProhibited": True,
        },
        "claimBoundary": (
            "Planning inputs were evaluated, but paid dispatch remains unauthorized until a separately reviewed atomic one-time authorization and consumption ledger exists."
        ),
    }
    OUT.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "dispatchAuthorized": dispatch_authorized,
                "eligibleUnstartedPaidAssets": len(paid_candidates),
                "scopedAssetCount": len(scoped_assets),
                "authorizationBlockers": blockers,
                "budget": plan["budget"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
