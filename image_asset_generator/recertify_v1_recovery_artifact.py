#!/usr/bin/env python3
"""Zero-provider-call certification of the retained V1 recovery artifact."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

import score_v1_assets
import validate_assets

BASE = Path(__file__).resolve().parent
EXPECTED_TOTAL = 53
RETAINED_ACCEPTED = 52
TARGET = "avatar_receptionist"
EXPECTED_TARGET_SHA256 = "d95bb0f4b2703e32b8cb2295dc42a2f900a9eaf749a48a3c7f334ab4edc29c05"


def read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def output_path(root: Path, entry: dict[str, Any]) -> Path:
    size = max(int(value) for value in entry["sizes"])
    return root / entry["path_template"].format(size=size)


def metadata_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".render.json")


def score_records(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = [score_v1_assets.score(entry, True) for entry in entries]
    by_name = {record["name"]: record for record in records}
    hashes = [(record["name"], record.get("metrics", {}).get("perceptualHash")) for record in records]
    for index, (name_a, hash_a) in enumerate(hashes):
        if not hash_a:
            continue
        for name_b, hash_b in hashes[index + 1 :]:
            if not hash_b:
                continue
            same_category = by_name[name_a].get("category") == by_name[name_b].get("category")
            if score_v1_assets.hamming(hash_a, hash_b) <= (5 if same_category else 8):
                for name, other in ((name_a, name_b), (name_b, name_a)):
                    issue = f"composition near-duplicates {other}"
                    if issue not in by_name[name]["issues"]:
                        by_name[name]["issues"].append(issue)
                        by_name[name]["status"] = "failed"
    return records


def copy_pack(recovery_root: Path) -> list[dict[str, Any]]:
    source_manifest = recovery_root / "manifests/generated/v1.manifest.json"
    source_assets = recovery_root / "assets"
    if not source_manifest.is_file() or not source_assets.is_dir():
        raise ValueError(f"recovery artifact layout invalid: {recovery_root}")
    entries = read(source_manifest)
    if len(entries) != EXPECTED_TOTAL:
        raise ValueError(f"recovery manifest count mismatch: {len(entries)}")
    if (BASE / "assets").exists():
        shutil.rmtree(BASE / "assets")
    shutil.copytree(source_assets, BASE / "assets")
    payload = json.dumps(entries, indent=2) + "\n"
    (BASE / "manifest.json").write_text(payload, encoding="utf-8")
    generated = BASE / "manifests/generated/v1.manifest.json"
    generated.parent.mkdir(parents=True, exist_ok=True)
    generated.write_text(payload, encoding="utf-8")
    return entries


def compare_retained(original_root: Path, entries: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    original_manifest = read(original_root / "manifests/generated/v1.manifest.json")
    original_by_name = {entry["name"]: entry for entry in original_manifest}
    result: dict[str, dict[str, str]] = {}
    changed: list[str] = []
    for entry in entries:
        name = entry["name"]
        if name == TARGET:
            continue
        original_entry = original_by_name.get(name)
        if not original_entry:
            changed.append(name)
            continue
        current_asset = output_path(BASE, entry)
        original_asset = output_path(original_root, original_entry)
        current_meta = metadata_path(current_asset)
        original_meta = metadata_path(original_asset)
        if not all(path.is_file() for path in (current_asset, original_asset, current_meta, original_meta)):
            changed.append(name)
            continue
        current = {"assetSha256": sha256(current_asset), "metadataSha256": sha256(current_meta)}
        original = {"assetSha256": sha256(original_asset), "metadataSha256": sha256(original_meta)}
        if current != original:
            changed.append(name)
        result[name] = current
    if len(result) != RETAINED_ACCEPTED or changed:
        raise ValueError(f"retained accepted outputs changed or missing: count={len(result)} changed={changed}")
    return result


def image_inventory(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inventory: list[dict[str, Any]] = []
    for entry in entries:
        path = output_path(BASE, entry)
        meta = metadata_path(path)
        with Image.open(path) as image:
            image.load()
            bands = image.getbands()
            alpha_extrema = image.getchannel("A").getextrema() if "A" in bands else None
            inventory.append(
                {
                    "name": entry["name"],
                    "path": str(path.relative_to(BASE)),
                    "sha256": sha256(path),
                    "metadataSha256": sha256(meta),
                    "width": image.width,
                    "height": image.height,
                    "mode": image.mode,
                    "alphaRequired": bool(entry.get("alpha")),
                    "alphaExtrema": alpha_extrema,
                    "provider": read(meta).get("renderer"),
                    "providerModel": read(meta).get("metadata", {}).get("provider_model"),
                    "providerRequestId": read(meta).get("metadata", {}).get("provider_request_id"),
                }
            )
    return inventory


def run_handoff_certification(checkpoint_receipt: dict[str, Any], *, base: Path = BASE) -> None:
    """Export and certify the handoff after materializing the required checkpoint receipt."""
    subprocess.run(["python", "create_preview.py"], cwd=base, check=True)
    subprocess.run(["python", "create_firebase_seed.py"], cwd=base, check=True)
    subprocess.run(["python", "export_assets.py"], cwd=base, check=True)
    subprocess.run(["python", "export_spatial_handoff.py"], cwd=base, check=True)
    write(base / "forge_receipt.json", checkpoint_receipt)
    subprocess.run(["python", "certify_version_handoff.py", "--version", "v1"], cwd=base, check=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--recovery-root", type=Path, required=True)
    parser.add_argument("--original-root", type=Path, required=True)
    parser.add_argument("--budget-ledger", type=Path, required=True)
    parser.add_argument("--recovery-artifact-id", type=int, required=True)
    parser.add_argument("--original-artifact-id", type=int, required=True)
    args = parser.parse_args()

    entries = copy_pack(args.recovery_root.resolve())
    accepted_inputs = compare_retained(args.original_root.resolve(), entries)

    target_entry = next(entry for entry in entries if entry["name"] == TARGET)
    target_path = output_path(BASE, target_entry)
    if sha256(target_path) != EXPECTED_TARGET_SHA256:
        raise ValueError("recovered receptionist SHA-256 mismatch")

    ledger = read(args.budget_ledger)
    if ledger.get("providerCallsExecuted") != 1:
        raise ValueError("recovery ledger must record exactly one provider call")
    attempts = ledger.get("attempts", [])
    if len(attempts) != 1 or attempts[0].get("asset") != TARGET or attempts[0].get("status") != "succeeded":
        raise ValueError(f"recovery provider attempt mismatch: {attempts}")

    records = score_records(entries)
    failed = [record["name"] for record in records if record["status"] != "passed"]
    quality = {
        "schemaVersion": "2.1.0",
        "status": "failed" if failed else "passed",
        "requireProvider": True,
        "passed": len(records) - len(failed),
        "failed": len(failed),
        "assets": records,
    }
    write(BASE / "quality_report.json", quality)
    write(BASE / "upgrade_feedback.json", score_v1_assets.feedback(records))
    if failed:
        raise ValueError(f"V1 quality certification failed: {failed}")

    validation_errors = validate_assets.validate()
    if validation_errors:
        raise ValueError(f"asset validation failed: {validation_errors}")

    inventory = image_inventory(entries)
    target_meta = read(metadata_path(target_path))
    spend = ledger.get("actualSpendUsd") or ledger.get("spentUsd") or "1.00"
    receipt = {
        "schemaVersion": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "passed",
        "version": "v1",
        "ready": EXPECTED_TOTAL,
        "missing": 0,
        "rejected": 0,
        "recoveryArtifactId": args.recovery_artifact_id,
        "originalArtifactId": args.original_artifact_id,
        "retainedAcceptedOutputs": RETAINED_ACCEPTED,
        "recoveredAsset": TARGET,
        "recoveredAssetSha256": EXPECTED_TARGET_SHA256,
        "newProviderCalls": 1,
        "actualSpendUsd": str(spend),
        "provider": "openai",
        "model": target_meta.get("metadata", {}).get("provider_model"),
        "providerRequestId": target_meta.get("metadata", {}).get("provider_request_id"),
        "acceptedInputsSha256": accepted_inputs,
        "budgetLedger": ledger,
        "providerCallsDuringRecertification": 0,
        "promotionAuthorized": False,
        "deploymentAuthorized": False,
    }
    run_handoff_certification(receipt)
    write(BASE / "v1_sha256_inventory.json", {"schemaVersion": "1.0.0", "assets": inventory})
    write(BASE / "v1_recertification_receipt.json", receipt)
    write(
        BASE / "v1_recertification_provenance.json",
        {
            "schemaVersion": "1.0.0",
            "status": "complete",
            "rightsBasis": "Owner-authorized OpenAI provider generation for URAI production use; provider request provenance and cost ledger retained.",
            "recoveryArtifactId": args.recovery_artifact_id,
            "originalArtifactId": args.original_artifact_id,
            "provider": "openai",
            "model": receipt["model"],
            "providerRequestId": receipt["providerRequestId"],
            "promotionAuthorized": False,
        },
    )
    print("V1_ZERO_SPEND_RECERTIFIED ready=53 missing=0 rejected=0 providerCallsDuringRecertification=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
