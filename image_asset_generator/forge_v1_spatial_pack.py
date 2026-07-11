#!/usr/bin/env python3
"""Forge the complete V1 public Spatial pack within the approved provider budget.

The pack contains 53 canonical outputs:
- 48 provider-backed master renders (one reused from the proven paid smoke);
- 5 deterministic derivatives built only from those provider-backed masters.

No promotion or deployment occurs here. The output is a certified handoff artifact.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageOps

import canonical_release_manifests
import create_firebase_seed
import create_preview
import export_assets
import export_spatial_handoff
import provider_renderer
import render_v1_round
import score_v1_assets
import validate_assets
import validate_manifest

BASE = Path(__file__).resolve().parent
ACTIVE_MANIFEST = BASE / "manifest.json"
OVERRIDES_PATH = BASE / "spatial_prompt_overrides.json"
RECEIPT = BASE / "forge_receipt.json"
QUALITY = BASE / "quality_report.json"
FEEDBACK = BASE / "upgrade_feedback.json"

DERIVED = {
    "status_route_matrix_main",
    "status_route_matrix_mobile",
    "status_health_pill",
    "open_graph_launch",
    "open_graph_life_map",
}
EXPECTED_OUTPUTS = 53
EXPECTED_DIRECT = 48
EXPECTED_NEW_CALLS = 47
SEED_NAME = "home_threshold_main"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def apply_overrides(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    overrides = load_json(OVERRIDES_PATH)
    by_name = {entry["name"]: dict(entry) for entry in entries}
    for name, patch in overrides.items():
        if name not in by_name:
            raise ValueError(f"Prompt override references unknown asset: {name}")
        if not isinstance(patch, dict):
            raise ValueError(f"Prompt override must be an object: {name}")
        by_name[name].update(patch)
    output = [by_name[entry["name"]] for entry in entries]
    errors = validate_manifest.validate_manifest_entries(output)
    if errors:
        raise ValueError(f"Overridden V1 manifest is invalid: {errors[:10]}")
    return output


def output_path(entry: dict[str, Any]) -> Path:
    sizes = [int(value) for value in entry.get("sizes", [])]
    if not sizes:
        raise ValueError(f"{entry['name']}: no output size")
    return BASE / entry["path_template"].format(size=max(sizes))


def metadata_path(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".render.json")


def request_ids_for(paths: list[Path]) -> list[str]:
    request_ids: list[str] = []
    for path in paths:
        meta_path = metadata_path(path)
        if not meta_path.is_file():
            raise ValueError(f"Provider provenance is missing for {path}")
        metadata = load_json(meta_path)
        if metadata.get("renderer") != "provider":
            raise ValueError(f"Source is not provider-backed: {path}")
        provider_meta = metadata.get("metadata")
        if not isinstance(provider_meta, dict):
            raise ValueError(f"Provider metadata is malformed: {path}")
        request_id = provider_meta.get("provider_request_id")
        inherited = provider_meta.get("source_provider_request_ids")
        if isinstance(request_id, str) and request_id.strip():
            request_ids.append(request_id)
        elif isinstance(inherited, list) and inherited and all(
            isinstance(value, str) and value.strip() for value in inherited
        ):
            request_ids.extend(inherited)
        else:
            raise ValueError(f"Provider request id is missing: {path}")
    return request_ids


def seed_proven_home(entries: list[dict[str, Any]]) -> None:
    seed_root_value = os.environ.get("ASSET_FORGE_SEED_DIR", "").strip()
    if not seed_root_value:
        raise ValueError("ASSET_FORGE_SEED_DIR is required")
    seed_root = Path(seed_root_value).resolve()
    if not seed_root.is_dir():
        raise ValueError(f"Seed directory is missing: {seed_root}")

    entry = next(item for item in entries if item["name"] == SEED_NAME)
    target = output_path(entry)
    expected_name = target.name
    candidates = list(seed_root.rglob(expected_name))
    if len(candidates) != 1:
        raise ValueError(f"Expected exactly one seed {expected_name}; found {len(candidates)}")
    source = candidates[0]
    source_meta = metadata_path(source)
    if not source_meta.is_file():
        raise ValueError("Seed render metadata is missing")

    meta = load_json(source_meta)
    provider_meta = meta.get("metadata")
    if meta.get("renderer") != "provider" or not isinstance(provider_meta, dict):
        raise ValueError("Seed is not provider-backed")
    if provider_meta.get("provider_request_id") != "req_105244180b6f4b95bec882bdfc1a695b":
        raise ValueError("Seed request id does not match the proven paid smoke receipt")
    if provider_meta.get("provider_model") != "gpt-image-2":
        raise ValueError("Seed provider model does not match the proven paid smoke receipt")

    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    shutil.copy2(source_meta, metadata_path(target))
    with Image.open(target) as image:
        expected = provider_renderer.target_dimensions(entry, max(int(v) for v in entry["sizes"]))
        if image.size != expected:
            raise ValueError(f"Seed dimensions differ: expected {expected}, found {image.size}")
    print(f"SEEDED_PROVIDER_ASSET name={SEED_NAME} sha256={sha256(target)}")


def fit_source(source: Image.Image, size: tuple[int, int], *, alpha: bool = False) -> Image.Image:
    mode = "RGBA" if alpha else "RGB"
    return ImageOps.fit(source.convert(mode), size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def write_derived(
    entry: dict[str, Any],
    image: Image.Image,
    *,
    source_paths: list[Path],
    kind: str,
) -> None:
    target = output_path(entry)
    target.parent.mkdir(parents=True, exist_ok=True)
    desired = provider_renderer.target_dimensions(entry, max(int(v) for v in entry["sizes"]))
    image = fit_source(image, desired, alpha=bool(entry.get("alpha")))
    image.save(target, "PNG", optimize=True)
    source_ids = request_ids_for(source_paths)
    metadata = {
        "name": entry["name"],
        "category": entry["category"],
        "prompt_version": entry.get("prompt_version", "v1"),
        "aspect_ratio": entry.get("aspect_ratio", "1:1"),
        "renderer": "provider",
        "attempt": 0,
        "metadata": {
            "provider": "derived-provider",
            "derivation_kind": kind,
            "source_assets": [str(path.relative_to(BASE)) for path in source_paths],
            "source_provider_request_ids": source_ids,
            "target_width": image.width,
            "target_height": image.height,
        },
    }
    write_json(metadata_path(target), metadata)
    entry["status"] = "generated"
    entry["renderer"] = "provider"
    entry["derivation"] = {
        "kind": kind,
        "sourceProviderRequestIds": source_ids,
    }
    print(f"DERIVED_PROVIDER_ASSET name={entry['name']} kind={kind} sha256={sha256(target)}")


def create_derivatives(entries: list[dict[str, Any]]) -> None:
    by_name = {entry["name"]: entry for entry in entries}

    home = output_path(by_name["home_threshold_main"])
    life_map = output_path(by_name["life_map_galaxy_main"])
    route_names = [
        "home_threshold_main",
        "ground_world_main",
        "life_map_galaxy_main",
        "focus_memory_chamber_main",
        "replay_memory_film_main",
        "mirror_reflection_main",
        "passport_vault_main",
        "privacy_controls_main",
        "location_emotional_weather_main",
    ]
    route_paths = [output_path(by_name[name]) for name in route_names]

    with Image.open(home) as source:
        launch = source.convert("RGB")
        overlay = Image.new("RGBA", launch.size, (0, 0, 0, 0))
        alpha = Image.new("L", launch.size, 0)
        draw = ImageDraw.Draw(alpha)
        draw.rectangle((0, 0, launch.width, launch.height), fill=30)
        alpha = alpha.filter(ImageFilter.GaussianBlur(max(8, launch.width // 40)))
        overlay.putalpha(alpha)
        launch = Image.alpha_composite(launch.convert("RGBA"), overlay).convert("RGB")
        write_derived(
            by_name["open_graph_launch"],
            launch,
            source_paths=[home],
            kind="open-graph-safe-crop",
        )

    with Image.open(life_map) as source:
        write_derived(
            by_name["open_graph_life_map"],
            source.convert("RGB"),
            source_paths=[life_map],
            kind="open-graph-safe-crop",
        )

    status_entry = by_name["status_route_matrix_main"]
    status_size = provider_renderer.target_dimensions(
        status_entry, max(int(v) for v in status_entry["sizes"])
    )
    status = Image.new("RGB", status_size, (8, 12, 24))
    cols, rows = 3, 3
    cell_w = status_size[0] // cols
    cell_h = status_size[1] // rows
    for index, path in enumerate(route_paths):
        with Image.open(path) as source:
            tile = fit_source(source, (cell_w, cell_h))
        x = (index % cols) * cell_w
        y = (index // cols) * cell_h
        status.paste(tile, (x, y))
    status = status.filter(ImageFilter.GaussianBlur(1.2))
    glow = Image.new("RGBA", status_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for index in range(9):
        x = (index % cols) * cell_w + cell_w // 2
        y = (index // cols) * cell_h + cell_h // 2
        radius = max(8, min(cell_w, cell_h) // 18)
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=(100, 220, 255, 210))
    glow = glow.filter(ImageFilter.GaussianBlur(max(6, cell_w // 20)))
    status = Image.alpha_composite(status.convert("RGBA"), glow).convert("RGB")
    write_derived(
        status_entry,
        status,
        source_paths=route_paths,
        kind="provider-route-montage",
    )

    status_main_path = output_path(status_entry)
    with Image.open(status_main_path) as source:
        write_derived(
            by_name["status_route_matrix_mobile"],
            source.convert("RGB"),
            source_paths=route_paths,
            kind="mobile-crop-of-provider-route-montage",
        )

    pill_entry = by_name["status_health_pill"]
    pill_size = provider_renderer.target_dimensions(
        pill_entry, max(int(v) for v in pill_entry["sizes"])
    )
    with Image.open(status_main_path) as source:
        background = fit_source(source, pill_size, alpha=True).filter(
            ImageFilter.GaussianBlur(max(2, pill_size[1] // 24))
        )
    mask = Image.new("L", pill_size, 0)
    mask_draw = ImageDraw.Draw(mask)
    radius = pill_size[1] // 2
    mask_draw.rounded_rectangle((2, 2, pill_size[0]-3, pill_size[1]-3), radius=radius, fill=235)
    pill = Image.new("RGBA", pill_size, (0, 0, 0, 0))
    pill.paste(background, (0, 0), mask)
    draw = ImageDraw.Draw(pill)
    center_y = pill_size[1] // 2
    node_radius = max(12, pill_size[1] // 7)
    spacing = pill_size[0] // 4
    for index, fill in enumerate(((100, 225, 255, 255), (255, 211, 112, 255), (130, 255, 205, 255)), start=1):
        x = spacing * index
        for expansion, alpha_value in ((18, 25), (10, 55), (4, 110)):
            draw.ellipse(
                (x-node_radius-expansion, center_y-node_radius-expansion,
                 x+node_radius+expansion, center_y+node_radius+expansion),
                fill=(*fill[:3], alpha_value),
            )
        draw.ellipse(
            (x-node_radius, center_y-node_radius, x+node_radius, center_y+node_radius),
            fill=fill,
        )
    write_derived(
        pill_entry,
        pill,
        source_paths=[status_main_path],
        kind="provider-status-health-indicator",
    )


def build_quality_report(entries: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, str]]:
    records = [score_v1_assets.score(entry, True) for entry in entries]
    failed = [record for record in records if record["status"] != "passed"]
    report = {
        "schemaVersion": "2.1.0",
        "status": "failed" if failed else "passed",
        "requireProvider": True,
        "providerBacked": len(records),
        "directProvider": sum(1 for entry in entries if entry["name"] not in DERIVED),
        "derivedProvider": sum(1 for entry in entries if entry["name"] in DERIVED),
        "passed": len(records) - len(failed),
        "failed": len(failed),
        "assets": records,
    }
    feedback = {
        record["name"]: (
            "Regenerate as richer premium cinematic production art. "
            + "; ".join(record.get("issues", []))
        )
        for record in failed
    }
    write_json(QUALITY, report)
    write_json(FEEDBACK, feedback)
    for record in failed:
        print(f"FAIL {record['name']}: {'; '.join(record.get('issues', []))}")
    return report, feedback


def main() -> int:
    os.environ["URAI_VERSION"] = "v1"
    os.environ["ASSET_FORGE_SKIP_EXISTING_OUTPUTS"] = "1"
    if os.environ.get("ASSET_FORGE_MAX_PROVIDER_CALLS") != str(EXPECTED_NEW_CALLS):
        raise ValueError("Exact provider-call ceiling must remain 47")
    if os.environ.get("ASSET_FORGE_MAX_COST_USD") != "47.00":
        raise ValueError("Exact total reserved-cost ceiling must remain USD 47.00")

    canonical_path = canonical_release_manifests.build("v1")
    entries = apply_overrides(load_json(canonical_path))
    if len(entries) != EXPECTED_OUTPUTS:
        raise ValueError(f"Expected {EXPECTED_OUTPUTS} canonical V1 outputs; found {len(entries)}")
    direct_entries = [entry for entry in entries if entry["name"] not in DERIVED]
    if len(direct_entries) != EXPECTED_DIRECT:
        raise ValueError(f"Expected {EXPECTED_DIRECT} provider masters; found {len(direct_entries)}")

    seed_proven_home(direct_entries)
    ACTIVE_MANIFEST.write_text(json.dumps(direct_entries, indent=2) + "\n", encoding="utf-8")
    generation = render_v1_round.render_round(1)
    if generation.get("outputRequests") != EXPECTED_NEW_CALLS:
        raise ValueError(
            f"Expected exactly {EXPECTED_NEW_CALLS} new provider requests; "
            f"observed {generation.get('outputRequests')}"
        )

    provider_manifest = load_json(ACTIVE_MANIFEST)
    provider_by_name = {entry["name"]: entry for entry in provider_manifest}
    for entry in entries:
        provider_entry = provider_by_name.get(entry["name"])
        if provider_entry:
            entry.update(provider_entry)
            if output_path(entry).is_file():
                entry["status"] = "generated"
                entry["renderer"] = "provider"

    create_derivatives(entries)
    ACTIVE_MANIFEST.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    canonical_path.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")

    validation_errors = validate_assets.validate()
    report, _ = build_quality_report(entries)
    if validation_errors or report["failed"]:
        receipt = {
            "schemaVersion": "2.0.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "needs-upgrade",
            "version": "v1",
            "expectedOutputs": EXPECTED_OUTPUTS,
            "generated": EXPECTED_OUTPUTS - len(validation_errors),
            "missing": len(validation_errors),
            "qualityFailures": report["failed"],
            "newProviderCalls": generation.get("outputRequests"),
            "derivedProviderOutputs": len(DERIVED),
            "validationErrors": validation_errors,
        }
        write_json(RECEIPT, receipt)
        return 4

    create_preview.main()
    create_firebase_seed.main()
    asset_pack = export_assets.export()
    export_spatial_handoff.main()

    handoff_path = (
        BASE
        / "spatial_handoff/assets/urai/final/manifests/v1-asset-factory-spatial-handoff.json"
    )
    handoff = load_json(handoff_path)
    if handoff.get("ready") != EXPECTED_OUTPUTS or handoff.get("missing") != 0:
        raise ValueError("Spatial handoff is incomplete")

    budget_path = Path(os.environ["ASSET_FORGE_BUDGET_STATE_PATH"])
    budget = load_json(budget_path)
    attempts = budget.get("attempts", [])
    if budget.get("providerCallsExecuted") != EXPECTED_NEW_CALLS:
        raise ValueError("Budget ledger provider-call count does not equal 47")
    if any(attempt.get("status") != "succeeded" for attempt in attempts):
        raise ValueError("At least one provider attempt did not succeed")

    receipt = {
        "schemaVersion": "2.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "passed",
        "version": "v1",
        "expectedOutputs": EXPECTED_OUTPUTS,
        "ready": EXPECTED_OUTPUTS,
        "generated": EXPECTED_OUTPUTS,
        "completed": EXPECTED_OUTPUTS,
        "missing": 0,
        "directProviderOutputs": EXPECTED_DIRECT,
        "reusedProviderOutputs": 1,
        "newProviderCalls": EXPECTED_NEW_CALLS,
        "derivedProviderOutputs": len(DERIVED),
        "seedProviderRequestId": "req_105244180b6f4b95bec882bdfc1a695b",
        "budgetLedger": str(budget_path),
        "reservedEstimatedCostUsd": budget.get("reservedEstimatedCostUsd"),
        "assetPack": str(asset_pack.relative_to(BASE)),
        "spatialHandoff": str(handoff_path.relative_to(BASE)),
        "qualityReport": QUALITY.name,
        "manifest": str(canonical_path.relative_to(BASE)),
        "manifestSha256": sha256(canonical_path),
        "forgeExitCode": 0,
        "promotion": false
    }
    write_json(RECEIPT, receipt)
    write_json(BASE / "forge_receipt_v1.json", receipt)
    shutil.copy2(QUALITY, BASE / "quality_report_v1.json")
    shutil.copy2(FEEDBACK, BASE / "upgrade_feedback_v1.json")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
