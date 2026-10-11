#!/usr/bin/env python3
"""Check world-package dependency hashes and horizontal navigation metadata.

Checks are independent of the scene producer. Planar collision/clearance checks
do not prove three-dimensional runtime navigation or device acceptance.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

import numpy as np

from validate import InvalidAsset, integer, object_value, require, unique_json_object, reject_json_constant, vector


def load_json(path: Path) -> dict:
    return object_value(json.loads(path.read_text(), object_pairs_hook=unique_json_object,
                                  parse_constant=reject_json_constant), str(path))


def orient(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    u, v = b - a, c - a
    return float(u[0] * v[1] - u[1] * v[0])


def point_in_polygon(point: np.ndarray, polygon: np.ndarray, tolerance: float = 1e-6) -> bool:
    # Convex polygons; boundary points are valid shared-cell landing positions.
    turns = [orient(polygon[i], polygon[(i + 1) % len(polygon)], point) for i in range(len(polygon))]
    return min(turns) >= -tolerance or max(turns) <= tolerance


def interiors_overlap(polygon: np.ndarray, lower: np.ndarray, upper: np.ndarray) -> bool:
    rectangle = np.array([[lower[0], lower[1]], [upper[0], lower[1]], [upper[0], upper[1]], [lower[0], upper[1]]])
    axes = [np.array([1., 0.]), np.array([0., 1.])]
    for i in range(len(polygon)):
        edge = polygon[(i + 1) % len(polygon)] - polygon[i]
        length = float(np.linalg.norm(edge))
        if length:
            axes.append(np.array([-edge[1], edge[0]]) / length)
    for axis in axes:
        a, b = polygon @ axis, rectangle @ axis
        # Boundary touching has zero intersection area and is deliberately allowed.
        if a.max() <= b.min() + 1e-6 or b.max() <= a.min() + 1e-6:
            return False
    return True


def validate_navigation(nav: dict) -> dict:
    require(nav.get("schemaVersion") == "urai-generic-navigation-v1", "NAV_SCHEMA", "$", "Unexpected navigation schema")
    require(nav.get("units") == "meters", "NAV_UNITS", "$.units", "Navigation coordinates must use meters")
    agent = object_value(nav.get("agent"), "$.agent")
    radius, height = agent.get("radius"), agent.get("height")
    require(type(radius) in (int, float) and np.isfinite(radius) and radius > 0, "AGENT_RADIUS", "$.agent", "Agent radius must be positive and finite")
    require(type(height) in (int, float) and np.isfinite(height) and height >= 1, "AGENT_HEIGHT", "$.agent", "First-person agent height must be at least one meter")
    clearance = agent.get("minClearance", radius * 2)
    require(type(clearance) in (int, float) and np.isfinite(clearance) and clearance >= radius * 2, "AGENT_CLEARANCE", "$.agent", "Minimum clearance cannot be smaller than agent diameter")
    polygons, blocks, zones = [], [], []
    identifiers = set()
    for label in ("walkablePolygons", "blockedVolumes", "teleportZones"):
        items = nav.get(label)
        require(isinstance(items, list), "NAV_ARRAY", f"$.{label}", "Expected navigation array")
        for index, item in enumerate(items):
            path = f"$.{label}[{index}]"
            item = object_value(item, path)
            identifier = item.get("id")
            require(isinstance(identifier, str) and identifier and identifier not in identifiers,
                    "NAV_IDENTIFIER", path, "Navigation identifiers must be present and unique")
            identifiers.add(identifier)
            if label == "walkablePolygons":
                vertices = item.get("vertices")
                require(isinstance(vertices, list) and len(vertices) >= 3, "NAV_POLYGON", path, "Polygon needs at least three vertices")
                points = np.array([vector(v, 3, path + ".vertices") for v in vertices])
                require(float(np.ptp(points[:, 1])) <= 1e-6, "NAV_NOT_PLANAR", path, "This checker only supports horizontal navigation polygons")
                xz = points[:, [0, 2]]
                turns = [orient(xz[i - 1], xz[i], xz[(i + 1) % len(xz)]) for i in range(len(xz))]
                require((min(turns) >= -1e-9 or max(turns) <= 1e-9) and max(map(abs, turns)) > 1e-9,
                        "NAV_CONVEXITY", path, "Navigation cells must be convex with nonzero area")
                require(len({tuple(v) for v in xz}) == len(xz), "NAV_DUPLICATE_VERTEX", path, "Polygon vertices repeat")
                for i in range(len(xz)):
                    for j in range(i + 2, len(xz)):
                        if i == 0 and j == len(xz) - 1:
                            continue
                        a, b, c, d = xz[i], xz[(i + 1) % len(xz)], xz[j], xz[(j + 1) % len(xz)]
                        crosses = orient(a, b, c) * orient(a, b, d) < -1e-12 and orient(c, d, a) * orient(c, d, b) < -1e-12
                        require(not crosses, "NAV_SELF_INTERSECTION", path, "Polygon edges cross")
                area = abs(sum(xz[i, 0] * xz[(i + 1) % len(xz), 1] - xz[(i + 1) % len(xz), 0] * xz[i, 1] for i in range(len(xz)))) / 2
                polygons.append({"id": identifier, "xz": xz, "floorY": float(points[0, 1]), "area": area})
            elif label == "blockedVolumes":
                lower, upper = vector(item.get("min"), 3, path), vector(item.get("max"), 3, path)
                require(bool(np.all(upper > lower)), "NAV_BLOCK_BOUNDS", path, "Blocked volume must have positive dimensions")
                blocks.append({"id": identifier, "min": lower, "max": upper})
            else:
                position = vector(item.get("position"), 3, path)
                zone_radius = item.get("radius")
                require(type(zone_radius) in (int, float) and np.isfinite(zone_radius) and zone_radius >= radius, "TELEPORT_RADIUS", path, "Teleport radius must accommodate agent radius")
                zones.append({"id": identifier, "position": position, "radius": zone_radius})
    require(bool(polygons), "NAV_EMPTY", "$.walkablePolygons", "No walkable polygons")
    require(bool(zones), "TELEPORT_EMPTY", "$.teleportZones", "No teleport landing zones")
    for polygon in polygons:
        for block in blocks:
            if block["max"][1] <= polygon["floorY"] + 1e-6 or block["min"][1] >= polygon["floorY"] + height - 1e-6:
                continue
            lower = block["min"][[0, 2]] - radius
            upper = block["max"][[0, 2]] + radius
            require(not interiors_overlap(polygon["xz"], lower, upper), "NAV_OBSTACLE_INTERSECTION", f"$.walkablePolygons.{polygon['id']}", f"Cell overlaps agent-expanded obstacle {block['id']}")
    landing_metrics = []
    positions = [("entry", vector(nav.get("entry"), 3, "$.entry")), ("exit", vector(nav.get("exit"), 3, "$.exit"))]
    positions += [(z["id"], z["position"]) for z in zones]
    for name, position in positions:
        cells = [p for p in polygons if abs(p["floorY"] - position[1]) <= .05 and point_in_polygon(position[[0, 2]], p["xz"])]
        require(bool(cells), "NAV_LANDING_OUTSIDE", f"$.{name}", "Landing is outside walkable cells or differs from floor height by >5 cm")
        landing_metrics.append({"id": name, "walkableCellIds": [c["id"] for c in cells]})
    # This check audits what metadata actually proves. Disk/3D and movement proofs remain separate.
    require(nav.get("navmeshStatus") == "GENERATED_PLANAR_METADATA_NOT_RUNTIME_BAKED", "NAV_STATUS", "$.navmeshStatus", "Generic nav metadata must not claim runtime-baked acceptance")
    require(type(nav.get("clearanceChecked")) is bool, "NAV_CLEARANCE_STATE", "$.clearanceChecked", "clearanceChecked must be an explicit boolean")
    return {"passed": True, "polygons": len(polygons), "blockedVolumes": len(blocks), "teleportZones": len(zones),
            "walkableAreaSquareMetersSum": sum(p["area"] for p in polygons),
            "landings": landing_metrics, "agentExpandedObstacleChecks": "MEASURED_PLANAR",
            "producerClearanceClaim": nav["clearanceChecked"], "threeDimensionalClearance": "NOT_VERIFIED",
            "teleportFullDiskClearance": "NOT_VERIFIED", "pathConnectivity": "NOT_VERIFIED",
            "navmeshBaking": "NOT_PERFORMED", "runtimeMovement": "NOT_VERIFIED"}


def validate_package(manifest_path: Path) -> dict:
    findings, inspected, navigation_reports = [], [], []
    manifest, data = {}, b""
    def problem(error: InvalidAsset) -> None:
        findings.append({"severity": "ERROR", "code": error.code, "path": error.path, "message": error.message})
    try:
        data = manifest_path.read_bytes()
        manifest = load_json(manifest_path)
        require(manifest.get("schemaVersion") == "urai-generic-world-package-v1", "PACKAGE_SCHEMA", "$", "Unexpected package schema")
        require(isinstance(manifest.get("id"), str) and bool(re.fullmatch(r"gw-[a-z0-9-]+", manifest["id"])), "PACKAGE_ID", "$.id", "Expected deterministic gw- identifier")
        require(isinstance(manifest.get("version"), str) and bool(re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])), "PACKAGE_VERSION", "$.version", "Expected semantic version")
        require(manifest.get("truthClassification") == "GENERIC", "TRUTH_CLASSIFICATION", "$.truthClassification", "This factory package must retain GENERIC truth classification")
        require(manifest.get("units") == "meters", "PACKAGE_UNITS", "$.units", "Package units must be meters")
        require(manifest.get("axes") == {"handedness": "right", "up": "+Y", "front": "+Z", "cameraForward": "-Z"}, "PACKAGE_AXES", "$.axes", "Expected explicit glTF coordinate conventions")
        require(manifest.get("runtimeIntegrated") is False and manifest.get("visualAccepted") is False, "ACCEPTANCE_BOUNDARY", "$", "Generated packages must not claim runtime or visual acceptance")
        files = manifest.get("files")
        require(isinstance(files, list) and files, "PACKAGE_FILES", "$.files", "Package requires nonempty file records")
        source = object_value(manifest.get("sourceSpec"), "$.sourceSpec")
        source_valid = all(isinstance(source.get(k), str) and source[k] for k in ("repository", "path", "sha256")) and bool(re.fullmatch(r"[0-9a-f]{64}", source["sha256"]))
        if not source_valid:
            problem(InvalidAsset("SOURCE_SPEC", "$.sourceSpec", "Source spec needs repository, path, and exact SHA-256"))
        base = manifest_path.parent.resolve()
        declared, hashes = set(), Counter()
        for index, record in enumerate(files):
            try:
                path = f"$.files[{index}]"
                record = object_value(record, path)
                relative = record.get("path")
                require(isinstance(relative, str) and relative and not Path(relative).is_absolute(), "DEPENDENCY_PATH", path, "Dependency paths must be relative")
                resolved = (base / relative).resolve()
                require(resolved.is_relative_to(base), "DEPENDENCY_ESCAPE", path, "Dependency escapes package root")
                normalized = resolved.relative_to(base).as_posix()
                require(normalized not in declared, "DEPENDENCY_DUPLICATE", path, "Duplicate normalized dependency path")
                declared.add(normalized)
                expected_hash = record.get("sha256")
                require(isinstance(expected_hash, str) and bool(re.fullmatch(r"[0-9a-f]{64}", expected_hash)), "DEPENDENCY_HASH", path, "Expected SHA-256 in lowercase hex")
                require(resolved.is_file(), "DEPENDENCY_MISSING", path, f"Missing {relative}")
                artifact = resolved.read_bytes()
                digest = hashlib.sha256(artifact).hexdigest()
                require(digest == expected_hash, "DEPENDENCY_HASH_MISMATCH", path, f"SHA-256 mismatch for {relative}")
                require(len(artifact) == integer(record.get("bytes"), path + ".bytes", 1), "DEPENDENCY_SIZE_MISMATCH", path, f"Byte count mismatch for {relative}")
                hashes[digest] += 1
                inspected.append({"path": normalized, "sha256": digest, "bytes": len(artifact), "role": record.get("role")})
                if record.get("role") == "navigation":
                    nav = validate_navigation(load_json(resolved))
                    nav["path"] = normalized
                    navigation_reports.append(nav)
            except InvalidAsset as error:
                problem(error)
        profiles = object_value(manifest.get("profiles"), "$.profiles")
        for profile in ("desktop", "mobile", "xr"):
            settings = object_value(profiles.get(profile), f"$.profiles.{profile}")
            require(settings.get("lod") in declared, "PROFILE_DEPENDENCY", f"$.profiles.{profile}", "LOD must reference a declared dependency")
        require(any(r["role"] == "collision" for r in inspected), "COLLISION_MISSING", "$.files", "Package has no verified collision dependency")
        require(bool(navigation_reports), "NAVIGATION_MISSING", "$.files", "Package has no verified navigation dependency")
        for digest, count in hashes.items():
            if count > 1:
                findings.append({"severity": "WARNING", "code": "DUPLICATE_DEPENDENCY_HASH", "path": "$.files", "message": f"{count} files share SHA-256 {digest}; verify intended profile reuse"})
    except InvalidAsset as error:
        problem(error)
    except (OSError, ValueError, TypeError, KeyError, IndexError, OverflowError) as error:
        findings.append({"severity": "ERROR", "code": "UNREADABLE_OR_INVALID_SCHEMA", "path": "$", "message": f"{type(error).__name__}: {error}"})
    passed = not any(f["severity"] == "ERROR" for f in findings)
    return {"schemaVersion": "urai-generic-world-package-qa-v1", "validatedAt": datetime.now(timezone.utc).isoformat(),
            "validatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "manifest": str(manifest_path), "manifestSha256": hashlib.sha256(data).hexdigest() if data else None,
            "id": manifest.get("id"), "version": manifest.get("version"), "passed": passed,
            "verdict": "DEPENDENCIES_AND_PLANAR_NAVIGATION_VALIDATED" if passed else "NEEDS_REWORK",
            "findings": findings, "verifiedFiles": inspected, "navigation": navigation_reports,
            "evidenceBoundary": {"sourceSpecHash": "DECLARED_NOT_REMOTE_AUTHENTICATED", "GLBValidation": "RUN_VALIDATE_PY_SEPARATELY",
                                 "historicalTruth": "GENERIC", "visualAcceptance": "NOT_GRANTED", "runtimeIntegration": "NOT_VERIFIED",
                                 "deviceCertification": "NOT_GRANTED", "independentApproval": "NOT_GRANTED"}}


def validate_kit(manifest_path: Path) -> dict:
    """Per-element kits need hashes/LOD/provenance; composition owns navigation."""
    findings, files, manifest, data = [], [], {}, b""
    try:
        data = manifest_path.read_bytes()
        manifest = load_json(manifest_path)
        require(manifest.get("schemaVersion") == "urai-generic-kit-v1", "KIT_SCHEMA", "$", "Unexpected kit schema")
        require(isinstance(manifest.get("id"), str) and bool(re.fullmatch(r"kit-[a-z0-9-]+", manifest["id"])), "KIT_ID", "$.id", "Expected deterministic kit- identifier")
        require(isinstance(manifest.get("version"), str) and bool(re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])), "KIT_VERSION", "$.version", "Expected semantic version")
        require(manifest.get("truthClassification") == "GENERIC", "TRUTH_CLASSIFICATION", "$.truthClassification", "Kit must retain GENERIC truth")
        require(manifest.get("runtimeIntegrated") is False and manifest.get("visualAccepted") is False, "ACCEPTANCE_BOUNDARY", "$", "Kit cannot claim runtime/visual acceptance")
        provenance = object_value(manifest.get("provenance"), "$.provenance")
        require(all(isinstance(provenance.get(key), str) and provenance[key] for key in ("source", "license")) and isinstance(provenance.get("sourceAssets"), list), "KIT_PROVENANCE", "$.provenance", "Kit requires source, license declaration, and sourceAssets inventory")
        records = manifest.get("files")
        require(isinstance(records, list) and records, "KIT_FILES", "$.files", "Kit requires file records")
        base, declared = manifest_path.parent.resolve(), set()
        for index, record in enumerate(records):
            try:
                record = object_value(record, f"$.files[{index}]")
                relative = record.get("path")
                require(isinstance(relative, str) and relative and not Path(relative).is_absolute(), "DEPENDENCY_PATH", f"$.files[{index}]", "Dependencies must be relative paths")
                file = (base / relative).resolve()
                require(file.is_relative_to(base), "DEPENDENCY_ESCAPE", f"$.files[{index}]", "Dependency escapes kit root")
                require(relative not in declared, "DEPENDENCY_DUPLICATE", f"$.files[{index}]", "Duplicate kit dependency")
                declared.add(relative)
                expected = record.get("sha256")
                require(isinstance(expected, str) and bool(re.fullmatch(r"[0-9a-f]{64}", expected)), "DEPENDENCY_HASH", f"$.files[{index}]", "Expected lowercase SHA-256")
                require(file.is_file(), "DEPENDENCY_MISSING", f"$.files[{index}]", f"Missing {relative}")
                artifact = file.read_bytes()
                digest = hashlib.sha256(artifact).hexdigest()
                require(digest == expected, "DEPENDENCY_HASH_MISMATCH", f"$.files[{index}]", f"Hash mismatch for {relative}")
                require(len(artifact) == integer(record.get("bytes"), f"$.files[{index}].bytes", 1), "DEPENDENCY_SIZE_MISMATCH", f"$.files[{index}]", f"Byte-count mismatch for {relative}")
                files.append({"path": relative, "sha256": digest, "bytes": len(artifact)})
            except InvalidAsset as error:
                findings.append({"severity": "ERROR", "code": error.code, "path": error.path, "message": error.message})
        profiles = object_value(manifest.get("profiles"), "$.profiles")
        for name, filename in (("desktop", "lod0.glb"), ("xr", "lod1.glb"), ("mobile", "lod2.glb")):
            profile = object_value(profiles.get(name), f"$.profiles.{name}")
            require(profile.get("lod", filename) in declared, "PROFILE_DEPENDENCY", f"$.profiles.{name}", "Profile needs declared LOD dependency")
    except InvalidAsset as error:
        findings.append({"severity": "ERROR", "code": error.code, "path": error.path, "message": error.message})
    except (OSError, ValueError, TypeError, KeyError, IndexError, OverflowError) as error:
        findings.append({"severity": "ERROR", "code": "UNREADABLE_OR_INVALID_SCHEMA", "path": "$", "message": f"{type(error).__name__}: {error}"})
    passed = not any(f["severity"] == "ERROR" for f in findings)
    return {"schemaVersion": "urai-generic-kit-qa-v1", "validatedAt": datetime.now(timezone.utc).isoformat(),
            "validatorSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "manifest": str(manifest_path),
            "manifestSha256": hashlib.sha256(data).hexdigest() if data else None, "id": manifest.get("id"), "version": manifest.get("version"),
            "passed": passed, "verdict": "DEPENDENCIES_AND_KIT_METADATA_VALIDATED" if passed else "NEEDS_REWORK",
            "findings": findings, "verifiedFiles": files,
            "evidenceBoundary": {"licensing": "DECLARED_NOT_INDEPENDENTLY_VERIFIED", "GLBValidation": "RUN_VALIDATE_PY_SEPARATELY",
                                 "collisionNavigation": "COMPOSED_SCENE_RESPONSIBILITY", "visualAcceptance": "NOT_GRANTED",
                                 "runtimeIntegration": "NOT_VERIFIED", "deviceCertification": "NOT_GRANTED", "independentApproval": "NOT_GRANTED"}}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    report = validate_package(args.manifest)
    output = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output)
    sys.stdout.write(output)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
