#!/usr/bin/env python3
"""Write-once 1.0.4 geometry and complete connected navigation successors.

No body-clear grid sector is removed to make connectivity pass. Runtime,
full-scene headroom, visual, traffic and device acceptance remain false.
"""
from __future__ import annotations
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import math
from pathlib import Path
import shutil
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "qa"))
from navigation_safety import audit_navigation, audit_package, cell_connectivity, cylinder_clear, disk_supported, floor_rectangles
from validate_package import load_json, validate_package

spec = importlib.util.spec_from_file_location("preserved_connected_world_builder", ROOT / "build/build.py")
original = importlib.util.module_from_spec(spec); spec.loader.exec_module(original)
VERSION = "1.0.4"
CHANGED_KINDS = {"living", "school", "church", "lake", "street"}

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def move_parts(scene, part_predicate, block_predicate, offset):
    moved_parts = moved_blocks = 0
    for i, (name, material, positions, normals, uv, indices, category) in enumerate(scene.parts):
        center = positions.mean(0)
        if part_predicate(center, category):
            scene.parts[i] = (name, material, positions + np.asarray(offset(center), dtype="float32"), normals, uv, indices, category)
            moved_parts += 1
    for block in scene.blocks:
        center = (np.asarray(block["min"]) + block["max"]) / 2
        if block_predicate(block, center):
            delta = np.asarray(offset(center))
            for key in ("min", "max"): block[key] = (np.asarray(block[key]) + delta).round(6).tolist()
            moved_blocks += 1
    if not moved_parts or not moved_blocks: raise ValueError("Targeted furniture source changed; refusing unbound movement")
    return {"movedRenderParts": moved_parts, "movedCollisionVolumes": moved_blocks}

def connected_scene(row, profile):
    scene = original.create_family(*row, profile)
    identifier, title, width, depth, height, kind = row
    changes = []
    if kind == "living":
        moved = move_parts(scene, lambda c, k: k == "furniture" and c[2] < -1.95 and -1.5 < c[0] < .5,
            lambda b, c: b["id"].startswith("cabinet") and b["max"][2] < -1.9 and b["min"][0] < 0,
            lambda c: [.9, 0, 0])
        changes.append({"change": "Rear cabinet and books shifted .9 m in +X to open rear circulation", **moved})
    elif kind == "school":
        moved = move_parts(scene, lambda c, k: k == "furniture" and abs(c[0]) > 1.85 and c[2] > -2.4,
            lambda b, c: b["id"].split("-")[0] in ("table", "chair") and abs(c[0]) > 2 and c[2] > -2.4,
            lambda c: [-.2 * float(np.sign(c[0])), 0, 0])
        changes.append({"change": "Outer desk/chair columns moved .2 m inward to open both outer aisles", **moved})
    elif kind == "church":
        scene.parts = [p for p in scene.parts if p[0] not in ("corridor-floor", "corridor-ceiling", "corridor-far-wall")]
        scene.blocks = [b for b in scene.blocks if not b["id"].startswith("corridor-wall")]
        corridor_depth = 2.75; center = depth / 2 + corridor_depth / 2 + .10; end = depth / 2 + corridor_depth + .10
        scene.box("corridor-floor", (width + .22, .16, corridor_depth), (0, -.08, center), "linoleum", category="floor")
        scene.box("corridor-ceiling", (width + .22, .10, corridor_depth), (0, height + .05, center), "cream", category="ceiling")
        scene.box("corridor-far-wall", (width + .22, height, .12), (0, height / 2, end), "plaster", category="walls")
        scene.block("corridor-wall", (0, height / 2, end), (width + .22, height, .12))
        next(z for z in scene.zones if z["id"] == "hall")["max"][2] = end
        changes.append({"change": "Fellowship corridor extended .75 m with matching floor/ceiling/wall/collision; original tables preserved"})
    elif kind == "lake":
        moved = move_parts(scene, lambda c, k: k == "furniture" and c[0] > 1 and c[2] > 6.3,
            lambda b, c: b["id"].split("-")[0] in ("table", "chair") and b["min"][0] > 1 and b["max"][2] > 6.3,
            lambda c: [0, 0, -.6])
        changes.append({"change": "Shore table/chair shifted .6 m in -Z to open a route behind the table", **moved})
    elif kind == "street":
        scene.parts = [p for p in scene.parts if p[0] != "curb"]
        for side in (-1, 1):
            for sign in (-1, 1):
                length = depth / 2 - 1.1; center = sign * (1.1 + length / 2)
                scene.box("curb-segment", (.14, .16, length), (side * 3.08, -.065, center), "concrete", .005, "architecture")
        scene.box("raised-pedestrian-crossing", (6.4, .06, 2.2), (0, -.03, 0), "concrete", category="floor")
        for z in np.arange(-.9, 1.0, .30): scene.box("unbranded-crossing-mark", (5.6, .003, .14), (0, .0015, float(z)), "cream", category="floor-dressing")
        scene.zones.append({"id": "pedestrian-crossing", "min": [-5.1, 0, -1.1], "max": [5.1, 0, 1.1]})
        changes.append({"change": "Real generic raised crossing joins both sidewalks; curb segments end outside crossing", "trafficSafetyAndRuntimeAdmission": False})
    return scene, changes

def connected_navigation(scene, row):
    floors = floor_rectangles(scene.zones)
    radius = .45; height = 1.7; step = .20; margin = radius + math.sqrt(2) * step / 2
    centers = []
    for ix in range(math.ceil(min(r[0] for r in floors) / step), math.floor(max(r[1] for r in floors) / step) + 1):
        for iz in range(math.ceil(min(r[2] for r in floors) / step), math.floor(max(r[3] for r in floors) / step) + 1):
            p = [round(ix * step, 4), 0, round(iz * step, 4)]
            if not disk_supported(p, margin, floors): continue
            if any(b["min"][0] - radius - step / 2 < p[0] < b["max"][0] + radius + step / 2 and
                   b["min"][2] - radius - step / 2 < p[2] < b["max"][2] + radius + step / 2 and
                   b["max"][1] > 0 and b["min"][1] < height for b in scene.blocks): continue
            centers.append(p)
    if not centers: raise ValueError("No complete standing cells: " + scene.id)
    preferred = [0, 0, row[3] / 2 - .7]
    if row[-1] == "street": preferred = [-4.1, 0, 9]
    if row[-1] == "lake": preferred = [0, 0, 6]
    entry = min(centers, key=lambda p: (p[0] - preferred[0]) ** 2 + (p[2] - preferred[2]) ** 2)
    polygons = [{"id": f"walk-cell-{i:05d}", "vertices": [[round(p[0] + dx, 4), 0, round(p[2] + dz, 4)]
                for dx, dz in [(-step/2, -step/2), (-step/2, step/2), (step/2, step/2), (step/2, -step/2)]]} for i, p in enumerate(centers)]
    nav = {"schemaVersion": "urai-generic-navigation-v1", "units": "meters", "agent": {"radius": radius, "height": height, "minClearance": .90},
           "walkablePolygons": polygons, "blockedVolumes": scene.blocks, "floorSupportZones": scene.zones,
           "entry": entry, "exit": entry, "teleportZones": [], "cellSize": step,
           "navmeshStatus": "GENERATED_PLANAR_METADATA_NOT_RUNTIME_BAKED", "clearanceChecked": True,
           "orientationLandmark": {"id": "entry-opening", "position": [0, 0, row[3]/2]},
           "teleportPolicy": {"centerOnly": True, "radiusIncludesAgentFootprint": True, "turningDiameterMeters": 1.5,
                              "fullSceneHeadroom": "NOT_VERIFIED", "controllerAcceptance": False},
           "knownLimitations": ["Planar global grid and declared AABB volumes; full scene/controller/headroom not verified", "Generic crossing has no traffic safety acceptance"]}
    connectivity = cell_connectivity(nav)
    if not connectivity["allCellsConnectedToEntry"]: raise ValueError("Disconnected body-clear sectors are not hidden: " + scene.id)
    candidates = []
    for p in centers:
        if disk_supported(p, .75, floors) and cylinder_clear(p, .75, height, scene.blocks):
            clearance = min((math.hypot(max(b["min"][0] - p[0], 0, p[0] - b["max"][0]), max(b["min"][2] - p[2], 0, p[2] - b["max"][2])) for b in scene.blocks), default=10)
            candidates.append((clearance, p))
    for _, p in sorted(candidates, key=lambda item: (-item[0], item[1])):
        if any(math.hypot(p[0] - t["position"][0], p[2] - t["position"][2]) < 1.8 for t in nav["teleportZones"]): continue
        nav["teleportZones"].append({"id": f"safe-teleport-{len(nav['teleportZones'])}", "position": p, "radius": .75})
        if len(nav["teleportZones"]) == 3: break
    if not nav["teleportZones"]: raise ValueError("No complete 1.5 m landing disk: " + scene.id)
    checked = audit_navigation(nav, scene.zones)
    if not checked["passed"]: raise ValueError("Independent landing audit rejected successor: " + str(checked["failures"]))
    nav.update({"reachableCellsFromEntry": len(centers), "totalWalkableCells": len(centers), "disconnectedWalkableCellIds": [],
                "allStandingCellsRetained": True, "staticBodyFootprintConnected": True, "walkAcceptanceAllowed": False,
                "walkAcceptanceBlockers": checked["walkAcceptanceBlockers"]})
    return nav

def build_successor(row):
    identifier = row[0]; source = ROOT / "packages" / identifier / "1.0.3"; target = source.parent / VERSION
    if target.exists(): raise FileExistsError("Version exists; retained history cannot be overwritten: " + str(target))
    if not validate_package(source / "manifest.json")["passed"]: raise ValueError("Predecessor dependencies invalid: " + identifier)
    manifest = copy.deepcopy(load_json(source / "manifest.json")); desktop, changes = connected_scene(row, "desktop")
    nav = connected_navigation(desktop, row); target.mkdir(parents=True); changed_geometry = row[-1] in CHANGED_KINDS
    for record in manifest["files"]:
        destination = target / record["path"]
        if record["role"] == "navigation": original.write_json(destination, nav)
        elif record["role"] not in ("geometry", "collision") or not changed_geometry: shutil.copyfile(source / record["path"], destination)
    if changed_geometry:
        for profile, (level, *_) in original.PROFILES.items():
            scene, _ = connected_scene(row, profile); data, measured = original.glb_bytes(scene)
            (target / f"lod{level}.glb").write_bytes(data); manifest["profiles"][profile]["measuredStatic"] = measured
        data, _ = original.glb_bytes(original.collision_scene(desktop), True); (target / "collision.glb").write_bytes(data)
    for record in manifest["files"]:
        record["sha256"] = digest(target / record["path"]); record["bytes"] = (target / record["path"]).stat().st_size
    manifest.update({"version": VERSION, "status": "NEEDS_REWORK", "bounds": manifest["profiles"]["desktop"]["measuredStatic"]["bounds"]})
    manifest["successorSource"] = {"predecessorVersion": "1.0.3", "predecessorManifestSha256": digest(source / "manifest.json"),
        "preservedBuilderSha256": digest(ROOT / "build/build.py"), "connectedSuccessorSha256": digest(Path(__file__)),
        "independentNavigationAuditSha256": digest(ROOT / "qa/navigation_safety.py"), "geometryChanged": changed_geometry, "changes": changes,
        "navigation": "Origin-aligned .20 m cells, .45 m agent radius, all conservative standing cells retained", "artAcceptanceTransferred": False}
    original.write_json(target / "manifest.json", manifest); audit = audit_package(target / "manifest.json")
    if not audit["passed"] or not audit["connectivity"]["allCellsConnectedToEntry"]: raise ValueError("Actual GLB/navigation audit rejected successor: " + identifier)
    original.write_json(target / "navigation-safety-receipt.json", audit)
    original.write_json(target / "build-receipt.json", {"schemaVersion": "urai-connected-world-successor-receipt-v1", "builtAt": datetime.now(timezone.utc).isoformat(),
        "id": identifier, "version": VERSION, "successorSource": manifest["successorSource"], "manifestSha256": digest(target / "manifest.json"),
        "navigationSafetySha256": digest(target / "navigation-safety-receipt.json"), "files": manifest["files"],
        "providerCalls": 0, "paidCreditsSpent": 0, "visualAccepted": False, "runtimeIntegrated": False, "physicalDeviceTested": False})
    return {"id": identifier, "version": VERSION, "geometryChanged": changed_geometry, "manifestSha256": digest(target / "manifest.json"),
        "navigationSafetySha256": digest(target / "navigation-safety-receipt.json"), "walkableCells": len(nav["walkablePolygons"]),
        "disconnectedCells": 0, "teleportZones": len(nav["teleportZones"]), "walkAcceptanceAllowed": False, "visualAccepted": False, "runtimeIntegrated": False}

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("--only"); args = parser.parse_args()
    index = ROOT / "receipts/connected-successor-1.0.4-index.json"
    if index.exists(): parser.error("Successor index exists; choose a new versioned implementation")
    rows = [r for r in original.FAMILIES + original.BATCH2 if not args.only or r[0] == args.only]
    if not rows: parser.error("Unknown family")
    results = []
    for row in rows:
        result = build_successor(row); results.append(result); print(__import__('json').dumps(result), flush=True)
    original.write_json(index, {"schemaVersion": "urai-connected-successor-index-v1", "version": VERSION, "worlds": results,
        "providerCalls": 0, "paidCreditsSpent": 0, "visualAccepted": False, "runtimeIntegrated": False, "physicalDeviceTested": False})

if __name__ == "__main__": main()
