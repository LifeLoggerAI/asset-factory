#!/usr/bin/env python3
"""Validate a provider-backed handoff and certify it only after rights and human review."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
CATALOG = BASE / "canonical_version_catalog.json"
HANDOFF_ROOT = BASE / "spatial_handoff"
RIGHTS_REPORT = ROOT / "multimodal" / "rights-validation-report.json"
APPROVAL_ROOT = ROOT / "creative-review" / "approvals"
SUPPORTED_RIGHTS_REPORT_SCHEMAS = {"1.1.0", "1.2.0"}


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return value


def load_asset_list(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise ValueError(f"Expected JSON asset list: {path}")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def required_text(mapping: dict[str, Any], key: str, context: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: missing required {key}")
    return value.strip()


def positive_integer(value: Any, context: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{context}: expected a positive integer")
    return value


def valid_sha(value: object, length: int = 40) -> bool:
    return isinstance(value, str) and len(value) == length and all(char in "0123456789abcdef" for char in value.lower())


def current_head_sha() -> str:
    value = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip().lower()
    if not valid_sha(value):
        raise ValueError("Unable to resolve an exact Asset Factory HEAD SHA")
    return value


def safe_handoff_target(canonical: str) -> Path:
    if canonical.startswith("/"):
        raise ValueError(f"Absolute canonical path is forbidden: {canonical}")
    parts = canonical.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError(f"Unsafe canonical path: {canonical}")

    root = HANDOFF_ROOT.resolve()
    target = (HANDOFF_ROOT / canonical).resolve()
    try:
        target.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Canonical path escapes handoff root: {canonical}") from error
    return target


def validate_promotion_clearance(
    version: str,
    handoff_path: Path,
    assets: list[dict[str, Any]],
    approval_path: Path,
) -> dict[str, Any]:
    if not RIGHTS_REPORT.is_file():
        raise ValueError("Promotion clearance requires multimodal/rights-validation-report.json")
    rights = load_object(RIGHTS_REPORT)
    if rights.get("schemaVersion") not in SUPPORTED_RIGHTS_REPORT_SCHEMAS or rights.get("structurallyValid") is not True:
        raise ValueError("Rights validation report is missing or unsupported")
    if rights.get("promotionAllowed") is not True or rights.get("rightsReady") is not True:
        blockers = rights.get("blockingRecordIds", [])
        raise ValueError(f"Rights and consent remain blocked: {blockers}")
    ledger_sha = required_text(rights, "ledgerSha256", "rights report")
    if not valid_sha(ledger_sha, 64):
        raise ValueError("Rights report contains an invalid ledger SHA-256")

    if not approval_path.is_file():
        raise ValueError(f"Human creative approval receipt is required: {approval_path}")
    approval = load_object(approval_path)
    if approval.get("schemaVersion") != "1.0.0":
        raise ValueError("Unsupported creative approval schema")
    if approval.get("version") != version or approval.get("status") != "approved":
        raise ValueError("Creative approval does not approve this exact version")
    if approval.get("humanReview") is not True or approval.get("reviewerType") != "human":
        raise ValueError("Creative approval must explicitly record human review")
    required_text(approval, "reviewer", "creative approval")
    required_text(approval, "decisionNotes", "creative approval")
    reviewed_at = required_text(approval, "reviewedAt", "creative approval")
    try:
        datetime.fromisoformat(reviewed_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("creative approval reviewedAt must be ISO-8601") from error

    head_sha = current_head_sha()
    if approval.get("assetFactoryHeadSha") != head_sha:
        raise ValueError("Creative approval is not bound to the current Asset Factory head")
    if approval.get("handoffManifestSha256") != sha256(handoff_path):
        raise ValueError("Creative approval is not bound to the exact handoff manifest")
    if approval.get("rightsLedgerSha256") != ledger_sha:
        raise ValueError("Creative approval is not bound to the validated rights ledger")

    approved_assets = approval.get("approvedAssets")
    if not isinstance(approved_assets, list):
        raise ValueError("Creative approval approvedAssets must be a list")
    approved_map: dict[str, str] = {}
    for item in approved_assets:
        if not isinstance(item, dict):
            raise ValueError("Creative approval contains a malformed asset entry")
        canonical = required_text(item, "canonicalPath", "creative approval asset")
        digest = required_text(item, "sha256", f"creative approval asset {canonical}").lower()
        if not valid_sha(digest, 64) or canonical in approved_map:
            raise ValueError(f"Invalid or duplicate creative approval asset: {canonical}")
        approved_map[canonical] = digest

    expected_map = {
        required_text(asset, "canonicalPath", f"{version} handoff asset"): required_text(
            asset, "sha256", f"{version} handoff asset"
        ).lower()
        for asset in assets
    }
    if approved_map != expected_map:
        raise ValueError("Creative approval asset hashes do not exactly match the handoff")

    return {
        "rightsReport": str(RIGHTS_REPORT.relative_to(ROOT)),
        "rightsReportSha256": sha256(RIGHTS_REPORT),
        "rightsLedgerSha256": ledger_sha,
        "creativeReviewReceipt": str(approval_path.relative_to(ROOT)),
        "creativeReviewReceiptSha256": sha256(approval_path),
        "reviewer": approval["reviewer"],
        "reviewedAt": reviewed_at,
        "assetFactoryHeadSha": head_sha,
    }


def validate(version: str, require_promotion_clearance: bool, approval_path: Path | None = None) -> Path:
    catalog = load_object(CATALOG)
    versions = catalog.get("versions")
    if not isinstance(versions, dict) or version not in versions:
        raise ValueError(f"Unsupported canonical version: {version}")

    config = versions[version]
    if not isinstance(config, dict):
        raise ValueError(f"Invalid catalog entry for {version}")

    expected = positive_integer(config.get("expectedOutputs"), f"{version}/expectedOutputs")
    prefix = required_text(config, "assetPrefix", version).rstrip("/") + "/"
    manifest_path = BASE / required_text(config, "manifest", version)
    receipt_path = BASE / f"forge_receipt_{version}.json"
    quality_path = BASE / f"quality_report_{version}.json"

    if version == "v1":
        import normalize_v1_checkpoint_receipt

        normalize_v1_checkpoint_receipt.main()

    entries = load_asset_list(manifest_path)
    if len(entries) != expected:
        raise ValueError(f"{version}: expected {expected} manifest entries, found {len(entries)}")

    receipt = load_object(receipt_path)
    if receipt.get("version") != version:
        raise ValueError(f"{version}: receipt version mismatch")
    if receipt.get("status") != "passed" or receipt.get("forgeExitCode") != 0:
        raise ValueError(f"{version}: forge receipt is not passed")
    if receipt.get("expectedOutputs") != expected:
        raise ValueError(f"{version}: receipt expectedOutputs mismatch")

    quality = load_object(quality_path)
    quality_assets = quality.get("assets")
    if not isinstance(quality_assets, list) or len(quality_assets) != expected:
        raise ValueError(f"{version}: quality report must contain {expected} assets")
    failures = [
        item.get("name") if isinstance(item, dict) else "<malformed>"
        for item in quality_assets
        if not isinstance(item, dict) or item.get("status") != "passed"
    ]
    if failures:
        raise ValueError(f"{version}: quality failures: {failures[:10]}")

    handoff_path = HANDOFF_ROOT / "assets/urai/final/manifests" / f"{version}-asset-factory-spatial-handoff.json"
    generic_path = HANDOFF_ROOT / "assets/urai/final/manifests/asset-factory-spatial-handoff.json"
    handoff = load_object(handoff_path)
    assets = handoff.get("assets")

    if handoff.get("schemaVersion") != "3.0.0" or handoff.get("version") != version:
        raise ValueError(f"{version}: invalid handoff identity")
    if handoff.get("expectedOutputs") != expected:
        raise ValueError(f"{version}: handoff expectedOutputs mismatch")
    if handoff.get("ready") != expected or handoff.get("missing") != 0:
        raise ValueError(f"{version}: handoff is not complete")
    if not isinstance(assets, list) or len(assets) != expected:
        raise ValueError(f"{version}: handoff must contain {expected} assets")
    if sha256(generic_path) != sha256(handoff_path):
        raise ValueError(f"{version}: generic and versioned handoff manifests differ")

    names: set[str] = set()
    paths: set[str] = set()
    for raw_asset in assets:
        if not isinstance(raw_asset, dict):
            raise ValueError(f"{version}: handoff asset must be an object")

        name = required_text(raw_asset, "name", version)
        canonical = required_text(raw_asset, "canonicalPath", f"{version}/{name}")
        if name != name.strip() or name in names or canonical in paths:
            raise ValueError(f"{version}: duplicate or untrimmed handoff name/path")
        names.add(name)
        paths.add(canonical)

        if raw_asset.get("status") != "ready" or raw_asset.get("renderer") != "provider":
            raise ValueError(f"{version}/{name}: asset is not provider-ready")
        if not canonical.startswith(prefix):
            raise ValueError(f"{version}/{name}: canonical path is outside {prefix}")

        expected_bytes = positive_integer(raw_asset.get("bytes"), f"{version}/{name}/bytes")
        expected_sha = raw_asset.get("sha256")
        if not valid_sha(expected_sha, 64):
            raise ValueError(f"{version}/{name}: invalid sha256 receipt")

        target = safe_handoff_target(canonical)
        if not target.is_file():
            raise ValueError(f"{version}/{name}: missing handoff file {target}")
        if target.stat().st_size != expected_bytes:
            raise ValueError(f"{version}/{name}: byte count mismatch")
        if sha256(target) != str(expected_sha).lower():
            raise ValueError(f"{version}/{name}: sha256 mismatch")

    clearance: dict[str, Any] | None = None
    if require_promotion_clearance:
        clearance = validate_promotion_clearance(
            version,
            handoff_path,
            assets,
            approval_path or APPROVAL_ROOT / f"{version}.json",
        )

    result = {
        "schemaVersion": "1.1.0",
        "version": version,
        "status": "certified" if clearance else "technically-validated",
        "certified": bool(clearance),
        "promotionEligible": bool(clearance),
        "expectedOutputs": expected,
        "ready": expected,
        "missing": 0,
        "manifest": str(manifest_path.relative_to(BASE)),
        "manifestSha256": sha256(manifest_path),
        "handoffManifest": str(handoff_path.relative_to(BASE)),
        "handoffManifestSha256": sha256(handoff_path),
        "proofProfile": config.get("proofProfile"),
        "targetRepo": config.get("targetRepo"),
        "clearance": clearance,
        "claimBoundary": (
            "Technical, rights, and exact-hash human creative review gates passed."
            if clearance
            else "Technical validation passed; rights and human creative approval are not certified."
        ),
    }
    output = BASE / f"dropin_receipt_{version}.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True, choices=("v1", "v2", "v3", "v4", "v5"))
    parser.add_argument("--require-promotion-clearance", action="store_true")
    parser.add_argument("--creative-approval", type=Path)
    args = parser.parse_args()
    validate(args.version, args.require_promotion_clearance, args.creative_approval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
