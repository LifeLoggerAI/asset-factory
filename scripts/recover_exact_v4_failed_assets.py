#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_exact_version_assets as generator  # noqa: E402

EXPECTED_FAILED = [
    "v4_comfort_recenter_marker",
    "v4_comfort_teleport_marker",
    "v4_mobile_android_adaptive_icon",
    "v4_mobile_ios_app_icon",
    "v4_mobile_pwa_icon_set",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--authorization", type=Path, required=True)
    parser.add_argument("--retained-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()

    auth = json.loads(args.authorization.read_text())
    if auth.get("schemaVersion") != "1.0.0":
        raise SystemExit("invalid authorization schema")
    if auth.get("programAuthority") != "LifeLoggerAI/asset-factory#206":
        raise SystemExit("invalid program authority")
    if auth.get("sourceRunId") != 30543824770 or auth.get("sourceArtifactId") != 8763242401:
        raise SystemExit("retained V4 source identity drift")
    if auth.get("targetNames") != EXPECTED_FAILED:
        raise SystemExit("retry target set drift")
    if auth.get("maxProviderCalls") != 10 or str(auth.get("maxCostUsd")) != "10.00":
        raise SystemExit("retry budget drift")
    if auth.get("promotionAuthorized") is not False or auth.get("deploymentAuthorized") is not False:
        raise SystemExit("retry marker cannot authorize promotion or deployment")

    retained_root = args.retained_root.resolve()
    retained_receipt = retained_root / "artifacts/exact-paid/v4/v4-generation-receipt.json"
    retained_budget = retained_root / "artifacts/budget/v4-paid-request-state.json"
    if not retained_receipt.is_file() or not retained_budget.is_file():
        raise SystemExit("retained V4 evidence missing")
    retained = json.loads(retained_receipt.read_text())
    if retained.get("status") != "failed" or retained.get("generated") != 39:
        raise SystemExit("unexpected retained V4 receipt state")
    if retained.get("failedNames") != EXPECTED_FAILED:
        raise SystemExit("retained failed-name set drift")
    if retained.get("providerCallsExecuted") != 44 or str(retained.get("reservedEstimatedCostUsd")) != "44.00":
        raise SystemExit("retained V4 budget drift")

    retained_records = {record["name"]: record for record in retained["assets"]}
    passing_names = sorted(name for name, record in retained_records.items() if record.get("status") == "passed")
    if len(passing_names) != 34:
        raise SystemExit(f"expected 34 retained V4 passes, found {len(passing_names)}")

    output_root = args.output_root.resolve()
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True)
    retained_runtime = retained_receipt.parent / "runtime"
    if not retained_runtime.is_dir():
        raise SystemExit("retained V4 runtime tree missing")
    shutil.copytree(retained_runtime, output_root / "runtime")

    manifest_path = generator.canonical_release_manifests.build("v4")
    entries = json.loads(manifest_path.read_text())
    by_name = {entry["name"]: entry for entry in entries}
    repaired_records = []
    for name in EXPECTED_FAILED:
        record = generator.generate_one(by_name[name], output_root, 2)
        repaired_records.append(record)
        if record.get("status") != "passed":
            raise SystemExit(f"retry remained noncompliant: {name}")

    combined = []
    repaired = {record["name"]: record for record in repaired_records}
    for entry in entries:
        name = entry["name"]
        record = repaired.get(name) or retained_records.get(name)
        if not record or record.get("status") != "passed":
            raise SystemExit(f"combined V4 record is not passed: {name}")
        runtime_path = output_root / record["runtimeFile"]
        if not runtime_path.is_file():
            raise SystemExit(f"combined V4 runtime file missing: {runtime_path}")
        if sha256_file(runtime_path) != record["technical"]["sha256"]:
            raise SystemExit(f"combined V4 runtime hash mismatch: {name}")
        combined.append(record)

    exact_duplicates, near_duplicates = generator.duplicate_evidence(combined)
    if exact_duplicates:
        raise SystemExit(f"combined V4 exact duplicates: {exact_duplicates}")
    ledger = generator.paid_request_guard.snapshot()
    if ledger["providerCallsExecuted"] > 10 or float(ledger["reservedEstimatedCostUsd"]) > 10.0:
        raise SystemExit("retry exceeded bounded authorization")

    receipt = {
        "schemaVersion": "1.0.0",
        "programAuthority": "LifeLoggerAI/asset-factory#206",
        "authorizationMarker": str(args.authorization),
        "authorizationSha256": sha256_file(args.authorization),
        "version": "v4",
        "sourceRunId": 30543824770,
        "sourceArtifactId": 8763242401,
        "retainedPassed": 34,
        "retriedNames": EXPECTED_FAILED,
        "generated": 39,
        "passed": 39,
        "failed": 0,
        "failedNames": [],
        "provider": "openai",
        "providerCallsExecutedThisRetry": ledger["providerCallsExecuted"],
        "reservedEstimatedCostUsdThisRetry": ledger["reservedEstimatedCostUsd"],
        "providerCallsExecutedCumulativeV4": 44 + int(ledger["providerCallsExecuted"]),
        "reservedEstimatedCostUsdCumulativeV4": f"{44.0 + float(ledger['reservedEstimatedCostUsd']):.2f}",
        "exactDuplicateGroups": [],
        "nearDuplicatePairs": near_duplicates,
        "promotionAuthorized": False,
        "deploymentAuthorized": False,
        "status": "passed",
        "assets": combined,
    }
    raw = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode()
    receipt["receiptSha256"] = hashlib.sha256(raw).hexdigest()
    (output_root / "v4-generation-receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps({key: receipt[key] for key in ("status", "generated", "passed", "failed", "providerCallsExecutedThisRetry", "reservedEstimatedCostUsdThisRetry")}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
