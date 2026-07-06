from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import build_v2_manifest
import build_version_manifests

BASE = Path(__file__).resolve().parent
MANIFESTS = BASE / "manifests"
GENERATED = MANIFESTS / "generated"
CATALOG_PATH = BASE / "canonical_version_catalog.json"


def required_text(mapping: dict[str, Any], key: str, context: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: missing required '{key}'")
    return value


def load(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or not value:
        raise ValueError(f"Invalid manifest: {path}")
    if not all(isinstance(entry, dict) for entry in value):
        raise ValueError(f"Manifest entries must be objects: {path}")
    return value


def load_catalog() -> dict[str, Any]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    versions = payload.get("versions")
    if not isinstance(versions, dict) or not versions:
        raise ValueError("canonical_version_catalog.json must contain versions")
    return payload


def remap(
    entries: list[dict[str, Any]], old: str, new: str, paths: bool
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for index, source in enumerate(entries):
        entry = dict(source)
        context = f"{old} manifest entry {index}"
        entry["name"] = required_text(entry, "name", context).replace(
            f"{old}_", f"{new}_", 1
        )
        entry["category"] = str(entry.get("category", "")).replace(
            f"{old}_", f"{new}_", 1
        )
        if paths:
            entry["path_template"] = required_text(
                entry, "path_template", context
            ).replace(f"assets/urai/{old}/", f"assets/urai/{new}/", 1)
            canonical = entry.get("canonical_path")
            if canonical:
                entry["canonical_path"] = str(canonical).replace(
                    f"assets/urai/{old}/", f"assets/urai/{new}/", 1
                )
        entry["status"] = "prompted"
        entry["prompt_version"] = "v3"
        output.append(entry)
    return output


def normalize_v5_operations(
    entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for source in entries:
        entry = dict(source)
        if entry.get("name") == "v5_launch_key_art":
            entry["name"] = "v5_operations_launch_key_art"
            entry["category"] = "v5_operations_social"
            entry["path_template"] = required_text(
                entry, "path_template", "v5 operations key art"
            ).replace("launch-key-art", "operations-launch-key-art")
            entry["canonical_path"] = required_text(
                entry, "canonical_path", "v5 operations key art"
            ).replace("launch-key-art", "operations-launch-key-art")
        normalized.append(entry)
    return normalized


def write(
    version: str,
    target_name: str,
    entries: list[dict[str, Any]],
    expected: int,
    prefix: str,
) -> Path:
    if len(entries) != expected:
        raise ValueError(f"{version}: expected {expected}, found {len(entries)}")

    names: list[str] = []
    paths: list[str] = []
    for index, entry in enumerate(entries):
        name = required_text(entry, "name", f"{version} entry {index}")
        canonical = required_text(
            entry, "canonical_path", f"{version} asset {name}"
        )
        names.append(name)
        paths.append(canonical)

    if len(names) != len(set(names)):
        raise ValueError(f"{version}: duplicate names")
    if len(paths) != len(set(paths)):
        raise ValueError(f"{version}: duplicate canonical paths")

    expected_prefix = prefix.rstrip("/") + "/"
    invalid = [path for path in paths if not path.startswith(expected_prefix)]
    if invalid:
        raise ValueError(
            f"{version}: canonical paths must stay under {expected_prefix}: {invalid[:3]}"
        )

    GENERATED.mkdir(parents=True, exist_ok=True)
    target = GENERATED / target_name
    target.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    return target


def build(version: str) -> Path:
    catalog = load_catalog()
    versions = catalog["versions"]
    config = versions.get(version)
    if not isinstance(config, dict):
        raise ValueError(f"Unsupported version: {version}")

    expected = int(config.get("expectedOutputs", 0))
    prefix = required_text(config, "assetPrefix", f"{version} catalog")
    configured_name = Path(
        required_text(config, "manifest", f"{version} catalog")
    ).name

    if version == "v2":
        path = build_v2_manifest.build()
        return write(version, configured_name, load(path), expected, prefix)

    generated = build_version_manifests.build_all()
    if version == "v1":
        source = BASE / generated["v1"]["manifest"]
        return write(version, configured_name, load(source), expected, prefix)
    if version == "v3":
        return write(
            version,
            configured_name,
            load(MANIFESTS / "v3.manifest.json"),
            expected,
            prefix,
        )
    if version == "v4":
        source = BASE / generated["v3"]["manifest"]
        return write(
            version,
            configured_name,
            remap(load(source), "v3", "v4", False),
            expected,
            prefix,
        )
    if version == "v5":
        source = BASE / generated["v4"]["manifest"]
        operations = normalize_v5_operations(
            remap(load(source), "v4", "v5", True)
        )
        entries = operations + load(MANIFESTS / "v5.manifest.json")
        return write(version, configured_name, entries, expected, prefix)
    raise ValueError(f"Unsupported version: {version}")
