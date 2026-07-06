"""Render one forge round with missing-only resume and hard provider caps."""

from __future__ import annotations

import json
import os
from typing import Dict

import forge_budget
import generate_assets as base


def _non_negative_int(name: str, default: int = 0) -> int:
    try:
        return max(0, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def render_round(round_number: int) -> Dict[str, int]:
    entries = base.load_manifest()
    feedback = base.load_feedback()
    retry_only = round_number > 1
    force = os.environ.get("ASSET_RENDERER_FORCE") == "1"
    missing_only = os.environ.get("ASSET_FORGE_MISSING_ONLY", "1") != "0"
    smoke_max_assets = _non_negative_int("ASSET_FORGE_SMOKE_MAX_ASSETS")
    require_provider = os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER", "1") == "1"

    changed = False
    created = 0
    replaced = 0
    skipped = 0
    rendered_assets = 0
    renderers: Dict[str, int] = {}

    for entry in entries:
        name = entry["name"]
        if retry_only and name not in feedback:
            skipped += 1
            continue
        if smoke_max_assets and rendered_assets >= smoke_max_assets:
            skipped += 1
            continue

        rendered_entry = False
        for size, output_path in base.iter_outputs(entry):
            existed = output_path.exists()
            if missing_only and existed and not force:
                skipped += 1
                continue

            output_path.parent.mkdir(parents=True, exist_ok=True)
            if require_provider:
                forge_budget.reserve_provider_call()
            result = base.render_via_adapter(
                entry,
                size,
                base.offline_render_asset,
                feedback=feedback.get(name),
            )
            result.image.save(output_path, format="PNG", optimize=True)
            base.write_render_metadata(output_path, entry, result)
            renderers[result.renderer] = renderers.get(result.renderer, 0) + 1
            created += 0 if existed else 1
            replaced += 1 if existed else 0
            rendered_entry = True

        if rendered_entry:
            entry["status"] = "generated"
            entry["renderer"] = "provider" if renderers.get("provider") else "offline-safe"
            entry.setdefault("prompt_version", "v1")
            rendered_assets += 1
            changed = True
            base.save_manifest(entries)

    if changed:
        base.save_manifest(entries)

    outcome = {
        "round": round_number,
        "created": created,
        "replaced": replaced,
        "skipped": skipped,
        "renderedAssets": rendered_assets,
        "providerCalls": forge_budget.used_calls(),
        "requested": len(feedback) if retry_only else len(entries),
    }
    print(f"Asset round result: {json.dumps(outcome, sort_keys=True)}")
    print(f"Renderer counts: {json.dumps(renderers, sort_keys=True)}")
    return outcome
