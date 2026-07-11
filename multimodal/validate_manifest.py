from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
LANES = {"visual", "3d", "audio", "film", "accessibility", "runtime", "governance"}
COMPLETE = {"certified", "removed-from-scope"}
REQUIRED = {
    "assetId", "version", "world", "state", "experienceArea", "lane", "assetType",
    "routes", "runtimeComponent", "creativeSpecification", "technicalBudget",
    "deviceVariants", "accessibilityVariants", "providerOrSource", "providerModelVersion",
    "licensingStatus", "commercialUseStatus", "consentRequirements", "likenessRequirements",
    "costCeilingUsd", "dependencies", "expectedOutputPath", "checksum", "provenance",
    "validationRequirements", "currentStatus", "reviewStatus", "promotionStatus",
    "promotionPr", "mergedCommitSha", "releaseSha", "generationRequest", "providerJobId",
    "generatedAt", "attemptCount", "costUsedUsd", "qualityReport", "artifactId",
    "artifactDigest", "runtimeRoute", "liveVerificationEvidence",
}
SHA_FIELDS = {"mergedCommitSha", "releaseSha"}


def fail(message: str) -> None:
    raise SystemExit(f"multimodal manifest invalid: {message}")


def valid_sha(value: object) -> bool:
    return isinstance(value, str) and len(value) == 40 and all(c in "0123456789abcdef" for c in value)


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "1.1.0":
        fail("unsupported schemaVersion")
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
    paths: set[str] = set()
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
        output_path = asset["expectedOutputPath"]
        if not isinstance(output_path, str) or not output_path:
            fail(f"{asset_id}: invalid output path")
        if output_path in paths:
            fail(f"duplicate output path {output_path}")
        paths.add(output_path)
        if asset["costCeilingUsd"] < 0 or asset["costUsedUsd"] < 0:
            fail(f"negative cost for {asset_id}")
        if asset["costUsedUsd"] > asset["costCeilingUsd"]:
            fail(f"cost ceiling exceeded for {asset_id}")
        if asset["attemptCount"] < 0:
            fail(f"negative attempt count for {asset_id}")
        for field in SHA_FIELDS:
            if asset[field] is not None and not valid_sha(asset[field]):
                fail(f"{asset_id}: invalid {field}")
        status = asset["currentStatus"]
        status_counts[status] = status_counts.get(status, 0) + 1
        cost_used += float(asset["costUsedUsd"])
        cost_ceiling += float(asset["costCeilingUsd"])

        if status == "certified":
            proof = [
                asset["checksum"], asset["provenance"], asset["qualityReport"],
                asset["artifactId"], asset["artifactDigest"], asset["promotionPr"],
                asset["mergedCommitSha"], asset["releaseSha"], asset["runtimeRoute"],
                asset["liveVerificationEvidence"],
            ]
            if not all(proof):
                fail(f"certified asset {asset_id} lacks required receipt evidence")
            if asset["reviewStatus"] != "approved" or asset["promotionStatus"] != "merged":
                fail(f"certified asset {asset_id} lacks approved merged promotion")
            if asset["licensingStatus"] != "verified" and asset["licensingStatus"] != "not-applicable":
                fail(f"certified asset {asset_id} lacks verified licensing")
            if asset["commercialUseStatus"] != "verified" and asset["commercialUseStatus"] != "not-applicable":
                fail(f"certified asset {asset_id} lacks commercial-use clearance")

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
