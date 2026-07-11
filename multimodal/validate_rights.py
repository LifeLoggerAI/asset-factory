from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LEDGER = ROOT / "rights-ledger.json"
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
REPORT = ROOT / "rights-validation-report.json"
REQUIRED = {
    "provider-terms", "source-attribution", "commercial-rights", "music-license",
    "voice-consent", "likeness-consent", "sensitive-data", "deletion-revocation",
    "ownership-export", "retention-policy",
}
MUST_VERIFY = {
    "provider-terms", "source-attribution", "commercial-rights", "sensitive-data",
    "deletion-revocation", "ownership-export", "retention-policy",
}
ALLOWED_STATUSES = {"verified", "not-applicable", "pending", "blocked", "expired"}
PROMOTABLE_STATUSES = {"verified", "not-applicable"}


def fail(message: str) -> None:
    raise SystemExit(f"rights ledger invalid: {message}")


def parse_expiration(value: object, record_id: str) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        fail(f"{record_id}: invalid expiresAt")
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        fail(f"{record_id}: expiresAt must be ISO-8601")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def requirement_list(asset: dict[str, object], key: str) -> list[str]:
    value = asset.get(key)
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def load_manifest_scope() -> dict[str, object]:
    if not MANIFEST.is_file():
        return {
            "available": False,
            "generalConsentAssetIds": [],
            "voiceConsentAssetIds": [],
            "likenessConsentAssetIds": [],
        }

    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"manifest scope cannot be read: {error}")
    assets = manifest.get("assets") if isinstance(manifest, dict) else None
    if not isinstance(assets, list):
        fail("manifest scope requires an assets list")

    general: set[str] = set()
    voice: set[str] = set()
    likeness: set[str] = set()
    for index, raw in enumerate(assets):
        if not isinstance(raw, dict):
            fail(f"manifest asset {index} must be an object")
        asset_id = raw.get("assetId")
        if not isinstance(asset_id, str) or not asset_id.strip():
            fail(f"manifest asset {index} has no assetId")
        consent_requirements = requirement_list(raw, "consentRequirements")
        likeness_requirements = requirement_list(raw, "likenessRequirements")
        if consent_requirements:
            general.add(asset_id)
        if any("voice" in requirement.lower() for requirement in consent_requirements + likeness_requirements):
            voice.add(asset_id)
        if likeness_requirements:
            likeness.add(asset_id)

    return {
        "available": True,
        "generalConsentAssetIds": sorted(general),
        "voiceConsentAssetIds": sorted(voice),
        "likenessConsentAssetIds": sorted(likeness),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--require-promotion-ready",
        action="store_true",
        help="Exit non-zero unless every required rights and consent record is promotion-ready.",
    )
    args = parser.parse_args()

    data = json.loads(LEDGER.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != "1.0.0":
        fail("unsupported schemaVersion")

    policy = data.get("policy", {})
    if policy.get("unknownRightsBlockPromotion") is not True:
        fail("unknown rights must block promotion")
    if policy.get("unknownConsentBlocksIdentityUse") is not True:
        fail("unknown consent must block identity use")
    if policy.get("privateLifeDataAllowed") is not False:
        fail("private life data must remain prohibited")
    if policy.get("voiceCloningAllowedWithoutConsent") is not False:
        fail("voice cloning without consent must remain prohibited")

    records = data.get("records", [])
    if not isinstance(records, list):
        fail("records must be a list")

    by_id: dict[str, dict[str, object]] = {}
    status_counts: dict[str, int] = {}
    expired_ids: list[str] = []
    now = datetime.now(timezone.utc)

    for index, raw in enumerate(records):
        if not isinstance(raw, dict):
            fail(f"record {index} must be an object")
        record_id = raw.get("recordId")
        if not isinstance(record_id, str) or not record_id.strip():
            fail(f"record {index} has invalid recordId")
        if record_id in by_id:
            fail(f"duplicate recordId: {record_id}")
        by_id[record_id] = raw

        status = raw.get("status")
        if status not in ALLOWED_STATUSES:
            fail(f"{record_id}: unsupported status {status!r}")
        status_counts[str(status)] = status_counts.get(str(status), 0) + 1

        if not isinstance(raw.get("source"), str) or not str(raw.get("source")).strip():
            fail(f"{record_id}: source is required")
        if not isinstance(raw.get("reviewEvidence"), str) or not str(raw.get("reviewEvidence")).strip():
            fail(f"{record_id}: reviewEvidence is required")

        expiration = parse_expiration(raw.get("expiresAt"), record_id)
        if expiration is not None and expiration <= now:
            expired_ids.append(record_id)

        if status == "verified":
            if raw.get("commercialUse") is not True:
                fail(f"false verified rights record: {record_id}")
        elif status == "not-applicable":
            if record_id in MUST_VERIFY:
                fail(f"{record_id}: not-applicable cannot satisfy this mandatory right")
            if raw.get("commercialUse") is not True:
                fail(f"{record_id}: not-applicable record must still declare commercial-use safety")

    missing = sorted(REQUIRED - set(by_id))
    extra = sorted(set(by_id) - REQUIRED)
    if missing:
        fail(f"missing records: {missing}")
    if extra:
        fail(f"unexpected records: {extra}")

    blocking_ids = {
        record_id
        for record_id in REQUIRED
        if by_id[record_id].get("status") not in PROMOTABLE_STATUSES or record_id in expired_ids
    }

    manifest_scope = load_manifest_scope()
    scope_contradictions: list[str] = []
    if manifest_scope["available"] is not True:
        blocking_ids.add("manifest-scope")
    else:
        scoped_records = {
            "voice-consent": manifest_scope["voiceConsentAssetIds"],
            "likeness-consent": manifest_scope["likenessConsentAssetIds"],
        }
        for record_id, asset_ids in scoped_records.items():
            if not asset_ids:
                continue
            status = by_id[record_id].get("status")
            if status == "not-applicable":
                scope_contradictions.append(record_id)
            if status != "verified":
                blocking_ids.add(record_id)

    blocking = sorted(blocking_ids)
    promotion_allowed = not blocking
    report = {
        "schemaVersion": "1.2.0",
        "ledger": str(LEDGER.relative_to(ROOT.parent)),
        "ledgerSha256": hashlib.sha256(LEDGER.read_bytes()).hexdigest(),
        "manifest": str(MANIFEST.relative_to(ROOT.parent)),
        "manifestSha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest() if MANIFEST.is_file() else None,
        "records": len(records),
        "statusCounts": status_counts,
        "structurallyValid": True,
        "promotionAllowed": promotion_allowed,
        "rightsReady": promotion_allowed,
        "blockingRecordIds": blocking,
        "expiredRecordIds": sorted(expired_ids),
        "scopeContradictions": sorted(scope_contradictions),
        "manifestConsentScope": {
            "available": manifest_scope["available"],
            "generalConsentAssetCount": len(manifest_scope["generalConsentAssetIds"]),
            "voiceConsentAssetCount": len(manifest_scope["voiceConsentAssetIds"]),
            "likenessConsentAssetCount": len(manifest_scope["likenessConsentAssetIds"]),
            "voiceConsentAssetIds": manifest_scope["voiceConsentAssetIds"],
            "likenessConsentAssetIds": manifest_scope["likenessConsentAssetIds"],
        },
        "claimBoundary": (
            "Rights ledger structure and manifest consent scope are valid and promotion rights are complete."
            if promotion_allowed
            else "Rights ledger structure is valid, but promotion and certification remain blocked."
        ),
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))

    if args.require_promotion_ready and not promotion_allowed:
        fail(f"promotion blocked by records: {blocking}")


if __name__ == "__main__":
    main()
