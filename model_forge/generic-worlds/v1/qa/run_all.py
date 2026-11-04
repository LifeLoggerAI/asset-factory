#!/usr/bin/env python3
"""Batch independent QA for current versioned world packages and modular kits.

Default selection is newest semantic version per identifier; --version selects
one version explicitly. Prior rejected snapshots are never overwritten.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

import numpy as np

from validate import Validator
from validate_package import load_json, validate_kit, validate_package

TARGETS = {
    "desktop": {"maxTriangles": 120000, "maxBytes": 25000000, "maxTextureMemoryBytes": 134217728},
    "xr": {"maxTriangles": 65000, "maxBytes": 18000000, "maxTextureMemoryBytes": 67108864},
    "mobile": {"maxTriangles": 35000, "maxBytes": 10000000, "maxTextureMemoryBytes": 33554432},
}


def semver(value):
    return tuple(map(int, value.split("."))) if isinstance(value, str) and re.fullmatch(r"\d+\.\d+\.\d+", value) else (0, 0, 0)


def select_manifests(base: Path, version: str | None):
    grouped = defaultdict(list)
    for path in sorted(base.rglob("*.json")):
        if path.name not in ("manifest.json", "package.json"):
            continue
        try:
            manifest = load_json(path)
            if manifest.get("schemaVersion") not in ("urai-generic-world-package-v1", "urai-generic-kit-v1"):
                continue
        except Exception:
            manifest = {}
        manifest_version = manifest.get("version", path.parent.name)
        grouped[manifest.get("id", str(path.parent.parent))].append((path, manifest, manifest_version))
    selected, excluded = [], []
    for identifier, items in grouped.items():
        newest = max(semver(item[2]) for item in items)
        for path, manifest, manifest_version in items:
            chosen = manifest_version == version if version is not None else semver(manifest_version) == newest
            if chosen:
                selected.append((path, manifest))
            else:
                excluded.append({"id": identifier, "version": manifest_version, "manifest": str(path),
                                 "manifestSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                                 "reason": "VERSION_SELECTION_EXCLUDED_NOT_REOPENED"})
    return sorted(selected, key=lambda x: str(x[0])), excluded


def run_all(base: Path, version: str | None = None) -> dict:
    manifests, excluded = select_manifests(base, version)
    worlds, kits, global_hashes = [], [], defaultdict(list)
    for path, manifest in manifests:
        is_kit = manifest.get("schemaVersion") == "urai-generic-kit-v1"
        metadata_report = validate_kit(path) if is_kit else validate_package(path)
        profiles = []
        for name, default_file in (("desktop", "lod0.glb"), ("xr", "lod1.glb"), ("mobile", "lod2.glb")):
            manifest_profiles = manifest.get("profiles", {})
            settings = manifest_profiles.get(name, {}) if isinstance(manifest_profiles, dict) else {}
            settings = settings if isinstance(settings, dict) else {}
            filename = settings.get("lod", default_file)
            target = settings.get("target", TARGETS[name])
            target = target if isinstance(target, dict) else TARGETS[name]
            if not isinstance(filename, str):
                filename = "__INVALID_PROFILE_PATH__"
            file = path.parent / filename
            if not file.resolve().is_relative_to(path.parent.resolve()):
                file = path.parent / "__INVALID_UNSAFE_PROFILE_PATH__"
            report = Validator(file, max_triangles=target.get("maxTriangles", TARGETS[name]["maxTriangles"]),
                               max_bytes=target.get("maxBytes", TARGETS[name]["maxBytes"]),
                               max_texture_size=settings.get("textureResolution", 4096),
                               max_texture_memory=target.get("maxTextureMemoryBytes", TARGETS[name]["maxTextureMemoryBytes"])).validate()
            source_stats = settings if is_kit else settings.get("measuredStatic", {})
            comparison = {}
            for producer_key, qa_key in (("triangles", "sceneTriangles"), ("vertices", "primitiveVertexCount"), ("materials", "materials")):
                if producer_key in source_stats and qa_key in report["metrics"]:
                    comparison[producer_key] = {"declared": source_stats[producer_key], "measured": report["metrics"][qa_key]}
            if "bytes" in source_stats:
                comparison["bytes"] = {"declared": source_stats["bytes"], "measured": report["bytes"]}
            if "drawCalls" in source_stats and "primitives" in report["metrics"]:
                comparison["drawCalls"] = {"declared": source_stats["drawCalls"], "measured": len(report["metrics"]["primitives"])}
            if "textureCount" in source_stats and "images" in report["metrics"]:
                comparison["textureCount"] = {"declared": source_stats["textureCount"], "measured": len(report["metrics"]["images"])}
            mismatches = [key for key, values in comparison.items() if values["declared"] != values["measured"]]
            bounds = source_stats.get("bounds", {})
            if bounds and "sceneBoundsMinMeters" in report["metrics"]:
                for key, qa_key in (("min", "sceneBoundsMinMeters"), ("max", "sceneBoundsMaxMeters")):
                    if not np.allclose(bounds.get(key, []), report["metrics"][qa_key], rtol=1e-6, atol=1e-6):
                        mismatches.append("bounds." + key)
            if mismatches:
                report["findings"].append({"severity": "ERROR", "code": "PRODUCER_STATS_MISMATCH", "path": f"$.profiles.{name}", "message": f"Independent metrics disagree for {mismatches}"})
                report["passed"], report["verdict"] = False, "NEEDS_REWORK"
                report["errorCount"] += 1
            profiles.append({"profile": name, "producerStatsComparison": comparison, "report": report})
            if report["sha256"]:
                global_hashes[report["sha256"]].append(str(file))
        collision = None if is_kit else Validator(path.parent / "collision.glb", kind="collision", max_triangles=100_000, max_bytes=10_000_000).validate()
        result = {"id": manifest.get("id"), "version": manifest.get("version"), "manifest": str(path),
                  "profiles": profiles, "passed": metadata_report["passed"] and all(p["report"]["passed"] for p in profiles) and (collision is None or collision["passed"])}
        if is_kit:
            result["kit"] = metadata_report
            kits.append(result)
        else:
            result["package"], result["collision"] = metadata_report, collision
            worlds.append(result)
    identifiers = Counter(r["id"] for r in worlds + kits)
    duplicate_ids = [identifier for identifier, count in identifiers.items() if count > 1]
    passed = bool(worlds or kits) and not duplicate_ids and all(r["passed"] for r in worlds + kits)
    return {"schemaVersion": "urai-generic-world-qa-index-v1", "validatedAt": datetime.now(timezone.utc).isoformat(),
            "validatorSourceSha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(__file__).parent.glob("*.py"))},
            "packagesPath": str(base), "versionSelection": version, "selectionPolicy": "EXPLICIT_VERSION" if version else "LATEST_SEMANTIC_VERSION_PER_ID",
            "excludedPriorVersions": excluded, "duplicateCurrentIdentifiers": duplicate_ids,
            "packageCount": len(worlds), "kitCount": len(kits), "assetCount": len(worlds) + len(kits),
            "passedPackages": sum(r["passed"] for r in worlds), "failedPackages": sum(not r["passed"] for r in worlds),
            "passedKits": sum(r["passed"] for r in kits), "failedKits": sum(not r["passed"] for r in kits),
            "passed": passed, "packages": worlds, "kits": kits,
            "duplicateGlbHashes": [{"sha256": digest, "paths": paths} for digest, paths in global_hashes.items() if len(paths) > 1],
            "evidenceBoundary": {"byteAndStaticBudgetChecks": "CUSTOM_INDEPENDENT_QA", "KhronosValidator": "ROOT_RUNS_SEPARATELY",
                                 "runtimeFrameRate": "NOT_MEASURED", "historicalTruth": "GENERIC", "visualAcceptance": "NOT_GRANTED",
                                 "runtimeIntegration": "NOT_VERIFIED", "deviceCertification": "NOT_GRANTED", "independentApproval": "NOT_GRANTED"}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("packages", type=Path, help="Common root containing packages and/or kits")
    parser.add_argument("--version", help="Validate only one exact semantic version; otherwise newest per ID")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.version and not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        parser.error("--version must be a semantic version such as 1.0.1")
    if args.report.exists():
        parser.error("Receipt already exists; choose a versioned successor path")
    report = run_all(args.packages, args.version)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({key: report[key] for key in ("packageCount", "kitCount", "passedPackages", "failedPackages", "passedKits", "failedKits", "passed")} |
                     {"report": str(args.report), "sha256": hashlib.sha256(args.report.read_bytes()).hexdigest()}))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
