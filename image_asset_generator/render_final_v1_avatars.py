"""Extend the proven V1 provider checkpoint with the six remaining canonical avatars.

This script is deliberately cost-bounded: it renders only the named avatar entries,
requires the configured provider, and never regenerates the existing 47 approved assets.
"""

from __future__ import annotations

import json
from pathlib import Path

import build_version_manifests
import generate_assets as base

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
TARGETS = {
    "avatar_relationship_liaison",
    "avatar_operator",
    "avatar_builder",
    "avatar_protector",
    "avatar_mirror",
    "avatar_guide",
}


def main() -> int:
    entries = build_version_manifests._v1_manifest()
    selected = [entry for entry in entries if entry.get("name") in TARGETS]
    found = {entry.get("name") for entry in selected}
    missing = sorted(TARGETS - found)
    if missing:
        raise RuntimeError(f"Missing target manifest entries: {missing}")

    rendered = []
    for entry in selected:
        for size, output_path in base.iter_outputs(entry):
            output_path.parent.mkdir(parents=True, exist_ok=True)
            result = base.render_via_adapter(entry, size, base.offline_render_asset)
            if result.renderer != "provider":
                raise RuntimeError(
                    f"Refusing non-provider output for {entry['name']}: {result.renderer}"
                )
            result.image.save(output_path, format="PNG", optimize=True)
            base.write_render_metadata(output_path, entry, result)
            rendered.append(str(output_path.relative_to(BASE_DIR)))
        entry["status"] = "generated"
        entry["renderer"] = "provider"

    # Preserve the expanded production contract for validation/export. Existing checkpoint
    # images and render metadata are restored by the workflow before this script runs.
    MANIFEST_PATH.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")

    print(f"TARGET_COUNT={len(TARGETS)}")
    print(f"RENDERED_COUNT={len(rendered)}")
    for path in rendered:
        print(f"PROVIDER_RENDERED={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
