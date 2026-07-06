from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import canonical_manifest_sources as sources

BASE = Path(__file__).resolve().parent
MANIFESTS = BASE / "manifests"
GENERATED = MANIFESTS / "generated"
CATALOG_PATH = BASE / "canonical_version_catalog.json"


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


def required_text(mapping: dict[str, Any], key: str, context: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: missing required '{key}'")
    return value


def remap(
    entries: list[dict[str, Any]],
    old: str,
    new: str,
    paths: bool,
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
            canonical_path = entry.get("canonical_path")
            if canonical_path:
                entry["canonical_path"] = str(canonical_path).replace(
                    f"assets/urai/{old}/", f"assets/urai/{new}/", 1
                )
        entry["status"] = "prompted"
        entry["prompt_version"] = "v3"
        output.append(entry)
    return output


def _canonical_path_from_template(template: str) -> str:
    value = template.replace("_{size}", "")
    suffix = Path(value).suffix
    if suffix:
        value = value[: -len(suffix)]
    return f"{value}.webp"


def _normalize_v1(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, source in enumerate(entries):
        entry = dict(source)
        template = required_text(entry, "path_template", f"v1 manifest entry {index}")
        entry.setdefault("canonical_path", _canonical_path_from_template(template))
        normalized.append(entry)
    return normalized


def merge_with_primary_precedence(
    primary: list[dict[str, Any]],
    fallback: list[dict[str, Any]],
    *,
    allowed_duplicate_names: set[str],
) -> list[dict[str, Any]]:
    """Merge legacy fallback entries without replacing canonical version entries."""

    merged = [dict(entry) for entry in primary]
    seen_names = {
        required_text(entry, "name", "primary manifest entry") for entry in merged
    }
    seen_paths = {
        required_text(entry, "canonical_path", "primary manifest entry")
        for entry in merged
    }

    for entry in fallback:
        name = required_text(entry, "name", "fallback manifest entry")
        canonical_path = required_text(
            entry, "canonical_path", f"fallback asset {name}"
        )
        collision = name in seen_names or canonical_path in seen_paths
        if collision:
            if name not in allowed_duplicate_names:
                raise ValueError(
                    f"Unexpected fallback collision for {name}: {canonical_path}"
                )
            continue

        merged.append(dict(entry))
        seen_names.add(name)
        seen_paths.add(canonical_path)

    return merged


def entries_for(version: str) -> list[dict[str, Any]]:
    if version == "v1":
        return _normalize_v1(sources.v1_manifest())
    if version == "v2":
        return sources.v2_manifest()
    if version == "v3":
        return load(MANIFESTS / "v3.manifest.json")
    if version == "v4":
        return sources.v4_xr_manifest()
    if version == "v5":
        canonical_v5 = load(MANIFESTS / "v5.manifest.json")
        legacy_operations = remap(
            load(MANIFESTS / "v2.manifest.json"),
            "v2",
            "v5",
            True,
        )
        return merge_with_primary_precedence(
            canonical_v5,
            legacy_operations,
            allowed_duplicate_names={"v5_launch_key_art"},
        )
    raise ValueError(f"Unsupported version: {version}")


def write(
    version: str,
    config: dict[str, Any],
    entries: list[dict[str, Any]],
) -> Path:
    expected = int(config.get("expectedOutputs", 0))
    if len(entries) != expected:
        raise ValueError(f"{version}: expected {expected}, found {len(entries)}")

    names: list[str] = []
    canonical_paths: list[str] = []
    for index, entry in enumerate(entries):
        name = required_text(entry, "name", f"{version} entry {index}")
        canonical_path = required_text(
            entry, "canonical_path", f"{version} asset {name}"
        )
        names.append(name)
        canonical_paths.append(canonical_path)

    if len(names) != len(set(names)):
        raise ValueError(f"{version}: duplicate names")
    if len(canonical_paths) != len(set(canonical_paths)):
        raise ValueError(f"{version}: duplicate canonical paths")

    asset_prefix = required_text(config, "assetPrefix", f"{version} catalog")
    prefix = asset_prefix.rstrip("/") + "/"
    if not all(path.startswith(prefix) for path in canonical_paths):
        invalid = [path for path in canonical_paths if not path.startswith(prefix)]
        raise ValueError(
            f"{version}: canonical paths must stay under {prefix}: {invalid[:3]}"
        )

    manifest_target = required_text(config, "manifest", f"{version} catalog")
    target = (BASE / manifest_target).resolve()
    if BASE not in target.parents:
        raise ValueError(f"{version}: manifest target must stay inside {BASE}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    return target


def build(version: str) -> Path:
    catalog = load_catalog()
    versions = catalog.get("versions")
    if not isinstance(versions, dict):
        raise ValueError("Catalog is missing a valid versions object")
    config = versions.get(version)
    if not isinstance(config, dict):
        raise ValueError(f"Unsupported version: {version}")
    return write(version, config, entries_for(version))
