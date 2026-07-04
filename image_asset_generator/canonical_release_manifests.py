from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import build_v2_manifest
import build_version_manifests

BASE = Path(__file__).resolve().parent
MANIFESTS = BASE / "manifests"
GENERATED = MANIFESTS / "generated"


def load(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or not value:
        raise ValueError(f"Invalid manifest: {path}")
    return value


def remap(entries: list[dict[str, Any]], old: str, new: str, paths: bool) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for source in entries:
        entry = dict(source)
        entry["name"] = str(entry["name"]).replace(f"{old}_", f"{new}_", 1)
        entry["category"] = str(entry.get("category", "")).replace(f"{old}_", f"{new}_", 1)
        if paths:
            entry["path_template"] = str(entry["path_template"]).replace(f"assets/urai/{old}/", f"assets/urai/{new}/", 1)
            if entry.get("canonical_path"):
                entry["canonical_path"] = str(entry["canonical_path"]).replace(f"assets/urai/{old}/", f"assets/urai/{new}/", 1)
        entry["status"] = "prompted"
        entry["prompt_version"] = "v3"
        output.append(entry)
    return output


def write(name: str, entries: list[dict[str, Any]], expected: int) -> Path:
    if len(entries) != expected:
        raise ValueError(f"{name}: expected {expected}, found {len(entries)}")
    names = [entry["name"] for entry in entries]
    paths = [entry["canonical_path"] for entry in entries]
    if len(names) != len(set(names)) or len(paths) != len(set(paths)):
        raise ValueError(f"{name}: duplicate names or paths")
    GENERATED.mkdir(parents=True, exist_ok=True)
    target = GENERATED / name
    target.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    return target


def build(version: str) -> Path:
    if version == "v2":
        return build_v2_manifest.build()
    generated = build_version_manifests.build_all()
    if version == "v1":
        return BASE / generated["v1"]["manifest"]
    if version == "v3":
        return write("v3-canonical.manifest.json", load(MANIFESTS / "v3.manifest.json"), 14)
    if version == "v4":
        source = BASE / generated["v3"]["manifest"]
        return write("v4-canonical.manifest.json", remap(load(source), "v3", "v4", False), 39)
    if version == "v5":
        source = BASE / generated["v4"]["manifest"]
        autonomous = remap(load(source), "v4", "v5", True)
        return write("v5-canonical.manifest.json", autonomous + load(MANIFESTS / "v5.manifest.json"), 27)
    raise ValueError(f"Unsupported version: {version}")
