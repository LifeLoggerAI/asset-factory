from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
GENERATOR = REPO / "image_asset_generator"
sys.path[:0] = [str(GENERATOR), str(REPO)]
REQ = json.loads((ROOT / "canonical-requirements.json").read_text())
LOCK = json.loads((ROOT / "source-lock.json").read_text())
OUT = ROOT / "full-multimodal-asset-manifest.json"


def entry(asset_id, lane, asset_type, path, **overrides):
    value = {
        "assetId": asset_id,
        "version": "v1",
        "world": "global",
        "state": "required",
        "experienceArea": "URAI",
        "lane": lane,
        "assetType": asset_type,
        "routes": [],
        "runtimeComponent": "unassigned",
        "creativeSpecification": "Production-ready asset with no placeholder substitution.",
        "technicalBudget": {},
        "deviceVariants": ["desktop", "mobile", "tablet"],
        "accessibilityVariants": [],
        "providerOrSource": "unselected",
        "providerModelVersion": None,
        "licensingStatus": "pending",
        "commercialUseStatus": "pending",
        "consentRequirements": [],
        "likenessRequirements": [],
        "costCeilingUsd": 0,
        "dependencies": [],
        "expectedOutputPath": path,
        "checksum": None,
        "provenance": {},
        "validationRequirements": [],
        "currentStatus": "missing",
        "reviewStatus": "not-started",
        "promotionStatus": "not-started",
        "promotionPr": None,
        "mergedCommitSha": None,
        "releaseSha": None,
        "generationRequest": None,
        "providerJobId": None,
        "generatedAt": None,
        "attemptCount": 0,
        "costUsedUsd": 0,
        "qualityReport": None,
        "artifactId": None,
        "artifactDigest": None,
        "runtimeRoute": None,
        "liveVerificationEvidence": [],
    }
    value.update(overrides)
    return value


def visuals():
    from image_asset_generator import canonical_release_manifests as crm
    config = {
        "v1": "manifests/generated/v1.manifest.json",
        "v2": "manifests/generated/v2.manifest.json",
        "v3": "manifests/generated/v3-canonical.manifest.json",
        "v4": "manifests/generated/v4-canonical.manifest.json",
        "v5": "manifests/generated/v5-canonical.manifest.json",
    }
    result = []
    for version, rel in config.items():
        crm.build(version)
        path = REPO / "image_asset_generator" / rel
        for src in json.loads(path.read_text()):
            result.append(entry(
                str(src["name"]), "visual", "responsive-world-graphic", str(src["canonical_path"]),
                version=version,
                world=str(src.get("category", version)),
                experienceArea=str(src.get("category", version)),
                runtimeComponent="canonical visual asset resolver",
                creativeSpecification=str(src.get("prompt", "")),
                technicalBudget={"sizes": src.get("sizes", []), "aspectRatio": src.get("aspect_ratio"), "alpha": src.get("alpha"), "format": "webp"},
                deviceVariants=["desktop", "mobile", "tablet", "supported-xr"],
                accessibilityVariants=["low-bandwidth-static", "alt-description"],
                providerOrSource="asset-factory canonical version forge",
                validationRequirements=["decode", "dimensions", "format", "alpha", "responsive-crops", "visual-regression", "route-rendering", "quality-threshold"],
                promotionStatus="blocked",
                provenance={"sourceManifest": rel, "promptVersion": src.get("prompt_version"), "sourceStatus": src.get("status")},
            ))
    return result


def models():
    result = []
    for src in REQ["threeD"]:
        budget = {k: src[k] for k in ("maxTriangles", "maxBytes") if k in src}
        result.append(entry(
            src["id"], "3d", src["type"], src["path"], routes=src["routes"], runtimeRoute=src["routes"][0],
            runtimeComponent="manifest-driven selected model layer",
            creativeSpecification="Reviewed selected production asset with explicit fallback.",
            technicalBudget=budget,
            deviceVariants=["desktop", "mobile", "tablet", "supported-xr", "non-xr-fallback"],
            accessibilityVariants=["static-fallback", "reduced-motion"],
            providerOrSource="deterministic launch-critical forge plus reviewed provider",
            validationRequirements=["decode", "textures", "materials", "polygon-budget", "file-size", "animation", "lighting", "loading-performance", "lod", "fallback"],
            currentStatus="candidate", reviewStatus="pending", promotionStatus="blocked",
            provenance={"fallback": src["fallback"], "selectedBinaryVerified": False},
        ))
    return result


def matrix_assets(lane, names, route, component, folder, validations):
    result = []
    for name in names:
        result.append(entry(
            f"{lane}-{name}-v1", lane, name, f"multimodal/outputs/{folder}/{name}.json",
            experienceArea=route, routes=[route], runtimeRoute=route, runtimeComponent=component,
            creativeSpecification=f"Production {name} for {route}.",
            deviceVariants=["desktop", "mobile", "tablet", "supported-xr"],
            validationRequirements=validations, promotionStatus="blocked",
        ))
    return result


def main():
    assets = visuals() + models()
    for phase in REQ["audioPhases"]:
        route = {"home":"/home", "ascent":"/", "lifemap":"/life-map", "focus":"/focus", "replay":"/replay"}[phase]
        assets += matrix_assets("audio", [f"{phase}-{k}" for k in REQ["audioKinds"]], route, "useAudioController", f"audio/{phase}", ["decode", "duration", "sample-rate", "channels", "clipping", "loudness", "silence-detection", "transcript-alignment", "license", "consent", "runtime-playback"])
    assets += matrix_assets("film", REQ["filmAssets"], "/replay", "Replay film surface", "film", ["decode", "resolution", "frame-rate", "duration", "scene-order", "missing-frame", "av-sync", "captions", "export-integrity", "runtime-playback"])
    for route in REQ["routes"]:
        slug = route.strip("/").replace("/", "-") or "root"
        assets += matrix_assets("accessibility", [f"{slug}-{k}" for k in REQ["accessibilityKinds"]], route, "route accessibility and fallback layer", f"accessibility/{slug}", ["route-integration", "screen-reader", "keyboard", "reduced-motion", "low-bandwidth", "silent-mode", "error-recovery"])
    assets += matrix_assets("governance", REQ["governanceRecords"], "/status", "release evidence and governance controls", "governance", ["asset-linkage", "review-state", "revocation-state"])
    assets += matrix_assets("runtime", REQ["runtimeEvidence"], "/", "protected production release process", "runtime-evidence", ["exact-sha", "artifact-digest"])
    manifest = {
        "schemaVersion": "1.1.0",
        "manifestId": "urai-full-multimodal-assets-v1",
        "generatedAt": LOCK["verifiedAt"],
        "sourceShas": {"assetFactory": LOCK["assetFactoryBaseSha"], "spatial": LOCK["spatialMainSha"]},
        "releasePolicy": {"placeholdersAllowed": False, "requiresExactReleaseSha": True, "requiresLiveEvidence": True, "requiresDistinctRollbackSha": True, "paidGenerationRequiresApproval": True},
        "assets": assets,
    }
    OUT.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"output": str(OUT.relative_to(REPO)), "assets": len(assets)}, indent=2))


if __name__ == "__main__":
    main()
