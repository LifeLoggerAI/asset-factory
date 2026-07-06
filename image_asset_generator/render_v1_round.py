"""Render one canonical forge round with guarded external rendering."""

from __future__ import annotations

import json
import os
from typing import Any, Dict

import cost_guard
import generate_assets as base
import guarded_renderer


def render_round(round_number: int) -> Dict[str, Any]:
    entries = base.load_manifest()
    feedback = base.load_feedback()
    retry_only = round_number > 1
    require_provider = os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER", "1") == "1"
    changed = False
    created = 0
    replaced = 0
    skipped = 0
    renderers: Dict[str, int] = {}

    for entry in entries:
        name = entry["name"]
        if retry_only and name not in feedback:
            skipped += 1
            continue

        rendered_entry = False
        entry_renderers: set[str] = set()
        for size, output_path in base.iter_outputs(entry):
            existed = output_path.exists()
            output_path.parent.mkdir(parents=True, exist_ok=True)
            result = guarded_renderer.render_asset(
                entry,
                size,
                base.offline_render_asset,
                feedback=feedback.get(name),
            )
            if require_provider and result.renderer != "provider":
                raise RuntimeError(
                    f"Provider-required forge received renderer={result.renderer!r} for {name}"
                )
            result.image.save(output_path, format="PNG", optimize=True)
            guarded_renderer.write_render_metadata(output_path, entry, result)
            renderers[result.renderer] = renderers.get(result.renderer, 0) + 1
            entry_renderers.add(result.renderer)
            created += 0 if existed else 1
            replaced += 1 if existed else 0
            rendered_entry = True

        if rendered_entry:
            entry["status"] = "generated"
            entry["renderer"] = (
                "provider" if entry_renderers == {"provider"} else "offline-safe"
            )
            entry.setdefault("prompt_version", "v1")
            changed = True

    if changed:
        base.save_manifest(entries)

    outcome: Dict[str, Any] = {
        "round": round_number,
        "created": created,
        "replaced": replaced,
        "skipped": skipped,
        "requested": len(feedback) if retry_only else len(entries),
        "requireProvider": require_provider,
        "costGuard": cost_guard.snapshot(),
    }
    print(f"Forge round result: {json.dumps(outcome, sort_keys=True)}")
    print(f"Renderer counts: {json.dumps(renderers, sort_keys=True)}")
    return outcome
