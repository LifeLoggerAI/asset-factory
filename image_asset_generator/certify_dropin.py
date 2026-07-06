#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
HANDOFF = BASE / "spatial_handoff"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def certify(version: str) -> Path:
    config = load(BASE / "canonical_version_catalog.json")["versions"][version]
    expected = int(config["expectedOutputs"])
    prefix = str(config["assetPrefix"]).rstrip("/") + "/"
    manifest = BASE / config["manifest"]
    entries = load(manifest)
    if len(entries) != expected:
        raise ValueError(f"{version}: manifest count mismatch")

    receipt_file = BASE / f"forge_receipt_{version}.json"
    quality_file = BASE / f"quality_report_{version}.json"
    if version == "v1" and (not receipt_file.exists() or not quality_file.exists()):
        import normalize_v1_checkpoint_receipt
        normalize_v1_checkpoint_receipt.main()

    receipt = load(receipt_file)
    if receipt.get("version") != version or receipt.get("status") != "passed" or receipt.get("forgeExitCode") != 0 or receipt.get("expectedOutputs") != expected:
        raise ValueError(f"{version}: forge receipt failed")

    quality = load(quality_file)
    records = quality.get("assets")
    if not isinstance(records, list) or len(records) != expected or any(item.get("status") != "passed" for item in records):
        raise ValueError(f"{version}: quality receipt failed")

    versioned = HANDOFF / "assets/urai/final/manifests" / f"{version}-asset-factory-spatial-handoff.json"
    generic = HANDOFF / "assets/urai/final/manifests/asset-factory-spatial-handoff.json"
    handoff = load(versioned)
    assets = handoff.get("assets")
    if handoff.get("schemaVersion") != "3.0.0" or handoff.get("version") != version or handoff.get("expectedOutputs") != expected:
        raise ValueError(f"{version}: handoff identity failed")
    if handoff.get("ready") != expected or handoff.get("missing") != 0 or not isinstance(assets, list) or len(assets) != expected:
        raise ValueError(f"{version}: handoff incomplete")
    if generic.read_bytes() != versioned.read_bytes():
        raise ValueError(f"{version}: handoff manifests differ")

    names = set()
    paths = set()
    for asset in assets:
        name = asset.get("name")
        target_name = asset.get("canonicalPath")
        if not isinstance(name, str) or name in names or not isinstance(target_name, str) or target_name in paths:
            raise ValueError(f"{version}: duplicate or invalid asset record")
        names.add(name)
        paths.add(target_name)
        if asset.get("status") != "ready" or asset.get("renderer") != "provider" or not target_name.startswith(prefix) or ".." in target_name:
            raise ValueError(f"{version}/{name}: invalid provider record")
        target = HANDOFF / target_name
        if not target.is_file() or asset.get("bytes") != target.stat().st_size or asset.get("sha256") != sha(target):
            raise ValueError(f"{version}/{name}: file receipt mismatch")

    result = {
        "schemaVersion": "1.0.0",
        "version": version,
        "status": "certified",
        "expectedOutputs": expected,
        "ready": expected,
        "missing": 0,
        "manifestSha256": sha(manifest),
        "handoffManifestSha256": sha(versioned),
        "proofProfile": config.get("proofProfile"),
        "targetRepo": config.get("targetRepo"),
    }
    output = BASE / f"dropin_receipt_{version}.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True, choices=("v1", "v2", "v3", "v4", "v5"))
    certify(parser.parse_args().version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
