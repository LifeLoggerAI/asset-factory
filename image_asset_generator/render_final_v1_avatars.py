"""Add the six remaining V1 avatar assets to an existing render checkpoint."""

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
    checkpoint_entries = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    contract_entries = build_version_manifests._v1_manifest()
    contract_by_name = {entry.get("name"): entry for entry in contract_entries}
    entries = list(checkpoint_entries)
    existing_names = {entry.get("name") for entry in entries}

    missing_contract = sorted(TARGETS - set(contract_by_name))
    if missing_contract:
        raise RuntimeError(f"Missing target contract entries: {missing_contract}")

    for name in sorted(TARGETS):
        if name not in existing_names:
            entries.append(contract_by_name[name])

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
                raise RuntimeError(f"Non-provider output for {entry['name']}: {result.renderer}")
            result.image.save(output_path, format="PNG", optimize=True)
            base.write_render_metadata(output_path, entry, result)
            rendered.append(str(output_path.relative_to(BASE_DIR)))
        entry["status"] = "generated"
        entry["renderer"] = "provider"

    MANIFEST_PATH.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")

    print(f"CHECKPOINT_COUNT={len(checkpoint_entries)}")
    print(f"FINAL_MANIFEST_COUNT={len(entries)}")
    print(f"TARGET_COUNT={len(TARGETS)}")
    print(f"RENDERED_COUNT={len(rendered)}")
    for path in rendered:
        print(f"PROVIDER_RENDERED={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
