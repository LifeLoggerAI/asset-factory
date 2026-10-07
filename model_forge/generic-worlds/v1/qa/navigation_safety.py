#!/usr/bin/env python3
"""Independent floor-disk, declared-volume and cell-connectivity asset audit.

Floor support comes from actual collision GLB triangles. This is static asset
evidence; it never grants movement, controller, visual or physical-device proof.
"""
from __future__ import annotations

import argparse
from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np

from validate import InvalidAsset, Validator, require, vector
from validate_package import load_json, validate_navigation, validate_package

EPS = 1e-6


def merged_intervals(intervals):
    result = []
    for low, high in sorted(intervals):
        if result and low <= result[-1][1] + EPS:
            result[-1][1] = max(result[-1][1], high)
        else:
            result.append([low, high])
    return result


def floor_rectangles(zones):
    result = []
    require(isinstance(zones, list) and bool(zones), "FLOOR_EMPTY", "$.floorSupportZones", "No floor support geometry")
    for i, zone in enumerate(zones):
        low, high = vector(zone.get("min"), 3, str(i)), vector(zone.get("max"), 3, str(i))
        require(abs(low[1] - high[1]) <= EPS and high[0] > low[0] and high[2] > low[2],
                "FLOOR_RECTANGLE", str(i), "Expected positive horizontal floor rectangle")
        result.append((float(low[0]), float(high[0]), float(low[2]), float(high[2]), float(low[1])))
    return result


def disk_supported(position, radius, rectangles):
    """Prove the entire closed disk is covered by a union of flat rectangles.

    The rectangle union is constant inside each x slab. The widest disk slice
    in each slab occurs at its point nearest the center, so an exact interval
    containment check covers every point, including holes and narrow notches.
    No angular/perimeter sampling is used.
    """
    x, y, z = position
    if not all(math.isfinite(v) for v in (*position, radius)) or radius <= 0:
        return False
    rectangles = [r for r in rectangles if abs(r[4] - y) <= EPS]
    if not rectangles:
        return False
    cuts = sorted({x - radius, x + radius, *(v for r in rectangles for v in r[:2] if x - radius < v < x + radius)})
    for left, right in zip(cuts, cuts[1:]):
        middle = (left + right) / 2
        intervals = merged_intervals((r[2], r[3]) for r in rectangles if r[0] <= middle <= r[1])
        nearest = max(left, min(x, right))
        half = math.sqrt(max(0.0, radius * radius - (nearest - x) ** 2))
        if not any(low <= z - half + EPS and high >= z + half - EPS for low, high in intervals):
            return False
    return True


def cylinder_clear(position, radius, height, blocks):
    x, floor, z = position
    for block in blocks:
        low, high = block["min"], block["max"]
        if high[1] <= floor + EPS or low[1] >= floor + height - EPS:
            continue
        dx = max(low[0] - x, 0, x - high[0])
        dz = max(low[2] - z, 0, z - high[2])
        if dx * dx + dz * dz < radius * radius - EPS:
            return False
    return True


def cell_rectangles(nav):
    result = []
    for polygon in nav["walkablePolygons"]:
        p = np.asarray(polygon["vertices"], dtype=float)
        low, high = p[:, [0, 2]].min(0), p[:, [0, 2]].max(0)
        corners = {(low[0], low[1]), (low[0], high[1]), (high[0], low[1]), (high[0], high[1])}
        require(len(p) == 4 and {tuple(v) for v in p[:, [0, 2]]} == corners,
                "CONNECTIVITY_CELL_PROFILE", polygon["id"], "This independent connectivity audit requires axis-aligned rectangle cells")
        result.append((polygon["id"], low[0], high[0], low[1], high[1], p[0, 1]))
    return result


def cell_connectivity(nav):
    cells = cell_rectangles(nav)
    graph = {c[0]: set() for c in cells}
    # Sweep x intervals to avoid comparing every pair in fine global grids.
    active = []
    for a in sorted(cells, key=lambda c: (c[1], c[3], c[0])):
        active = [b for b in active if b[2] >= a[1] - EPS]
        for b in active:
            if abs(a[5] - b[5]) > EPS:
                continue
            ox = min(a[2], b[2]) - max(a[1], b[1])
            oz = min(a[4], b[4]) - max(a[3], b[3])
            if (ox > EPS and oz >= -EPS) or (oz > EPS and ox >= -EPS):
                graph[a[0]].add(b[0]); graph[b[0]].add(a[0])
        active.append(a)
    def containing(position):
        x, y, z = position
        return {c[0] for c in cells if abs(c[5] - y) <= EPS and c[1] - EPS <= x <= c[2] + EPS and c[3] - EPS <= z <= c[4] + EPS}
    reached = containing(nav["entry"])
    todo = deque(reached)
    while todo:
        for other in graph[todo.popleft()] - reached:
            reached.add(other); todo.append(other)
    unreachable = set(graph) - reached
    landing_reachability = {t["id"]: bool(containing(t["position"]) & reached) for t in nav["teleportZones"]}
    landing_reachability["exit"] = bool(containing(nav["exit"]) & reached)
    components, remaining = [], set(graph)
    while remaining:
        start = min(remaining); component = {start}; todo = deque([start]); remaining.remove(start)
        while todo:
            for other in graph[todo.popleft()] & remaining:
                remaining.remove(other); component.add(other); todo.append(other)
        components.append(sorted(component))
    return {"reachableCellIds": sorted(reached), "unreachableCellIds": sorted(unreachable),
            "components": components, "landingReachability": landing_reachability,
            "allCellsConnectedToEntry": not unreachable}


def collision_floors(collision_path, floor_y):
    validator = Validator(collision_path, kind="collision")
    report = validator.validate()
    require(report["passed"], "COLLISION_INVALID", str(collision_path), "Actual collision GLB failed structural validation")
    g = validator.g
    active = set()
    pending = list(g["scenes"][g.get("scene", 0)]["nodes"])
    while pending:
        index = pending.pop()
        if index in active:
            continue
        active.add(index)
        pending.extend(g["nodes"][index].get("children", []))
    require(all(np.allclose(validator.local_transform(g["nodes"][index], "$"), np.eye(4), atol=EPS)
                for index in active), "COLLISION_TRANSFORM", "$", "Floor extraction requires baked identity transforms")
    triangles = []
    for index in sorted(active):
        node = g["nodes"][index]
        if "mesh" not in node:
            continue
        for primitive in g["meshes"][node["mesh"]]["primitives"]:
            require(primitive.get("mode", 4) == 4 and "indices" in primitive, "COLLISION_TRIANGLES", "$", "Expected indexed collision triangles")
            positions = validator.accessor(primitive["attributes"]["POSITION"], "$")[1]
            indices = validator.accessor(primitive["indices"], "$")[0].reshape(-1, 3)
            for tri in positions[indices]:
                normal = np.cross(tri[1] - tri[0], tri[2] - tri[0])
                if normal[1] > EPS and np.max(np.abs(tri[:, 1] - floor_y)) <= EPS:
                    triangles.append({tuple(float(v) for v in p.round(6)) for p in tri})
    zones, paired = [], set()
    for i, a in enumerate(triangles):
        if i in paired:
            continue
        for j, b in enumerate(triangles[i + 1:], i + 1):
            if j in paired or len(a & b) != 2 or len(a | b) != 4:
                continue
            points = np.asarray(list(a | b)); low, high = points.min(0), points.max(0)
            corners = {(low[0], floor_y, low[2]), (low[0], floor_y, high[2]), (high[0], floor_y, low[2]), (high[0], floor_y, high[2])}
            if a | b == corners:
                zones.append({"id": f"collision-floor-{len(zones):03d}", "min": low.tolist(), "max": high.tolist()})
                paired.update((i, j)); break
    require(triangles and len(paired) == len(triangles), "COLLISION_FLOOR_PROFILE", "$", "Floor triangles must form complete axis-aligned rectangles")
    return zones, report["sha256"]


def audit_navigation(nav, actual_floor_zones):
    validate_navigation(nav)
    floors = floor_rectangles(actual_floor_zones)
    connectivity = cell_connectivity(nav)
    failures = []
    landings = []
    agent = nav["agent"]
    targets = [("entry", nav["entry"], agent["radius"]), ("exit", nav["exit"], agent["radius"])]
    targets += [(t["id"], t["position"], t["radius"]) for t in nav["teleportZones"]]
    for identifier, position, radius in targets:
        supported = disk_supported(position, radius, floors)
        clear = cylinder_clear(position, radius, agent["height"], nav["blockedVolumes"])
        reachable = identifier == "entry" or connectivity["landingReachability"].get(identifier, False)
        if not supported: failures.append({"code": "LANDING_DISK_UNSUPPORTED", "id": identifier})
        if not clear: failures.append({"code": "LANDING_CYLINDER_BLOCKED", "id": identifier})
        if not reachable: failures.append({"code": "LANDING_UNREACHABLE", "id": identifier})
        landings.append({"id": identifier, "position": position, "radius": radius,
                         "fullDiskSupported": supported, "declaredVolumeCylinderClear": clear,
                         "reachableFromEntry": reachable})
    return {"passed": not failures, "failures": failures, "landings": landings,
            "connectivity": connectivity, "walkAcceptanceAllowed": False,
            "walkAcceptanceBlockers": ["Runtime movement/controller and full-scene headroom unverified"] +
              (["Disconnected walkable sectors require governed navigation or teleport admission"] if not connectivity["allCellsConnectedToEntry"] else []),
            "evidenceBoundary": {"diskSupport": "Exact rectangular-union containment",
              "collision": "Landing cylinders against declared AABB volumes; complete scene/controller not proven",
              "teleportPolicy": "Center-only landing; radius includes agent footprint",
              "runtimeIntegrated": False, "visualAccepted": False, "physicalDeviceTested": False}}


def audit_package(manifest_path, require_floor_declaration=True):
    manifest = load_json(manifest_path)
    package_report = validate_package(manifest_path)
    require(package_report["passed"], "PACKAGE_INVALID", str(manifest_path), "Package dependency or planar navigation audit failed")
    records = {r["role"]: r for r in manifest["files"]}
    nav = load_json(manifest_path.parent / records["navigation"]["path"])
    floors, collision_hash = collision_floors(manifest_path.parent / records["collision"]["path"], nav["entry"][1])
    declared = nav.get("floorSupportZones")
    if require_floor_declaration:
        require(declared is not None, "FLOOR_DECLARATION_MISSING", "$", "Successor must declare exact floor support zones")
    if declared is not None:
        a, b = sorted(floor_rectangles(declared)), sorted(floor_rectangles(floors))
        require(len(a) == len(b) and np.allclose(a, b, atol=EPS, rtol=0), "FLOOR_COLLISION_DRIFT", "$", "Declared floor rectangles disagree with actual collision GLB triangles")
    result = audit_navigation(nav, floors)
    return {"schemaVersion": "urai-generic-navigation-safety-v1", "observedAt": datetime.now(timezone.utc).isoformat(),
            "id": manifest["id"], "version": manifest["version"],
            "manifestSha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
            "navigationSha256": records["navigation"]["sha256"], "collisionSha256": collision_hash,
            "auditSourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "floorGeometryReadFromActualGlb": True, "floorDeclarationPresent": declared is not None,
            "floorRectangles": floors, **result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--legacy", action="store_true", help="Derive actual floors while auditing a predecessor lacking declarations")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if args.report.exists(): parser.error("Receipt exists; choose a new immutable path")
    try:
        result = audit_package(args.manifest, not args.legacy)
    except (InvalidAsset, OSError, ValueError, KeyError) as e:
        result = {"passed": False, "error": getattr(e, "code", type(e).__name__), "detail": str(e)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"passed": result["passed"], "id": result.get("id"), "failures": result.get("failures", [])}))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
