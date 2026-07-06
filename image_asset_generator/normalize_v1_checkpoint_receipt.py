#!/usr/bin/env python3
"""Convert a passed V1 checkpoint receipt into the canonical versioned contract."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parent
CATALOG = BASE / "canonical_version_catalog.json"


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    config = catalog["versions"]["v1"]
    manifest = BASE / config["manifest"]
    receipt_path = BASE / "forge_receipt.json"
    quality_path = BASE / "quality_report.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    if receipt.get("status") != "passed" or receipt.get("missing") != 0:
        raise ValueError("V1 checkpoint receipt is not passed and complete")
    receipt.update({
        "version": "v1",
        "versionLabel": config["label"],
        "proofProfile": config["proofProfile"],
        "targetRepo": config["targetRepo"],
        "requiresSpatialWiring": bool(config.get("requiresSpatialWiring")),
        "forgeExitCode": 0,
        "manifest": str(manifest.relative_to(BASE)),
        "manifestSha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
        "expectedOutputs": int(config["expectedOutputs"]),
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
