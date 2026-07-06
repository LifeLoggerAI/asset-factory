"""Compatibility wrapper for canonical URAI version manifests.

Do not add release meaning here. The only authoritative version labels, counts,
prefixes, and manifest targets are in canonical_version_catalog.json and
canonical_release_manifests.py.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

from canonical_manifest_sources import (
    v1_manifest as _v1_manifest,
    v2_manifest as _v2_manifest,
    v4_xr_manifest as _v4_manifest,
)

BASE_DIR = Path(__file__).resolve().parent
MANIFESTS_DIR = BASE_DIR / "manifests"
GENERATED_DIR = MANIFESTS_DIR / "generated"


def _v3_manifest() -> list[dict[str, Any]]:
    """Deprecated compatibility alias for the historical XR source builder."""
    return _v4_manifest()


def _remap_legacy(
    entries: Iterable[dict[str, Any]],
    old_version: str,
    new_version: str,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for source in entries:
        entry = dict(source)
        entry["name"] = str(entry["name"]).replace(
            f"{old_version}_", f"{new_version}_", 1
        )
        entry["category"] = str(entry.get("category", "")).replace(
            f"{old_version}_", f"{new_version}_", 1
        )
        entry["path_template"] = str(entry["path_template"]).replace(
            f"assets/urai/{old_version}/",
            f"assets/urai/{new_version}/",
            1,
        )
        canonical = entry.get("canonical_path")
        if canonical:
            entry["canonical_path"] = str(canonical).replace(
                f"assets/urai/{old_version}/",
                f"assets/urai/{new_version}/",
                1,
            )
        entry["prompt_version"] = "v3"
        entry["status"] = "prompted"
        result.append(entry)
    return result


def _write(name: str, entries: list[dict[str, Any]]) -> Path:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    output = GENERATED_DIR / f"{name}.manifest.json"
    output.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    return output


def build_all() -> dict[str, dict[str, Any]]:
    """Build every version through the canonical release contract."""
    import canonical_release_manifests

    summary: dict[str, dict[str, Any]] = {}
    for version in ("v1", "v2", "v3", "v4", "v5"):
        output = canonical_release_manifests.build(version)
        entries = json.loads(output.read_text(encoding="utf-8"))
        summary[version] = {
            "count": len(entries),
            "manifest": str(output.relative_to(BASE_DIR)),
        }

    summary_path = GENERATED_DIR / "manifest-build-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    build_all()
