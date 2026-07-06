#!/usr/bin/env python3
"""Convert a passed V1 checkpoint receipt into the canonical versioned contract."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent
CATALOG = BASE / "canonical_version_catalog.json"


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    catalog = load_object(CATALOG)
    versions = catalog.get("versions")
    if not isinstance(versions, dict) or not isinstance(versions.get("v1"), dict):
        raise ValueError("Canonical catalog does not define v1")
    config = versions["v1"]

    expected = config.get("expectedOutputs")
    if isinstance(expected, bool) or not isinstance(expected, int) or expected <= 0:
        raise ValueError("V1 expectedOutputs must be a positive integer")

    manifest_value = config.get("manifest")
    if not isinstance(manifest_value, str) or not manifest_value.strip():
        raise ValueError("V1 catalog entry is missing manifest")
    manifest = BASE / manifest_value
    manifest_entries = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(manifest_entries, list) or len(manifest_entries) != expected:
        raise ValueError(f"V1 manifest must contain exactly {expected} entries")

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

    receipt.update({
        "version": "v1",
        "versionLabel": config.get("label"),
        "proofProfile": config.get("proofProfile"),
        "targetRepo": config.get("targetRepo"),
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

    print("Normalized V1 checkpoint receipt for canonical certification.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
