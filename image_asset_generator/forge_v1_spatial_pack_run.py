#!/usr/bin/env python3
"""Generate and certify the complete provider-backed V1 Spatial asset pack."""
from __future__ import annotations

import hashlib, json, os, shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from PIL import Image, ImageDraw, ImageFilter, ImageOps

import canonical_release_manifests as canonical
import create_firebase_seed, create_preview, export_assets, export_spatial_handoff
import provider_renderer, render_v1_round, score_v1_assets, validate_assets, validate_manifest

BASE = Path(__file__).resolve().parent
ACTIVE = BASE / "manifest.json"
OVERRIDES = BASE / "spatial_prompt_overrides.json"
QUALITY = BASE / "quality_report.json"
FEEDBACK = BASE / "upgrade_feedback.json"
RECEIPT = BASE / "forge_receipt.json"
DERIVED = {
    "status_route_matrix_main", "status_route_matrix_mobile", "status_health_pill",
    "open_graph_launch", "open_graph_life_map",
}
TOTAL, MASTERS, NEW_CALLS = 53, 48, 47
SEED_REQUEST = "req_105244180b6f4b95bec882bdfc1a695b"


def read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def out(entry: dict[str, Any]) -> Path:
    size = max(int(v) for v in entry["sizes"])
    return BASE / entry["path_template"].format(size=size)


def meta(path: Path) -> Path:
    return path.with_suffix(path.suffix + ".render.json")


def target(entry: dict[str, Any]) -> tuple[int, int]:
    return provider_renderer.target_dimensions(entry, max(int(v) for v in entry["sizes"]))


def fit(image: Image.Image, dimensions: tuple[int, int], alpha: bool = False) -> Image.Image:
    return ImageOps.fit(
        image.convert("RGBA" if alpha else "RGB"), dimensions,
        method=Image.Resampling.LANCZOS, centering=(0.5, 0.5),
    )


def override(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    patches = read(OVERRIDES)
    by_name = {item["name"]: dict(item) for item in entries}
    for name, patch in patches.items():
        if name not in by_name or not isinstance(patch, dict):
            raise ValueError(f"Invalid spatial prompt override: {name}")
        by_name[name].update(patch)
    result = [by_name[item["name"]] for item in entries]
    errors = validate_manifest.validate_manifest_entries(result)
    if errors:
        raise ValueError(f"Invalid V1 manifest after spatial overrides: {errors[:10]}")
    return result


def source_request_ids(paths: list[Path]) -> list[str]:
    ids: list[str] = []
    for path in paths:
        payload = read(meta(path))
        if payload.get("renderer") != "provider":
            raise ValueError(f"Non-provider source: {path}")
        details = payload.get("metadata")
        if not isinstance(details, dict):
            raise ValueError(f"Missing provider metadata: {path}")
        direct = details.get("provider_request_id")
        inherited = details.get("source_provider_request_ids")
        if isinstance(direct, str) and direct:
            ids.append(direct)
        elif isinstance(inherited, list) and inherited and all(isinstance(v, str) and v for v in inherited):
            ids.extend(inherited)
        else:
            raise ValueError(f"Missing provider request id: {path}")
    return list(dict.fromkeys(ids))


def seed_home(entries: list[dict[str, Any]]) -> None:
    root = Path(os.environ["ASSET_FORGE_SEED_DIR"]).resolve()
    entry = next(item for item in entries if item["name"] == "home_threshold_main")
    destination = out(entry)
    candidates = list(root.rglob(destination.name))
    if len(candidates) != 1:
        raise ValueError(f"Expected one proven Home seed; found {len(candidates)}")
    source = candidates[0]
    payload = read(meta(source))
    details = payload.get("metadata", {})
    if payload.get("renderer") != "provider":
        raise ValueError("Proven Home seed is not provider-backed")
    if details.get("provider_request_id") != SEED_REQUEST or details.get("provider_model") != "gpt-image-2":
        raise ValueError("Proven Home seed identity mismatch")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    shutil.copy2(meta(source), meta(destination))
    with Image.open(destination) as image:
        if image.size != target(entry):
            raise ValueError("Proven Home seed dimensions mismatch")
    print(f"SEEDED home_threshold_main sha256={digest(destination)}")


def derived(entry: dict[str, Any], image: Image.Image, sources: list[Path], kind: str) -> None:
    destination = out(entry)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image = fit(image, target(entry), bool(entry.get("alpha")))
    image.save(destination, "PNG", optimize=True)
    ids = source_request_ids(sources)
    write(meta(destination), {
        "name": entry["name"], "category": entry["category"],
        "prompt_version": entry.get("prompt_version", "v1"),
        "aspect_ratio": entry.get("aspect_ratio", "1:1"),
        "renderer": "provider", "attempt": 0,
        "metadata": {
            "provider": "derived-provider", "derivation_kind": kind,
            "source_assets": [str(path.relative_to(BASE)) for path in sources],
            "source_provider_request_ids": ids,
            "target_width": image.width, "target_height": image.height,
        },
    })
    entry.update({
        "status": "generated", "renderer": "provider",
        "derivation": {"kind": kind, "sourceProviderRequestIds": ids},
    })
    print(f"DERIVED {entry['name']} kind={kind} sha256={digest(destination)}")


def make_derivatives(entries: list[dict[str, Any]]) -> None:
    items = {item["name"]: item for item in entries}
    home, galaxy = out(items["home_threshold_main"]), out(items["life_map_galaxy_main"])

    with Image.open(home) as image:
        derived(items["open_graph_launch"], image, [home], "open-graph-safe-crop")
    with Image.open(galaxy) as image:
        derived(items["open_graph_life_map"], image, [galaxy], "open-graph-safe-crop")

    route_names = [
        "home_threshold_main", "ground_world_main", "life_map_galaxy_main",
        "focus_memory_chamber_main", "replay_memory_film_main",
        "mirror_reflection_main", "passport_vault_main",
        "privacy_controls_main", "location_emotional_weather_main",
    ]
    route_paths = [out(items[name]) for name in route_names]
    status_entry = items["status_route_matrix_main"]
    width, height = target(status_entry)
    canvas = Image.new("RGB", (width, height), (7, 11, 24))
    cell_w, cell_h = width // 3, height // 3
    for index, path in enumerate(route_paths):
        with Image.open(path) as image:
            tile = fit(image, (cell_w, cell_h))
        canvas.paste(tile, ((index % 3) * cell_w, (index // 3) * cell_h))
    canvas = canvas.filter(ImageFilter.GaussianBlur(1.1))
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for index in range(9):
        x, y = (index % 3) * cell_w + cell_w // 2, (index // 3) * cell_h + cell_h // 2
        r = max(8, min(cell_w, cell_h) // 18)
        draw.ellipse((x-r, y-r, x+r, y+r), fill=(100, 220, 255, 210))
    canvas = Image.alpha_composite(
        canvas.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(max(6, cell_w // 20)))
    ).convert("RGB")
    derived(status_entry, canvas, route_paths, "provider-route-montage")

    status_path = out(status_entry)
    with Image.open(status_path) as image:
        derived(
            items["status_route_matrix_mobile"], image, route_paths,
            "mobile-crop-of-provider-route-montage",
        )

    pill_entry = items["status_health_pill"]
    dimensions = target(pill_entry)
    with Image.open(status_path) as image:
        background = fit(image, dimensions, True).filter(
            ImageFilter.GaussianBlur(max(2, dimensions[1] // 24))
        )
    mask = Image.new("L", dimensions, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (2, 2, dimensions[0]-3, dimensions[1]-3),
        radius=dimensions[1] // 2, fill=235,
    )
    pill = Image.new("RGBA", dimensions, (0, 0, 0, 0))
    pill.paste(background, (0, 0), mask)
    draw = ImageDraw.Draw(pill)
    y, r, spacing = dimensions[1] // 2, max(12, dimensions[1] // 7), dimensions[0] // 4
    for index, color in enumerate(
        ((100, 225, 255, 255), (255, 211, 112, 255), (130, 255, 205, 255)), 1
    ):
        x = spacing * index
        draw.ellipse((x-r, y-r, x+r, y+r), fill=color)
    derived(pill_entry, pill, [status_path], "provider-status-health-indicator")


def quality(entries: list[dict[str, Any]]) -> dict[str, Any]:
    records = [score_v1_assets.score(entry, True) for entry in entries]
    failed = [item for item in records if item["status"] != "passed"]
    report = {
        "schemaVersion": "2.1.0", "status": "failed" if failed else "passed",
        "requireProvider": True, "providerBacked": len(records),
        "directProvider": len(records) - len(DERIVED), "derivedProvider": len(DERIVED),
        "passed": len(records) - len(failed), "failed": len(failed), "assets": records,
    }
    write(QUALITY, report)
    write(FEEDBACK, {
        item["name"]: "Regenerate as richer premium cinematic production art. "
        + "; ".join(item.get("issues", []))
        for item in failed
    })
    return report


def main() -> int:
    os.environ.update(URAI_VERSION="v1", ASSET_FORGE_SKIP_EXISTING_OUTPUTS="1")
    if os.environ.get("ASSET_FORGE_MAX_PROVIDER_CALLS") != "47":
        raise ValueError("Provider-call ceiling must remain 47")
    if os.environ.get("ASSET_FORGE_MAX_COST_USD") != "47.00":
        raise ValueError("Reserved-cost ceiling must remain USD 47.00")

    canonical_path = canonical.build("v1")
    entries = override(read(canonical_path))
    masters = [item for item in entries if item["name"] not in DERIVED]
    if len(entries) != TOTAL or len(masters) != MASTERS:
        raise ValueError("V1 inventory count mismatch")

    seed_home(masters)
    ACTIVE.write_text(json.dumps(masters, indent=2) + "\n", encoding="utf-8")
    generation = render_v1_round.render_round(1)
    if generation.get("outputRequests") != NEW_CALLS:
        raise ValueError(f"Expected 47 new provider calls; found {generation.get('outputRequests')}")

    generated = {item["name"]: item for item in read(ACTIVE)}
    for entry in entries:
        if entry["name"] in generated:
            entry.update(generated[entry["name"]])
            entry.update(status="generated", renderer="provider")

    make_derivatives(entries)
    payload = json.dumps(entries, indent=2) + "\n"
    ACTIVE.write_text(payload, encoding="utf-8")
    canonical_path.write_text(payload, encoding="utf-8")

    validation = validate_assets.validate()
    report = quality(entries)
    if validation or report["failed"]:
        write(RECEIPT, {
            "schemaVersion": "2.0.0", "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "needs-upgrade", "version": "v1", "expectedOutputs": TOTAL,
            "missing": len(validation), "qualityFailures": report["failed"],
            "newProviderCalls": generation["outputRequests"], "validationErrors": validation,
        })
        return 4

    create_preview.main()
    create_firebase_seed.main()
    pack = export_assets.export()
    export_spatial_handoff.main()
    handoff_path = BASE / "spatial_handoff/assets/urai/final/manifests/v1-asset-factory-spatial-handoff.json"
    handoff = read(handoff_path)
    if handoff.get("ready") != TOTAL or handoff.get("missing") != 0:
        raise ValueError("Spatial handoff is incomplete")

    ledger_path = Path(os.environ["ASSET_FORGE_BUDGET_STATE_PATH"])
    ledger = read(ledger_path)
    if ledger.get("providerCallsExecuted") != NEW_CALLS:
        raise ValueError("Budget ledger count mismatch")
    if any(item.get("status") != "succeeded" for item in ledger.get("attempts", [])):
        raise ValueError("A provider request failed")

    receipt = {
        "schemaVersion": "2.0.0", "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "passed", "version": "v1", "expectedOutputs": TOTAL,
        "ready": TOTAL, "generated": TOTAL, "completed": TOTAL, "missing": 0,
        "directProviderOutputs": MASTERS, "reusedProviderOutputs": 1,
        "newProviderCalls": NEW_CALLS, "derivedProviderOutputs": len(DERIVED),
        "seedProviderRequestId": SEED_REQUEST,
        "reservedEstimatedCostUsd": ledger.get("reservedEstimatedCostUsd"),
        "assetPack": str(pack.relative_to(BASE)),
        "spatialHandoff": str(handoff_path.relative_to(BASE)),
        "qualityReport": QUALITY.name, "manifest": str(canonical_path.relative_to(BASE)),
        "manifestSha256": digest(canonical_path), "forgeExitCode": 0, "promotion": False,
    }
    write(RECEIPT, receipt)
    write(BASE / "forge_receipt_v1.json", receipt)
    shutil.copy2(QUALITY, BASE / "quality_report_v1.json")
    shutil.copy2(FEEDBACK, BASE / "upgrade_feedback_v1.json")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
