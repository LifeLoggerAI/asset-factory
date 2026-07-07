#!/usr/bin/env python3
"""Convert a passed V1 checkpoint receipt into the canonical versioned contract."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import canonical_release_manifests
import validate_manifest

BASE = Path(__file__).resolve().parent
CATALOG = BASE / "canonical_version_catalog.json"


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return value


def required_text(mapping: dict[str, Any], key: str, context: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: missing required {key}")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest_file(path: Path, expected: int, context: str) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError(f"{context}: manifest must be a JSON asset list")
    errors = validate_manifest.validate_manifest_entries(value)
    if errors:
        raise ValueError(f"{context}: manifest is invalid: {errors[:10]}")
    if len(value) != expected:
        raise ValueError(f"{context}: expected {expected} assets, found {len(value)}")
    return value


def receipt_manifest(config: dict[str, Any], receipt: dict[str, Any], expected: int) -> Path | None:
    manifest_value = receipt.get("manifest")
    if receipt.get("version") != "v1" or not isinstance(manifest_value, str) or not manifest_value.strip():
        return None

    configured_manifest = required_text(config, "manifest", "v1")
    expected_target = (BASE / configured_manifest).resolve()
    candidate = (BASE / manifest_value).resolve()
    try:
        candidate.relative_to(BASE.resolve())
    except ValueError as error:
        raise ValueError("V1 receipt manifest escapes image_asset_generator") from error
    if candidate != expected_target:
        raise ValueError(f"V1 receipt manifest mismatch: expected {expected_target}, got {candidate}")
    if not candidate.is_file():
        raise ValueError(f"V1 receipt manifest is missing: {candidate}")

    expected_sha = receipt.get("manifestSha256")
    if not isinstance(expected_sha, str) or len(expected_sha) != 64:
        raise ValueError("V1 receipt manifestSha256 is missing or malformed")
    try:
        int(expected_sha, 16)
    except ValueError as error:
        raise ValueError("V1 receipt manifestSha256 is not hexadecimal") from error
    if sha256(candidate) != expected_sha.lower():
        raise ValueError("V1 receipt manifest SHA-256 does not match the forged manifest")

    validate_manifest_file(candidate, expected, "V1 forged manifest")
    return candidate


def materialize_canonical_manifest(
    config: dict[str, Any],
    receipt: dict[str, Any],
    expected: int,
) -> Path:
    forged_manifest = receipt_manifest(config, receipt, expected)
    if forged_manifest is not None:
        return forged_manifest

    active_manifest = BASE / "manifest.json"
    active_entries = validate_manifest_file(active_manifest, expected, "V1 checkpoint manifest")
    configured_manifest = required_text(config, "manifest", "v1")
    prefix = required_text(config, "assetPrefix", "v1")
    target = canonical_release_manifests.write(
        "v1",
        Path(configured_manifest).name,
        canonical_release_manifests.normalize_v1(active_entries),
        expected,
        prefix,
    )
    expected_target = (BASE / configured_manifest).resolve()
    if target.resolve() != expected_target:
        raise ValueError(
            f"V1 canonical manifest target mismatch: expected {expected_target}, wrote {target.resolve()}"
        )
    validate_manifest_file(target, expected, "V1 materialized manifest")
    return target


def main() -> int:
    catalog = load_object(CATALOG)
    versions = catalog.get("versions")
    if not isinstance(versions, dict) or not isinstance(versions.get("v1"), dict):
        raise ValueError("Canonical catalog does not define v1")
    config = versions["v1"]

    expected = config.get("expectedOutputs")
    if isinstance(expected, bool) or not isinstance(expected, int) or expected <= 0:
        raise ValueError("V1 expectedOutputs must be a positive integer")

    receipt_path = BASE / "forge_receipt.json"
    quality_path = BASE / "quality_report.json"
    receipt = load_object(receipt_path)
    if receipt.get("status") != "passed" or receipt.get("missing") != 0:
        raise ValueError("V1 checkpoint receipt is not passed and complete")

    for count_key in ("expectedOutputs", "ready", "generated", "completed"):
        count = receipt.get(count_key)
        if count is not None and count != expected:
            raise ValueError(f"V1 checkpoint receipt {count_key} mismatch")

    if not quality_path.is_file():
        raise ValueError("V1 quality report is missing")

    manifest = materialize_canonical_manifest(config, receipt, expected)
    receipt.update({
        "version": "v1",
        "versionLabel": required_text(config, "label", "v1"),
        "proofProfile": required_text(config, "proofProfile", "v1"),
        "targetRepo": required_text(config, "targetRepo", "v1"),
        "requiresSpatialWiring": bool(config.get("requiresSpatialWiring")),
        "forgeExitCode": 0,
        "manifest": str(manifest.relative_to(BASE)),
        "manifestSha256": sha256(manifest),
        "expectedOutputs": expected,
    })

    payload = json.dumps(receipt, indent=2) + "\n"
    receipt_path.write_text(payload, encoding="utf-8")
    (BASE / "forge_receipt_v1.json").write_text(payload, encoding="utf-8")
    shutil.copy2(quality_path, BASE / "quality_report_v1.json")

    feedback = BASE / "upgrade_feedback.json"
    if feedback.exists():
        shutil.copy2(feedback, BASE / "upgrade_feedback_v1.json")

    print("Validated the forged V1 manifest or materialized a fresh checkpoint manifest, then normalized receipts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
