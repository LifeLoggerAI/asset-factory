"""Render one V1 forge round with cost-aware retry behavior."""

from __future__ import annotations

import json
import os
from typing import Dict

import generate_assets as base


def env_optional_int(name: str) -> int | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer when set") from exc
    if value < 1:
        raise ValueError(f"{name} must be greater than zero when set")
    return value


def render_round(round_number: int) -> Dict[str, int]:
    entries = base.load_manifest()
    feedback = base.load_feedback()
    retry_only = round_number > 1
    max_entries = env_optional_int("ASSET_FORGE_LIMIT_ENTRIES")
    max_outputs = env_optional_int("ASSET_FORGE_LIMIT_OUTPUTS")
    skip_existing = os.environ.get("ASSET_FORGE_SKIP_EXISTING_OUTPUTS", "0") == "1"
    changed = False
    created = 0
    replaced = 0
    skipped = 0
    skipped_existing = 0
    rendered_entries = 0
    output_requests = 0
    renderers: Dict[str, int] = {}

    for entry in entries:
        name = entry["name"]
        if retry_only and name not in feedback:
            skipped += 1
            continue
        if max_entries is not None and rendered_entries >= max_entries:
            skipped += 1
            continue

        rendered_entry = False
        for size, output_path in base.iter_outputs(entry):
            if max_outputs is not None and output_requests >= max_outputs:
                skipped += 1
                break
            existed = output_path.exists()
            if skip_existing and existed:
                skipped_existing += 1
                continue

            output_path.parent.mkdir(parents=True, exist_ok=True)
            print(
                "FORGE_RENDER_REQUEST "
                + json.dumps(
                    {
                        "round": round_number,
                        "asset": name,
                        "size": size,
                        "output": str(output_path.relative_to(base.BASE_DIR)),
                        "requestIndex": output_requests + 1,
                    },
                    sort_keys=True,
                )
            )
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
            output_requests += 1
            rendered_entry = True
            print(
                "FORGE_RENDER_SAVED "
                + json.dumps(
                    {
                        "round": round_number,
                        "asset": name,
                        "renderer": result.renderer,
                        "output": str(output_path.relative_to(base.BASE_DIR)),
                    },
                    sort_keys=True,
                )
            )

        if rendered_entry:
            entry["status"] = "generated"
            entry["renderer"] = "provider" if renderers.get("provider") else "offline-safe"
            entry.setdefault("prompt_version", "v1")
            rendered_entries += 1
            changed = True

    if changed:
        base.save_manifest(entries)

    outcome = {
        "round": round_number,
        "created": created,
        "replaced": replaced,
        "skipped": skipped,
        "skippedExisting": skipped_existing,
        "renderedEntries": rendered_entries,
        "outputRequests": output_requests,
        "limitEntries": max_entries,
        "limitOutputs": max_outputs,
        "requested": len(feedback) if retry_only else len(entries),
    }
    print(f"V1 round result: {json.dumps(outcome, sort_keys=True)}")
    print(f"Renderer counts: {json.dumps(renderers, sort_keys=True)}")
    return outcome
