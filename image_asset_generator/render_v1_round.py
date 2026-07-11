"""Render one canonical forge round with bounded, resumable provider requests."""

from __future__ import annotations

import json
import os
from typing import Dict

import cost_guarded_renderer
import generate_assets as base


def optional_limit(name: str) -> int | None:
    raw = os.environ.get(name, "").strip()
    if not raw or raw == "0":
        return None
    value = int(raw)
    if value < 1:
        raise ValueError(f"{name} must be greater than zero")
    return value


def selected_asset_ids() -> set[str] | None:
    raw = os.environ.get("ASSET_FORGE_ONLY_ASSET_IDS", "").strip()
    if not raw:
        return None
    values = [item.strip() for item in raw.split(",") if item.strip()]
    if not values or len(values) != len(set(values)):
        raise ValueError("ASSET_FORGE_ONLY_ASSET_IDS must contain unique non-empty asset names")
    return set(values)


def render_round(round_number: int) -> Dict[str, object]:
    entries = base.load_manifest()
    feedback = base.load_feedback()
    retry_only = round_number > 1
    max_entries = optional_limit("ASSET_FORGE_LIMIT_ENTRIES")
    max_outputs = optional_limit("ASSET_FORGE_LIMIT_OUTPUTS")
    selected = selected_asset_ids()
    available = {str(entry.get("name", "")) for entry in entries}
    if selected is not None:
        unknown = sorted(selected - available)
        if unknown:
            raise ValueError(f"Unknown selected asset names: {unknown}")
        if os.environ.get("ASSET_FORGE_REQUIRE_EXACT_SELECTION", "0") == "1" and len(selected) != 1:
            raise ValueError("This execution requires exactly one selected asset")

    skip_existing = os.environ.get("ASSET_FORGE_SKIP_EXISTING_OUTPUTS", "0") == "1"
    allow_paid_overwrite = os.environ.get("ASSET_FORGE_ALLOW_PAID_OVERWRITE", "0") == "1"
    paid_run = os.environ.get("ASSET_FORGE_PAID_RUN_AUTHORIZED", "0") == "1"
    changed = False
    created = 0
    replaced = 0
    skipped = 0
    skipped_existing = 0
    rendered_entries = 0
    output_requests = 0
    renderers: Dict[str, int] = {}
    rendered_assets: list[str] = []
    rendered_outputs: list[str] = []

    for entry in entries:
        name = str(entry["name"])
        if selected is not None and name not in selected:
            skipped += 1
            continue
        if retry_only and name not in feedback:
            skipped += 1
            continue
        if max_entries is not None and rendered_entries >= max_entries:
            skipped += 1
            continue

        rendered_entry = False
        entry_renderers: set[str] = set()
        for size, output_path in base.iter_outputs(entry):
            if max_outputs is not None and output_requests >= max_outputs:
                skipped += 1
                break
            existed = output_path.exists()
            if existed and paid_run and not allow_paid_overwrite:
                if skip_existing:
                    skipped_existing += 1
                    continue
                raise RuntimeError(
                    f"Paid execution refuses to overwrite existing output without explicit approval: {output_path}"
                )
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
                        "requestIndex": output_requests + 1,
                        "outputPath": str(output_path),
                    },
                    sort_keys=True,
                )
            )
            result = cost_guarded_renderer.render_asset(
                entry,
                size,
                base.offline_render_asset,
                feedback=feedback.get(name),
            )
            result.image.save(output_path, format="PNG", optimize=True)
            cost_guarded_renderer.write_render_metadata(output_path, entry, result)
            renderers[result.renderer] = renderers.get(result.renderer, 0) + 1
            entry_renderers.add(result.renderer)
            created += 0 if existed else 1
            replaced += 1 if existed else 0
            output_requests += 1
            rendered_entry = True
            rendered_outputs.append(str(output_path))

        if rendered_entry:
            entry["status"] = "generated"
            entry["renderer"] = "provider" if entry_renderers == {"provider"} else "offline-safe"
            entry.setdefault("prompt_version", "v1")
            rendered_entries += 1
            rendered_assets.append(name)
            changed = True

    if selected is not None and paid_run and rendered_assets != sorted(selected):
        raise RuntimeError(
            f"Paid execution did not render the exact authorized asset set: expected={sorted(selected)} actual={rendered_assets}"
        )

    if changed:
        base.save_manifest(entries)

    outcome: Dict[str, object] = {
        "round": round_number,
        "created": created,
        "replaced": replaced,
        "skipped": skipped,
        "skippedExisting": skipped_existing,
        "renderedEntries": rendered_entries,
        "renderedAssets": rendered_assets,
        "renderedOutputs": rendered_outputs,
        "outputRequests": output_requests,
        "limitEntries": max_entries,
        "limitOutputs": max_outputs,
        "requested": len(feedback) if retry_only else (len(selected) if selected is not None else len(entries)),
    }
    print(f"Forge round result: {json.dumps(outcome, sort_keys=True)}")
    print(f"Renderer counts: {json.dumps(renderers, sort_keys=True)}")
    return outcome
