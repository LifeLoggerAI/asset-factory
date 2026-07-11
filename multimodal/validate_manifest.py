from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
LANES = {"visual", "3d", "audio", "film", "accessibility", "runtime", "governance"}
COMPLETE = {"certified", "removed-from-scope"}
REPOSITORIES = {"LifeLoggerAI/asset-factory", "LifeLoggerAI/urai-spatial"}
SOURCE_SHA_FIELDS = {
    "assetFactoryBase", "assetFactoryHead", "spatialMain",
    "spatialReleaseCandidate", "spatialProtectedRelease",
}
REQUIRED = {
    "assetId", "version", "world", "state", "experienceArea", "lane", "assetType",
    "routes", "runtimeComponent", "creativeSpecification", "technicalBudget",
    "deviceVariants", "accessibilityVariants", "providerOrSource", "providerModelVersion",
    "licensingStatus", "commercialUseStatus", "consentRequirements", "likenessRequirements",
    "costCeilingUsd", "dependencies", "expectedOutputPath", "checksum", "provenance",
    "validationRequirements", "currentStatus", "reviewStatus", "promotionStatus",
    "promotionPr", "mergedCommitSha", "releaseSha", "generationRequest", "providerJobId",
    "generatedAt", "attemptCount", "costUsedUsd", "qualityReport", "artifactId",
    "artifactDigest", "runtimeRoute", "liveVerificationEvidence", "repository",
    "sourceRepository", "specificationVersion", "manifestVersion", "attributionRequirements",
    "sensitiveDataClassification", "ownershipStatus", "licenseExpiration", "retentionPolicy",
    "deletionPolicy", "exportabilityStatus", "revocationStatus", "replacementStatus", "rollbackSha",
}
SHA_FIELDS = {"mergedCommitSha", "releaseSha", "rollbackSha"}


def fail(message: str) -> None:
    raise SystemExit(f"multimodal manifest invalid: {message}")


def valid_sha(value: object) -> bool:
    return isinstance(value, str) and len(value) == 40 and all(c in "0123456789abcdef" for c in value)


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "1.2.0":
        fail("unsupported schemaVersion")

    source_shas = data.get("sourceShas")
    if not isinstance(source_shas, dict) or set(source_shas) != SOURCE_SHA_FIELDS:
        fail("sourceShas must contain the exact five locked source fields")
    for field, value in source_shas.items():
        if not valid_sha(value):
            fail(f"invalid source SHA {field}")

    policy = data.get("releasePolicy", {})
    for key in ("placeholdersAllowed", "requiresExactReleaseSha", "requiresLiveEvidence", "requiresDistinctRollbackSha", "paidGenerationRequiresApproval"):
        if key not in policy:
            fail(f"release policy missing {key}")
    if policy["placeholdersAllowed"] is not False:
        fail("placeholders must remain prohibited")

    assets = data.get("assets")
    if not isinstance(assets, list) or not assets:
        fail("assets must be a non-empty list")

    ids: set[str] = set()
    paths: set[tuple[str, str]] = set()
    lane_counts = {lane: 0 for lane in LANES}
    status_counts: dict[str, int] = {}
    cost_used = 0.0
    cost_ceiling = 0.0

    for index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            fail(f"asset {index} is not an object")
        missing = REQUIRED - set(asset)
        if missing:
            fail(f"asset {index} missing fields: {sorted(missing)}")
        asset_id = asset["assetId"]
        if not isinstance(asset_id, str) or not asset_id:
            fail(f"asset {index} has invalid assetId")
        if asset_id in ids:
            fail(f"duplicate assetId {asset_id}")
        ids.add(asset_id)

        lane = asset["lane"]
        if lane not in LANES:
            fail(f"unsupported lane {lane}")
        lane_counts[lane] += 1

        repository = asset["repository"]
        if repository not in REPOSITORIES or asset["sourceRepository"] not in REPOSITORIES:
            fail(f"{asset_id}: unsupported repository")
        if asset["specificationVersion"] != "1.2.0" or asset["manifestVersion"] != "1.2.0":
            fail(f"{asset_id}: stale specification or manifest version")

        output_path = asset["expectedOutputPath"]
        if not isinstance(output_path, str) or not output_path:
            fail(f"{asset_id}: invalid output path")
        path_key = (repository, output_path)
        if path_key in paths:
            fail(f"duplicate output path {repository}:{output_path}")
        paths.add(path_key)

        if asset["costCeilingUsd"] < 0 or asset["costUsedUsd"] < 0:
            fail(f"negative cost for {asset_id}")
        if asset["costUsedUsd"] > asset["costCeilingUsd"]:
            fail(f"cost ceiling exceeded for {asset_id}")
        if asset["attemptCount"] < 0:
            fail(f"negative attempt count for {asset_id}")
        for field in SHA_FIELDS:
            if asset[field] is not None and not valid_sha(asset[field]):
                fail(f"{asset_id}: invalid {field}")
        if asset["releaseSha"] and asset["rollbackSha"] == asset["releaseSha"]:
            fail(f"{asset_id}: rollback SHA must differ from release SHA")

        for field in ("retentionPolicy", "deletionPolicy"):
            if not isinstance(asset[field], str) or not asset[field].strip():
                fail(f"{asset_id}: invalid {field}")
        if not isinstance(asset["attributionRequirements"], list):
            fail(f"{asset_id}: attributionRequirements must be a list")

        status = asset["currentStatus"]
        status_counts[status] = status_counts.get(status, 0) + 1
        cost_used += float(asset["costUsedUsd"])
        cost_ceiling += float(asset["costCeilingUsd"])

        if status == "certified":
            proof = [
                asset["checksum"], asset["provenance"], asset["qualityReport"],
                asset["artifactId"], asset["artifactDigest"], asset["promotionPr"],
                asset["mergedCommitSha"], asset["releaseSha"], asset["rollbackSha"],
                asset["runtimeRoute"], asset["liveVerificationEvidence"],
            ]
            if not all(proof):
                fail(f"certified asset {asset_id} lacks required receipt evidence")
            if asset["reviewStatus"] != "approved" or asset["promotionStatus"] != "merged":
                fail(f"certified asset {asset_id} lacks approved merged promotion")
            if asset["licensingStatus"] not in {"verified", "not-applicable"}:
                fail(f"certified asset {asset_id} lacks verified licensing")
            if asset["commercialUseStatus"] not in {"verified", "not-applicable"}:
                fail(f"certified asset {asset_id} lacks commercial-use clearance")
            if asset["ownershipStatus"] not in {"verified", "not-applicable"}:
                fail(f"certified asset {asset_id} lacks ownership clearance")
            if asset["exportabilityStatus"] not in {"verified", "not-applicable"}:
                fail(f"certified asset {asset_id} lacks exportability clearance")
            if asset["revocationStatus"] not in {"verified", "not-applicable"}:
                fail(f"certified asset {asset_id} lacks revocation clearance")

    missing_lanes = sorted(lane for lane, count in lane_counts.items() if count == 0)
    if missing_lanes:
        fail(f"missing required lanes: {missing_lanes}")

    complete = sum(status_counts.get(state, 0) for state in COMPLETE)
    digest = hashlib.sha256(MANIFEST.read_bytes()).hexdigest()
    report = {
        "manifest": str(MANIFEST.relative_to(ROOT.parent)),
        "sha256": digest,
        "total": len(assets),
        "complete": complete,
        "missingOrBlocked": len(assets) - complete,
        "laneCounts": lane_counts,
        "statusCounts": status_counts,
        "costUsedUsd": round(cost_used, 2),
        "costCeilingUsd": round(cost_ceiling, 2),
        "releaseReady": complete == len(assets),
    }
    (ROOT / "validation-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    print("release-ready manifest" if report["releaseReady"] else "release remains blocked")


if __name__ == "__main__":
    main()
