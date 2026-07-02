"""Export Asset Factory outputs into the canonical URAI Spatial asset contract."""

from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
HANDOFF_DIR = BASE_DIR / "spatial_handoff"

CANONICAL_PATHS: Dict[str, str] = {
    "home_threshold_main": "assets/urai/home/home-threshold-main.webp",
    "home_threshold_mobile": "assets/urai/home/home-threshold-mobile.webp",
    "home_ground_portal": "assets/urai/home/home-ground-portal.webp",
    "home_sky_ascent": "assets/urai/home/home-sky-ascent.webp",
    "ground_world_main": "assets/urai/ground/ground-world-main.webp",
    "ground_world_mobile": "assets/urai/ground/ground-world-mobile.webp",
    "ground_reception": "assets/urai/ground/ground-reception.webp",
    "ground_privacy_sanctuary": "assets/urai/ground/ground-privacy-sanctuary.webp",
    "ground_logistics": "assets/urai/ground/ground-logistics.webp",
    "ground_wellness": "assets/urai/ground/ground-wellness.webp",
    "ground_memory_archive": "assets/urai/ground/ground-memory-archive.webp",
    "life_map_galaxy_main": "assets/urai/life-map/life-map-galaxy-main.webp",
    "life_map_galaxy_mobile": "assets/urai/life-map/life-map-galaxy-mobile.webp",
    "life_map_node_threshold": "assets/urai/life-map/life-map-node-threshold.webp",
    "life_map_node_becoming": "assets/urai/life-map/life-map-node-becoming.webp",
    "life_map_node_studio": "assets/urai/life-map/life-map-node-studio.webp",
    "focus_memory_chamber_main": "assets/urai/focus/focus-memory-chamber-main.webp",
    "focus_memory_chamber_mobile": "assets/urai/focus/focus-memory-chamber-mobile.webp",
    "replay_memory_film_main": "assets/urai/replay/replay-memory-film-main.webp",
    "replay_memory_film_mobile": "assets/urai/replay/replay-memory-film-mobile.webp",
    "mirror_reflection_main": "assets/urai/mirror/mirror-reflection-main.webp",
    "mirror_reflection_mobile": "assets/urai/mirror/mirror-reflection-mobile.webp",
    "mirror_pattern_glyph": "assets/urai/mirror/mirror-pattern-glyph.webp",
    "passport_vault_main": "assets/urai/passport/passport-vault-main.webp",
    "passport_vault_mobile": "assets/urai/passport/passport-vault-mobile.webp",
    "passport_ownership_seal": "assets/urai/passport/passport-ownership-seal.webp",
    "privacy_controls_main": "assets/urai/privacy-controls/privacy-controls-main.webp",
    "privacy_controls_mobile": "assets/urai/privacy-controls/privacy-controls-mobile.webp",
    "privacy_model_access": "assets/urai/privacy-controls/privacy-model-access.webp",
    "privacy_location_precision": "assets/urai/privacy-controls/privacy-location-precision.webp",
    "location_emotional_weather_main": "assets/urai/location-map/location-emotional-weather-main.webp",
    "location_emotional_weather_mobile": "assets/urai/location-map/location-emotional-weather-mobile.webp",
    "location_place_node": "assets/urai/location-map/location-place-node.webp",
    "status_route_matrix_main": "assets/urai/status/status-route-matrix-main.webp",
    "status_route_matrix_mobile": "assets/urai/status/status-route-matrix-mobile.webp",
    "status_health_pill": "assets/urai/status/status-health-pill.webp",
    "avatar_receptionist": "assets/urai/avatars/receptionist.webp",
    "avatar_privacy_steward": "assets/urai/avatars/privacy-steward.webp",
    "avatar_schedule_steward": "assets/urai/avatars/schedule-steward.webp",
    "avatar_wellness_guide": "assets/urai/avatars/wellness-guide.webp",
    "avatar_logistics_helper": "assets/urai/avatars/logistics-helper.webp",
    "avatar_archivist": "assets/urai/avatars/archivist.webp",
    "orb_idle": "assets/urai/ui/orb-idle.webp",
    "orb_active": "assets/urai/ui/orb-active.webp",
    "orb_listening": "assets/urai/ui/orb-listening.webp",
    "open_graph_launch": "assets/urai/social/open-graph-launch.webp",
    "open_graph_life_map": "assets/urai/social/open-graph-life-map.webp"
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_for(entry: Dict[str, Any]) -> Optional[Tuple[int, Path]]:
    outputs = []
    for raw_size in entry.get("sizes", []):
        size = int(raw_size)
        candidate = BASE_DIR / entry["path_template"].format(size=size)
        if candidate.exists():
            outputs.append((size, candidate))
    return max(outputs, key=lambda item: item[0]) if outputs else None


def export_entry(entry: Dict[str, Any], canonical_path: str) -> Dict[str, Any]:
    source = source_for(entry)
    if not source:
        return {"name": entry["name"], "status": "missing", "canonicalPath": canonical_path}

    size, source_path = source
    destination = HANDOFF_DIR / canonical_path
    destination.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(source_path)
    image.load()
    alpha = bool(entry.get("alpha"))
    image = image.convert("RGBA" if alpha else "RGB")
    image.save(destination, "WEBP", quality=94, method=6, lossless=alpha)

    metadata_path = source_path.with_suffix(source_path.suffix + ".render.json")
    metadata: Dict[str, Any] = {}
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    return {
        "name": entry["name"],
        "status": "ready",
        "category": entry["category"],
        "canonicalPath": canonical_path,
        "sourcePath": str(source_path.relative_to(BASE_DIR)),
        "sourceSize": size,
        "width": image.width,
        "height": image.height,
        "aspectRatio": entry.get("aspect_ratio", "1:1"),
        "alpha": alpha,
        "sha256": sha256(destination),
        "bytes": destination.stat().st_size,
        "promptVersion": entry.get("prompt_version", "v1"),
        "renderer": metadata.get("renderer") or entry.get("renderer") or "unknown"
    }


def main() -> None:
    entries = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    by_name = {entry["name"]: entry for entry in entries}

    if HANDOFF_DIR.exists():
        shutil.rmtree(HANDOFF_DIR)
    HANDOFF_DIR.mkdir(parents=True, exist_ok=True)

    assets = []
    for name, canonical_path in CANONICAL_PATHS.items():
        entry = by_name.get(name)
        if not entry:
            assets.append({"name": name, "status": "unmanifested", "canonicalPath": canonical_path})
        else:
            assets.append(export_entry(entry, canonical_path))

    ready = [asset for asset in assets if asset["status"] == "ready"]
    missing = [asset for asset in assets if asset["status"] != "ready"]
    handoff = {
        "schemaVersion": "2.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "producer": "LifeLoggerAI/asset-factory",
        "consumer": "LifeLoggerAI/urai-spatial",
        "copyRoot": "urai-tier1/public",
        "ready": len(ready),
        "missing": len(missing),
        "assets": assets
    }
    manifest_out = HANDOFF_DIR / "assets" / "urai" / "final" / "manifests" / "asset-factory-spatial-handoff.json"
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(handoff, indent=2) + "\n", encoding="utf-8")

    print(f"Spatial handoff ready={len(ready)} missing={len(missing)}")
    print(f"HANDOFF_DIR={HANDOFF_DIR}")
    print(f"HANDOFF_MANIFEST={manifest_out}")
    for asset in missing:
        print(f"MISSING {asset['name']} -> {asset['canonicalPath']}")


if __name__ == "__main__":
    main()
