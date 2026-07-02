"""Cost-aware V1 asset generation.

Round one generates the complete manifest. Later rounds regenerate only assets listed in
``upgrade_feedback.json``. Existing accepted outputs are preserved.
"""

from __future__ import annotations

import json
from typing import Dict

import generate_assets as base


def main(*, only_feedback: bool = False) -> Dict[str, int]:
    entries = base.load_manifest()
    feedback = base.load_feedback()
    manifest_changed = False
    created_count = 0
    replaced_count = 0
    skipped_count = 0
    renderers: Dict[str, int] = {}

    for entry in entries:
        name = entry["name"]
        if only_feedback and name not in feedback:
            skipped_count += 1
            continue

        entry_created = False
        for size, output_path in base.iter_outputs(entry):
            exists = output_path.exists()
            if exists and not only_feedback and name not in feedback:
                # A fresh production workflow starts from a clean checkout. This protects
                # accepted artifacts when the generator is deliberately resumed locally.
                skipped_count += 1
                continue

            output_path.parent.mkdir(parents=True, exist_ok=True)
            result = base.render_via_adapter(
                entry,
                size,
                base.offline_render_asset,
                feedback=feedback.get(name),
            )
            result.image.save(output_path, format="PNG", optimize=True)
            base.write_render_metadata(output_path, entry, result)
            renderers[result.renderer] = renderers.get(result.renderer, 0) + 1
            if exists:
                replaced_count += 1
            else:
                created_count += 1
            entry_created = True

        if entry_created:
            entry["status"] = "generated"
            entry["renderer"] = "provider" if renderers.get("provider") else "offline-safe"
            entry.setdefault("prompt_version", "v1")
            manifest_changed = True

    if manifest_changed:
        base.save_manifest(entries)

    result = {
        "created": created_count,
        "replaced": replaced_count,
        "skipped": skipped_count,
        "requested": len(feedback) if only_feedback else len(entries),
    }
    print(f"V1 generation result: {json.dumps(result, sort_keys=True)}")
    print(f"Renderer counts: {json.dumps(renderers, sort_keys=True)}")
    return result


if __name__ == "__main__":
    main(only_feedback=False)
