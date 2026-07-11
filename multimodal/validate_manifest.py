from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
LANES = {"visual", "3d", "audio", "film", "accessibility", "runtime", "governance"}
ALLOWED_STATUSES = {
    "required", "planned", "queued", "generating", "generated", "candidate",
    "blocked", "review-pending", "approved", "promoted", "certified", "removed-from-scope",
}
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
CLEARANCE = {"verified", "not-applicable"}


def fail(message: str) -> None:
    raise SystemExit(f"multimodal manifest invalid: {message}")


def valid_hex(value: object, length: int) -> bool:
    return isinstance(value, str) and len(value) == length and all(c in "0123456789abcdef" for c in value)


def valid_sha(value: object) -> bool:
    return valid_hex(value, 40)


def valid_digest(value: object) -> bool:
    if not isinstance(value, str):
        return False
    normalized = value.removeprefix("sha256:")
    return valid_hex(normalized, 64)


def parse_time(value: object, context: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        fail(f"{context}: timestamp is required")
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        fail(f"{context}: timestamp must be ISO-8601")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def safe_relative_path(value: object, context: str) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{context}: path is required")
    path = PurePosixPath(value.strip())
    if path.is_absolute() or ".." in path.parts or "." in path.parts:
        fail(f"{context}: unsafe output path")
    return path.as_posix()


def require_nonempty_list(value: object, context: str) -> list[object]:
    if not isinstance(value, list) or not value:
        fail(f"{context}: non-empty list is required")
    return value


def require_evidence_list(value: object, asset_id: str) -> None:
    evidence = require_nonempty_list(value, f"{asset_id}: liveVerificationEvidence")
    for index, item in enumerate(evidence):
        if not isinstance(item, dict):
            fail(f"{asset_id}: live evidence {index} must be an object")
        if not valid_sha(item.get("deployedSha")):
            fail(f"{asset_id}: live evidence {index} lacks exact deployedSha")
        if item.get("deployedSha") != item.get("releaseSha"):
            fail(f"{asset_id}: live evidence {index} release/deployed SHA mismatch")
        if not isinstance(item.get("environment"), str) or not item["environment"].strip():
            fail(f"{asset_id}: live evidence {index} lacks environment")
        if not isinstance(item.get("url"), str) or urlparse(item["url"]).scheme != "https":
            fail(f"{asset_id}: live evidence {index} lacks HTTPS URL")
        if item.get("status") not in {"passed", "verified"}:
            fail(f"{asset_id}: live evidence {index} is not passed")
        parse_time(item.get("verifiedAt"), f"{asset_id}: live evidence {index}")


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
    required_policy = {
        "placeholdersAllowed": False,
        "requiresExactReleaseSha": True,
        "requiresLiveEvidence": True,
        "requiresDistinctRollbackSha": True,
        "paidGenerationRequiresApproval": True,
    }
    for key, expected in required_policy.items():
        if policy.get(key) is not expected:
            fail(f"release policy {key} must be {expected}")

    assets = data.get("assets")
    if not isinstance(assets, list) or not assets:
        fail("assets must be a non-empty list")

    ids: set[str] = set()
    paths: set[tuple[str, str]] = set()
    lane_counts = {lane: 0 for lane in LANES}
    status_counts: dict[str, int] = {}
    cost_used = 0.0
    cost_ceiling = 0.0
    now = datetime.now(timezone.utc)

    for index, asset in enumerate(assets):
        if not isinstance(asset, dict):
            fail(f"asset {index} is not an object")
        missing = REQUIRED - set(asset)
        if missing:
            fail(f"asset {index} missing fields: {sorted(missing)}")
        asset_id = asset["assetId"]
        if not isinstance(asset_id, str) or not asset_id.strip():
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

        output_path = safe_relative_path(asset["expectedOutputPath"], asset_id)
        path_key = (repository, output_path)
        if path_key in paths:
            fail(f"duplicate output path {repository}:{output_path}")
        paths.add(path_key)

        if not isinstance(asset["costCeilingUsd"], (int, float)) or not isinstance(asset["costUsedUsd"], (int, float)):
            fail(f"{asset_id}: costs must be numeric")
        if asset["costCeilingUsd"] < 0 or asset["costUsedUsd"] < 0:
            fail(f"negative cost for {asset_id}")
        if asset["costUsedUsd"] > asset["costCeilingUsd"]:
            fail(f"cost ceiling exceeded for {asset_id}")
        if not isinstance(asset["attemptCount"], int) or asset["attemptCount"] < 0:
            fail(f"invalid attempt count for {asset_id}")
        for field in SHA_FIELDS:
            if asset[field] is not None and not valid_sha(asset[field]):
                fail(f"{asset_id}: invalid {field}")
        if asset["releaseSha"] and asset["rollbackSha"] == asset["releaseSha"]:
            fail(f"{asset_id}: rollback SHA must differ from release SHA")

        for field in ("retentionPolicy", "deletionPolicy"):
            if not isinstance(asset[field], str) or not asset[field].strip():
                fail(f"{asset_id}: invalid {field}")
        for field in ("attributionRequirements", "consentRequirements", "likenessRequirements"):
            if not isinstance(asset[field], list):
                fail(f"{asset_id}: {field} must be a list")

        status = asset["currentStatus"]
        if status not in ALLOWED_STATUSES:
            fail(f"{asset_id}: unsupported currentStatus {status!r}")
        status_counts[status] = status_counts.get(status, 0) + 1
        cost_used += float(asset["costUsedUsd"])
        cost_ceiling += float(asset["costCeilingUsd"])

        if status == "removed-from-scope":
            provenance = asset.get("provenance")
            if not isinstance(provenance, dict) or not valid_sha(provenance.get("scopeRemovalApprovalSha")):
                fail(f"removed-from-scope asset {asset_id} lacks immutable approval SHA")
            if not isinstance(provenance.get("scopeRemovalReason"), str) or len(provenance["scopeRemovalReason"].strip()) < 12:
                fail(f"removed-from-scope asset {asset_id} lacks reason")
            if asset["reviewStatus"] != "approved" or asset["promotionStatus"] != "not-applicable":
                fail(f"removed-from-scope asset {asset_id} lacks approved non-promotion state")

        if status == "certified":
            if not valid_digest(asset["checksum"]):
                fail(f"certified asset {asset_id} has invalid checksum")
            if not valid_digest(asset["artifactDigest"]):
                fail(f"certified asset {asset_id} has invalid artifact digest")
            if not isinstance(asset["artifactId"], str) or not asset["artifactId"].strip():
                fail(f"certified asset {asset_id} lacks artifact ID")
            if not isinstance(asset["qualityReport"], dict) or asset["qualityReport"].get("status") not in {"passed", "approved"}:
                fail(f"certified asset {asset_id} lacks passed quality report")
            provenance = asset["provenance"]
            if not isinstance(provenance, dict):
                fail(f"certified asset {asset_id} lacks structured provenance")
            for field in ("provider", "providerReceiptId", "sourceSha256", "termsVersion"):
                if not isinstance(provenance.get(field), str) or not provenance[field].strip():
                    fail(f"certified asset {asset_id} provenance lacks {field}")
            if not valid_digest(provenance.get("sourceSha256")):
                fail(f"certified asset {asset_id} provenance sourceSha256 is invalid")
            if asset["reviewStatus"] != "approved" or asset["promotionStatus"] != "merged":
                fail(f"certified asset {asset_id} lacks approved merged promotion")
            if not isinstance(asset["promotionPr"], str) or "github.com/LifeLoggerAI/" not in asset["promotionPr"]:
                fail(f"certified asset {asset_id} lacks canonical promotion PR")
            for field in ("licensingStatus", "commercialUseStatus", "ownershipStatus", "exportabilityStatus", "revocationStatus"):
                if asset[field] not in CLEARANCE:
                    fail(f"certified asset {asset_id} lacks {field} clearance")
            expiration = asset.get("licenseExpiration")
            if expiration is not None and parse_time(expiration, f"{asset_id}: licenseExpiration") <= now:
                fail(f"certified asset {asset_id} has expired license")
            if asset["consentRequirements"] or asset["likenessRequirements"]:
                consent = provenance.get("consentEvidence")
                if not isinstance(consent, list) or not consent:
                    fail(f"certified asset {asset_id} lacks consent/likeness evidence")
                for item in consent:
                    if not isinstance(item, dict) or not valid_digest(item.get("receiptSha256")):
                        fail(f"certified asset {asset_id} contains invalid consent evidence")
                    if item.get("status") != "verified":
                        fail(f"certified asset {asset_id} consent evidence is not verified")
            if not valid_sha(asset["mergedCommitSha"]) or not valid_sha(asset["releaseSha"]) or not valid_sha(asset["rollbackSha"]):
                fail(f"certified asset {asset_id} lacks exact merge/release/rollback SHAs")
            if asset["releaseSha"] == asset["rollbackSha"]:
                fail(f"certified asset {asset_id} rollback SHA equals release SHA")
            require_evidence_list(asset["liveVerificationEvidence"], asset_id)
            if any(item.get("deployedSha") != asset["releaseSha"] for item in asset["liveVerificationEvidence"]):
                fail(f"certified asset {asset_id} live evidence does not match release SHA")

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
        "claimBoundary": "Manifest structure validated; release readiness requires every asset to satisfy immutable certification or approved scope-removal evidence.",
    }
    (ROOT / "validation-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    print("release-ready manifest" if report["releaseReady"] else "release remains blocked")


if __name__ == "__main__":
    main()
