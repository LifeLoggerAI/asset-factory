from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import canonical_release_manifests

BASE = Path(__file__).resolve().parent
CATALOG = BASE / "canonical_version_catalog.json"


def load_catalog() -> dict[str, Any]:
    payload = json.loads(CATALOG.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != "1.0.0" or not isinstance(payload.get("versions"), dict):
        raise ValueError("Invalid canonical version catalog")
    return payload


def snapshot(version: str) -> dict[str, Any]:
    config = load_catalog()["versions"][version]
    manifest = canonical_release_manifests.build(version)
    entries = json.loads(manifest.read_text(encoding="utf-8"))
    expected = int(config["expectedOutputs"])
    if not isinstance(entries, list) or len(entries) != expected:
        raise ValueError(f"{version}: expected {expected} canonical entries")
    return {
        "version": version,
        "label": config["label"],
        "expectedOutputs": expected,
        "actualOutputs": len(entries),
        "assetPrefix": config["assetPrefix"],
        "proofProfile": config["proofProfile"],
        "targetRepo": config["targetRepo"],
        "requiresSpatialWiring": bool(config.get("requiresSpatialWiring")),
        "manifest": str(manifest.relative_to(BASE)),
        "manifestSha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
    }
