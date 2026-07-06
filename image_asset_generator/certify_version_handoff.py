#!/usr/bin/env python3
"""Certify one complete provider-backed version handoff before Spatial promotion."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent
CATALOG = BASE / "canonical_version_catalog.json"
HANDOFF_ROOT = BASE / "spatial_handoff"


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return value


def load_list(path: Path) -> list[dict[str, Any]]:
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
    return value


def certify(version: str) -> Path:
    catalog = load_object(CATALOG)
    versions = catalog.get("versions")
    if not isinstance(versions, dict) or version not in versions:
        raise ValueError(f"Unsupported canonical version: {version}")
    config = versions[version]
    if not isinstance(config, dict):
        raise ValueError(f"Invalid catalog entry for {version}")

    expected = int(config.get("expectedOutputs", 0))
    prefix = required_text(config, "assetPrefix", version).rstrip("/") + "/"
    manifest_path = BASE / required_text(config, "manifest", version)
    entries = load_list(manifest_path)
    if len(entries) != expected:
        raise ValueError(f"{version}: expected {expected} manifest entries, found {len(entries)}")

    receipt_path = BASE / f"forge_receipt_{version}.json"
    receipt = load_object(receipt_path)
    if receipt.get("version") != version:
        raise ValueError(f"{version}: receipt version mismatch")
    if receipt.get("status") != "passed" or receipt.get("forgeExitCode") != 0:
        raise ValueError(f"{version}: forge receipt is not passed")
    if receipt.get("expectedOutputs") != expected:
        raise ValueError(f"{version}: receipt expectedOutputs mismatch")

    quality_path = BASE / f"quality_report_{version}.json"
    quality = load_object(quality_path)
    quality_assets = quality.get("assets")
    if not isinstance(quality_assets, list) or len(quality_assets) != expected:
        raise ValueError(f"{version}: quality report must contain {expected} assets")
    failures = [item.get("name") for item in quality_assets if not isinstance(item, dict) or item.get("status") != "passed"]
    if failures:
        raise ValueError(f"{version}: quality failures: {failures[:10]}")

    handoff_path = HANDOFF_ROOT / "assets/urai/final/manifests" / f"{version}-asset-factory-spatial-handoff.json"
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

    names: set[str] = set()
    paths: set[str] = set()
    for raw_asset in assets:
        if not isinstance(raw_asset, dict):
            raise ValueError(f"{version}: handoff asset must be an object")
        name = required_text(raw_asset, "name", version)
        canonical = required_text(raw_asset, "canonicalPath", f"{version}/{name}")
        if name in names or canonical in paths:
            raise ValueError(f"{version}: duplicate handoff name or path")
        names.add(name)
        paths.add(canonical)
        if raw_asset.get("status") != "ready" or raw_asset.get("renderer") != "provider":
            raise ValueError(f"{version}/{name}: asset is not provider-ready")
        if not canonical.startswith(prefix) or ".." in canonical:
            raise ValueError(f"{version}/{name}: invalid canonical path")
        target = HANDOFF_ROOT / canonical
        if not target.is_file():
            raise ValueError(f"{version}/{name}: missing handoff file {target}")
        if raw_asset.get("bytes") != target.stat().st_size:
            raise ValueError(f"{version}/{name}: byte count mismatch")
        if raw_asset.get("sha256") != sha256(target):
            raise ValueError(f"{version}/{name}: sha256 mismatch")

    generic_path = HANDOFF_ROOT / "assets/urai/final/manifests/asset-factory-spatial-handoff.json"
    if generic_path.read_bytes() != handoff_path.read_bytes():
        raise ValueError(f"{version}: generic and versioned handoff manifests differ")

    result = {
        "schemaVersion": "1.0.0",
        "version": version,
        "status": "certified",
        "expectedOutputs": expected,
        "ready": expected,
        "missing": 0,
        "manifest": str(manifest_path.relative_to(BASE)),
        "manifestSha256": sha256(manifest_path),
        "handoffManifest": str(handoff_path.relative_to(BASE)),
        "handoffManifestSha256": sha256(handoff_path),
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
    args = parser.parse_args()
    certify(args.version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
