from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
REQUIREMENTS = ROOT / "canonical-requirements.json"
LOCK = ROOT / "source-lock.json"

ASSET_FACTORY_REPO = "LifeLoggerAI/asset-factory"
SPATIAL_REPO = "LifeLoggerAI/urai-spatial"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    requirements = json.loads(REQUIREMENTS.read_text(encoding="utf-8"))
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    current_head = os.environ.get("ASSET_FACTORY_HEAD_SHA") or lock["assetFactoryBaseSha"]

    existing_ids = {asset["assetId"] for asset in manifest["assets"]}
    for asset in manifest["assets"]:
        is_spatial = asset["lane"] == "3d"
        asset["repository"] = SPATIAL_REPO if is_spatial else ASSET_FACTORY_REPO
        asset["sourceRepository"] = asset["repository"]
        asset["specificationVersion"] = "1.1.0"
        asset["manifestVersion"] = manifest["schemaVersion"]

    for source in requirements.get("spatialAudio", []):
        if source["id"] in existing_ids:
            raise SystemExit(f"duplicate spatial audio asset: {source['id']}")
        manifest["assets"].append({
            "assetId": source["id"],
            "version": "v1",
            "world": "spatial-runtime",
            "state": "required",
            "experienceArea": "spatial ambient audio",
            "lane": "audio",
            "assetType": source["type"],
            "routes": source["routes"],
            "runtimeComponent": "useAudioController",
            "creativeSpecification": "Launch-critical reviewed ambient bed from the locked Spatial manifest.",
            "technicalBudget": {"durationSeconds": source["durationSeconds"], "maxBytes": source["maxBytes"]},
            "deviceVariants": ["desktop", "mobile", "tablet", "supported-xr", "silent-fallback"],
            "accessibilityVariants": ["silent-fallback", "user-controlled-enable"],
            "providerOrSource": "URAI deterministic candidate forge; final mix requires review",
            "providerModelVersion": None,
            "licensingStatus": "pending",
            "commercialUseStatus": "pending",
            "consentRequirements": [],
            "likenessRequirements": [],
            "costCeilingUsd": 0,
            "dependencies": [],
            "expectedOutputPath": source["path"],
            "checksum": None,
            "provenance": {"sourceManifest": requirements["sourceManifest"], "fallback": source["fallback"]},
            "validationRequirements": ["decode", "duration", "sample-rate", "channels", "clipping", "loudness", "silence-detection", "license", "runtime-playback"],
            "currentStatus": "candidate",
            "reviewStatus": "pending",
            "promotionStatus": "blocked",
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
            "runtimeRoute": source["routes"][0],
            "liveVerificationEvidence": [],
            "repository": SPATIAL_REPO,
            "sourceRepository": SPATIAL_REPO,
            "specificationVersion": "1.1.0",
            "manifestVersion": manifest["schemaVersion"],
        })

    manifest["generatedAt"] = os.environ.get("MANIFEST_GENERATED_AT") or manifest["generatedAt"]
    manifest["sourceShas"] = {
        "assetFactoryBase": lock["assetFactoryBaseSha"],
        "assetFactoryHead": current_head,
        "spatialMain": lock["spatialMainSha"],
        "spatialReleaseCandidate": lock["spatialReleaseCandidateSha"],
        "spatialProtectedRelease": lock["spatialProtectedReleaseSha"],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": len(manifest["assets"]), "assetFactoryHead": current_head, "spatialAudioAdded": len(requirements.get("spatialAudio", []))}, indent=2))


if __name__ == "__main__":
    main()
