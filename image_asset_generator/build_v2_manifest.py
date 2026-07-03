"""Build and validate only the canonical V2 living-state manifest.

This deliberately avoids loading V4/V5 legacy catalogs so unrelated future-version
migration defects cannot block the V2 production lane.
"""

from __future__ import annotations

import json
from pathlib import Path

import build_version_manifests

BASE_DIR = Path(__file__).resolve().parent
SUMMARY_PATH = BASE_DIR / "manifests" / "generated" / "v2-manifest-build-summary.json"


def build() -> dict[str, object]:
    entries = build_version_manifests._v2_manifest()
    names = [entry["name"] for entry in entries]
    paths = [entry["path_template"] for entry in entries]

    duplicate_names = sorted({name for name in names if names.count(name) > 1})
    if duplicate_names:
        raise ValueError(f"v2 generated duplicate asset names: {duplicate_names}")
    duplicate_paths = sorted({path for path in paths if paths.count(path) > 1})
    if duplicate_paths:
        raise ValueError(f"v2 generated duplicate output paths: {duplicate_paths}")
    if len(entries) != 80:
        raise ValueError(f"v2 expected 80 canonical assets, found {len(entries)}")

    output = build_version_manifests._write("v2", entries)
    summary = {
        "version": "v2",
        "count": len(entries),
        "manifest": str(output.relative_to(BASE_DIR)),
        "isolatedFromFutureCatalogs": True,
    }
    SUMMARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    build()
