#!/usr/bin/env python3
"""Bind complete cuboid triangles and retain every conservative body-clear cell.

Only the factory's baked cuboid collision profile is accepted. This static audit
never grants runtime/controller, full-scene headroom, traffic or art acceptance.
"""
from datetime import datetime, timezone
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import numpy as np
from navigation_safety import audit_package, disk_supported, floor_rectangles
from validate import InvalidAsset, Validator, require
from validate_package import load_json
TOL = 1e-5

def exported_boxes(path):
    validator = Validator(path, kind="collision"); checked = validator.validate()
    require(checked["passed"], "EXPORTED_COLLISION_INVALID", str(path), "Invalid collision GLB")
    g = validator.g; pending = list(g["scenes"][g.get("scene", 0)]["nodes"]); active = set(); boxes = []
    while pending:
        index = pending.pop()
        if index in active: continue
        active.add(index); pending.extend(g["nodes"][index].get("children", []))
    for index in sorted(active):
        node = g["nodes"][index]
        require(np.allclose(validator.local_transform(node, "$"), np.eye(4), atol=TOL, rtol=0), "EXPORTED_BOX_TRANSFORM", "$", "Only baked identity transforms are supported")
        if "mesh" not in node: continue
        for primitive in g["meshes"][node["mesh"]]["primitives"]:
            require(primitive.get("mode", 4) == 4 and "indices" in primitive, "EXPORTED_BOX_PRIMITIVE", "$", "Expected indexed triangles")
            points = validator.accessor(primitive["attributes"]["POSITION"], "$")[1]
            indices = validator.accessor(primitive["indices"], "$")[0]
            require(len(indices) % 36 == 0, "EXPORTED_BOX_TRIANGLE_COUNT", "$", "Expected twelve consecutive triangles per cuboid")
            for offset in range(0, len(indices), 36):
                triangles = points[indices[offset:offset + 36].reshape(-1, 3)]
                low, high = triangles.min(axis=(0, 1)), triangles.max(axis=(0, 1))
                require(bool(np.all(high - low > TOL)), "EXPORTED_BOX_VOLUME", "$", "Box must have positive volume")
                corners = set(); faces = {}
                for triangle in triangles:
                    encoded = []
                    for point in triangle:
                        corner = []
                        for axis in range(3):
                            if abs(point[axis] - low[axis]) <= TOL: corner.append(0)
                            elif abs(point[axis] - high[axis]) <= TOL: corner.append(1)
                            else: raise InvalidAsset("EXPORTED_BOX_CORNERS", "$", "Non-cuboid vertex")
                        encoded.append(tuple(corner)); corners.add(tuple(corner))
                    require(len(set(encoded)) == 3, "EXPORTED_BOX_DEGENERATE", "$", "Degenerate triangle")
                    sides = [(axis, encoded[0][axis]) for axis in range(3) if len({p[axis] for p in encoded}) == 1]
                    require(len(sides) == 1, "EXPORTED_BOX_FACE", "$", "Triangle crosses cuboid interior")
                    faces.setdefault(sides[0], []).append(set(encoded))
                require(len(corners) == 8 and len(faces) == 6, "EXPORTED_BOX_INCOMPLETE", "$", "Missing corners or faces")
                for (axis, side), pair in faces.items():
                    expected = {tuple(side if d == axis else v[d] for d in range(3)) for v in ((x, y, z) for x in (0, 1) for y in (0, 1) for z in (0, 1))}
                    require(len(pair) == 2 and pair[0] | pair[1] == expected and len(pair[0] & pair[1]) == 2, "EXPORTED_BOX_FACE_COVERAGE", "$", "Triangles must cover the complete face")
                    require(sum(a != b for a, b in zip(*list(pair[0] & pair[1]))) == 2, "EXPORTED_BOX_FACE_DIAGONAL", "$", "Triangles must share a diagonal")
                boxes.append({"min": low.tolist(), "max": high.tolist()})
    require(bool(boxes), "EXPORTED_BOX_EMPTY", "$", "No active collision boxes")
    return boxes, checked["sha256"]

def expected_boxes(nav):
    boxes = [{"min": b["min"], "max": b["max"]} for b in nav["blockedVolumes"]]
    for z in nav["floorSupportZones"]: boxes.append({"min": [z["min"][0], z["min"][1] - .06, z["min"][2]], "max": z["max"]})
    return boxes

def bind_boxes(actual, nav):
    key = lambda b: (*b["min"], *b["max"])
    a = np.asarray([key(b) for b in sorted(actual, key=key)]); b = np.asarray([key(b) for b in sorted(expected_boxes(nav), key=key)])
    require(a.shape == b.shape and np.allclose(a, b, atol=TOL, rtol=0), "EXPORTED_BLOCK_DRIFT", "$", "Declared obstacle/floor boxes differ from complete exported triangles")

def complete_grid(nav, floors, boxes):
    radius, height, step = nav["agent"]["radius"], nav["agent"]["height"], nav.get("cellSize")
    require(step == .20 and radius == .45 and height == 1.7, "CONNECTED_GRID_PROFILE", "$", "Expected fixed 1.0.4 body-clear profile")
    require(all(abs(r[4]) <= TOL for r in floors), "CONNECTED_GRID_FLOOR", "$", "Only floor-zero worlds supported")
    # Recover the documented six-decimal authoring bounds from measured float32
    # boxes after their complete-triangle binding. Loosening edges by epsilon
    # would add tangent cells intentionally excluded by conservative manufacture.
    boxes = [{key: np.asarray(b[key]).round(6).tolist() for key in ("min", "max")} for b in boxes]
    margin = radius + math.sqrt(2) * step / 2; eligible = set()
    for ix in range(math.ceil(min(r[0] for r in floors) / step), math.floor(max(r[1] for r in floors) / step) + 1):
        for iz in range(math.ceil(min(r[2] for r in floors) / step), math.floor(max(r[3] for r in floors) / step) + 1):
            p = (round(ix * step, 4), 0, round(iz * step, 4))
            if not disk_supported(p, margin, floors): continue
            if any(b["max"][1] > 0 and b["min"][1] < height and b["min"][0] - radius - step/2 < p[0] < b["max"][0] + radius + step/2 and b["min"][2] - radius - step/2 < p[2] < b["max"][2] + radius + step/2 for b in boxes): continue
            eligible.add(p)
    actual = []
    for polygon in nav["walkablePolygons"]:
        points = np.asarray(polygon["vertices"], dtype=float)
        require(np.allclose(np.ptp(points, axis=0), [step, 0, step], atol=TOL, rtol=0), "CONNECTED_GRID_CELL_SIZE", polygon["id"], "Wrong cell size")
        center = tuple(float(v) for v in points.mean(axis=0).round(4))
        require(all(abs(v / step - round(v / step)) < TOL for v in (center[0], center[2])), "CONNECTED_GRID_ALIGNMENT", polygon["id"], "Wrong global alignment")
        actual.append(center)
    require(len(set(actual)) == len(actual), "CONNECTED_GRID_DUPLICATE", "$", "Duplicate cells hide omitted sectors")
    missing, unsafe = eligible - set(actual), set(actual) - eligible
    require(not missing and not unsafe, "CONNECTED_GRID_INCOMPLETE", "$", f"{len(missing)} missing cells; {len(unsafe)} unsafe cells")
    return {"eligibleCells": len(eligible), "retainedCells": len(actual), "missingCells": 0, "unsafeCells": 0,
        "gridCentersSha256": hashlib.sha256(json.dumps(sorted(eligible), separators=(",", ":")).encode()).hexdigest(),
        "coordinatePrecisionMeters": .000001, "exportedBoundsBindingToleranceMeters": TOL, "runtimeCollisionToleranceVerified": False}

def audit_connected(manifest_path):
    safety = audit_package(manifest_path)
    require(safety["passed"] and safety["connectivity"]["allCellsConnectedToEntry"], "CONNECTED_GRID_DISCONNECTED", "$", "Landing safety and full connectivity must pass")
    manifest = load_json(manifest_path); records = {r["role"]: r for r in manifest["files"]}; nav = load_json(manifest_path.parent / records["navigation"]["path"])
    boxes, collision_hash = exported_boxes(manifest_path.parent / records["collision"]["path"]); bind_boxes(boxes, nav)
    grid = complete_grid(nav, floor_rectangles(safety["floorRectangles"]), boxes)
    return {"schemaVersion": "urai-connected-exported-box-grid-audit-v1", "observedAt": datetime.now(timezone.utc).isoformat(), "id": manifest["id"], "version": manifest["version"], "passed": True,
        "manifestSha256": safety["manifestSha256"], "navigationSha256": records["navigation"]["sha256"], "collisionSha256": collision_hash,
        "auditSourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "exportedBoxes": len(boxes), "declaredObstacleBoxes": len(nav["blockedVolumes"]),
        "allObstacleAndFloorBoxesBoundToCompleteExportedTriangles": True, **grid, "disconnectedCells": 0, "walkAcceptanceAllowed": False,
        "runtimeIntegrated": False, "fullSceneHeadroomVerified": False, "visualAccepted": False, "physicalDeviceTested": False}

def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument("manifest", type=Path); parser.add_argument("--report", type=Path, required=True); args = parser.parse_args()
    if args.report.exists(): parser.error("Receipt exists; choose a new immutable report path")
    try: report = audit_connected(args.manifest)
    except (InvalidAsset, OSError, ValueError, KeyError) as error: report = {"passed": False, "error": getattr(error, "code", type(error).__name__), "detail": str(error)}
    args.report.parent.mkdir(parents=True, exist_ok=True); args.report.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps(report)); return 0 if report["passed"] else 1

if __name__ == "__main__": sys.exit(main())
