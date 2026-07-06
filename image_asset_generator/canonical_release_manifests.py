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
    return value


def load_catalog() -> dict[str, Any]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    versions = payload.get("versions")
    if not isinstance(versions, dict) or not versions:
        raise ValueError("canonical_version_catalog.json must contain versions")
    return payload


def remap(
    entries: list[dict[str, Any]],
    old: str,
    new: str,
    paths: bool,
) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for source in entries:
        entry = dict(source)
        entry["name"] = str(entry["name"]).replace(f"{old}_", f"{new}_", 1)
        entry["category"] = str(entry.get("category", "")).replace(
            f"{old}_", f"{new}_", 1
        )
        if paths:
            entry["path_template"] = str(entry["path_template"]).replace(
                f"assets/urai/{old}/", f"assets/urai/{new}/", 1
            )
            if entry.get("canonical_path"):
                entry["canonical_path"] = str(entry["canonical_path"]).replace(
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
    for source in entries:
        entry = dict(source)
        entry.setdefault(
            "canonical_path",
            _canonical_path_from_template(str(entry["path_template"])),
        )
        normalized.append(entry)
    return normalized


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
        legacy_operations = remap(
            load(MANIFESTS / "v2.manifest.json"),
            "v2",
            "v5",
            True,
        )
        return legacy_operations + load(MANIFESTS / "v5.manifest.json")
    raise ValueError(f"Unsupported version: {version}")


def write(
    version: str,
    config: dict[str, Any],
    entries: list[dict[str, Any]],
) -> Path:
    expected = int(config.get("expectedOutputs", 0))
    if len(entries) != expected:
        raise ValueError(f"{version}: expected {expected}, found {len(entries)}")

    names = [str(entry["name"]) for entry in entries]
    canonical_paths = [str(entry["canonical_path"]) for entry in entries]
    if len(names) != len(set(names)):
        raise ValueError(f"{version}: duplicate names")
    if len(canonical_paths) != len(set(canonical_paths)):
        raise ValueError(f"{version}: duplicate canonical paths")

    prefix = str(config["assetPrefix"]).rstrip("/") + "/"
    if not all(path.startswith(prefix) for path in canonical_paths):
        invalid = [path for path in canonical_paths if not path.startswith(prefix)]
        raise ValueError(
            f"{version}: canonical paths must stay under {prefix}: {invalid[:3]}"
        )

    target = (BASE / str(config["manifest"])).resolve()
    if BASE not in target.parents:
        raise ValueError(f"{version}: manifest target must stay inside {BASE}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    return target


def build(version: str) -> Path:
    catalog = load_catalog()
    config = catalog["versions"].get(version)
    if not isinstance(config, dict):
        raise ValueError(f"Unsupported version: {version}")
    return write(version, config, entries_for(version))
