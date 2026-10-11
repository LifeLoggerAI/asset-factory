#!/usr/bin/env python3
"""Create write-once 1.0.3 navigation successors from verified 1.0.2 packages.

Geometry, materials and cameras are copied byte-for-byte. Only navigation and
additive source/evidence bindings change. Existing source and receipts survive.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "qa"))
from navigation_safety import audit_navigation, audit_package, cylinder_clear, disk_supported, floor_rectangles
from validate_package import load_json, validate_package

spec = importlib.util.spec_from_file_location("preserved_world_builder", ROOT / "build/build.py")
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_navigation(scene, width, depth, kind):
    nav = original.navigation(scene, width, depth, kind)
    nav["floorSupportZones"] = copy.deepcopy(scene.zones)
    nav["teleportPolicy"] = {"centerOnly": True, "radiusIncludesAgentFootprint": True,
                             "fullSceneHeadroom": "NOT_VERIFIED", "controllerAcceptance": False}
    floors = floor_rectangles(scene.zones)
    connectivity = audit_navigation(nav, scene.zones)["connectivity"]
    reached = set(connectivity["reachableCellIds"])
    candidates = []
    for polygon in nav["walkablePolygons"]:
        if polygon["id"] not in reached:
            continue
        vertices = polygon["vertices"]
        p = [round(sum(v[k] for v in vertices) / len(vertices), 4) for k in range(3)]
        if disk_supported(p, .65, floors) and cylinder_clear(p, .65, nav["agent"]["height"], nav["blockedVolumes"]):
            clearance = min((math.hypot(max(b["min"][0] - p[0], 0, p[0] - b["max"][0]),
                                       max(b["min"][2] - p[2], 0, p[2] - b["max"][2]))
                             for b in nav["blockedVolumes"]), default=10)
            candidates.append((clearance, p))
    # Deterministic ties; keep the original preference for open, reachable areas.
    candidates.sort(key=lambda item: (-item[0], item[1]))
    nav["teleportZones"] = []
    for _, p in candidates:
        if any(math.hypot(p[0] - t["position"][0], p[2] - t["position"][2]) < 1.5 for t in nav["teleportZones"]):
            continue
        nav["teleportZones"].append({"id": f"safe-teleport-{len(nav['teleportZones'])}", "position": p, "radius": .65})
        if len(nav["teleportZones"]) == 3:
            break
    if not nav["teleportZones"]:
        raise ValueError("No fully supported reachable landing disk: " + scene.id)
    checked = audit_navigation(nav, scene.zones)
    if not checked["passed"]:
        raise ValueError("Successor safety failure: " + str(checked["failures"]))
    nav["reachableCellsFromEntry"] = len(checked["connectivity"]["reachableCellIds"])
    nav["disconnectedWalkableCellIds"] = checked["connectivity"]["unreachableCellIds"]
    nav["walkAcceptanceAllowed"] = False
    nav["walkAcceptanceBlockers"] = checked["walkAcceptanceBlockers"]
    nav["knownLimitations"] += ["Teleport radius includes the agent footprint and authorizes center-only landing.",
                                "Exact floor-disk support and declared-volume checks do not prove the complete scene or movement controller."]
    return nav


def build_successor(row, source_version="1.0.2", version="1.0.3"):
    identifier, title, width, depth, height, kind = row
    source = ROOT / "packages" / identifier / source_version
    target = source.parent / version
    if target.exists():
        raise FileExistsError("Successor exists; retained history cannot be overwritten: " + str(target))
    manifest = load_json(source / "manifest.json")
    checked = validate_package(source / "manifest.json")
    if not checked["passed"]:
        raise ValueError("Invalid predecessor dependencies: " + identifier)
    scene = original.create_family(*row, "desktop")
    # Bind source-derived floor/obstacle data to real predecessor collision bytes.
    expected_collision = original.glb_bytes(original.collision_scene(scene), True)[0]
    if hashlib.sha256(expected_collision).hexdigest() != digest(source / "collision.glb"):
        raise ValueError("Preserved builder collision differs from actual source bytes: " + identifier)
    expected_nav = original.canonical(original.navigation(scene, width, depth, kind))
    if expected_nav != (source / "navigation.json").read_bytes():
        raise ValueError("Preserved builder navigation differs from actual source bytes: " + identifier)
    nav = safe_navigation(scene, width, depth, kind)
    target.mkdir(parents=True)
    for record in manifest["files"]:
        destination = target / record["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if record["role"] == "navigation":
            original.write_json(destination, nav)
        else:
            shutil.copyfile(source / record["path"], destination)
    manifest["version"] = version
    manifest["status"] = "NEEDS_REWORK"
    manifest["successorSource"] = {
        "predecessorVersion": source_version, "predecessorManifestSha256": digest(source / "manifest.json"),
        "preservedBuilderSha256": digest(ROOT / "build/build.py"),
        "navigationSuccessorSha256": digest(Path(__file__)),
        "independentNavigationAuditSha256": digest(ROOT / "qa/navigation_safety.py"),
        "scope": "Navigation floor-disk repair only; unchanged geometry/material/camera/lighting bytes",
        "geometryChanged": False, "artAcceptanceTransferred": False,
    }
    for record in manifest["files"]:
        record["sha256"] = digest(target / record["path"])
        record["bytes"] = (target / record["path"]).stat().st_size
    original.write_json(target / "manifest.json", manifest)
    audit = audit_package(target / "manifest.json")
    if not audit["passed"]:
        raise ValueError("Actual successor geometry/navigation safety audit failed: " + identifier)
    original.write_json(target / "navigation-safety-receipt.json", audit)
    original.write_json(target / "build-receipt.json", {
        "schemaVersion": "urai-generic-navigation-successor-receipt-v1", "builtAt": datetime.now(timezone.utc).isoformat(),
        "id": identifier, "version": version, "successorSource": manifest["successorSource"],
        "manifestSha256": digest(target / "manifest.json"), "navigationSafetySha256": digest(target / "navigation-safety-receipt.json"),
        "files": manifest["files"], "providerCalls": 0, "paidCreditsSpent": 0,
        "visualAccepted": False, "runtimeIntegrated": False, "physicalDeviceTested": False,
    })
    return {"id": identifier, "version": version, "manifestSha256": digest(target / "manifest.json"),
            "buildReceiptSha256": digest(target / "build-receipt.json"), "navigationSafetySha256": digest(target / "navigation-safety-receipt.json"),
            "staticLandingAuditPassed": True, "disconnectedWalkableCells": len(nav["disconnectedWalkableCellIds"]),
            "walkAcceptanceAllowed": False, "visualAccepted": False, "runtimeIntegrated": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Exact family id")
    args = parser.parse_args()
    index = ROOT / "receipts/navigation-successor-1.0.3-index.json"
    if index.exists():
        parser.error("Successor index exists; choose a new versioned implementation")
    rows = [r for r in original.FAMILIES + original.BATCH2 if not args.only or r[0] == args.only]
    if not rows: parser.error("Unknown family")
    results = []
    for row in rows:
        result = build_successor(row); results.append(result)
        print(json.dumps(result), flush=True)
    original.write_json(index, {"schemaVersion": "urai-generic-navigation-successor-index-v1", "worlds": results,
                               "version": "1.0.3", "geometryChanged": False, "providerCalls": 0, "paidCreditsSpent": 0,
                               "visualAccepted": False, "runtimeIntegrated": False, "physicalDeviceTested": False})


if __name__ == "__main__":
    main()
