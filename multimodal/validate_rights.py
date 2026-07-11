from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LEDGER = ROOT / "rights-ledger.json"
REQUIRED = {
    "provider-terms", "source-attribution", "commercial-rights", "music-license",
    "voice-consent", "likeness-consent", "sensitive-data", "deletion-revocation",
    "ownership-export", "retention-policy",
}


def fail(message: str) -> None:
    raise SystemExit(f"rights ledger invalid: {message}")


def main() -> None:
    data = json.loads(LEDGER.read_text(encoding="utf-8"))
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
    ids = {record.get("recordId") for record in records}
    missing = sorted(REQUIRED - ids)
    if missing:
        fail(f"missing records: {missing}")

    verified = 0
    for record in records:
        status = record.get("status")
        if status == "verified":
            if not record.get("source") or record.get("commercialUse") is not True or not record.get("reviewEvidence"):
                fail(f"false verified rights record: {record.get('recordId')}")
            verified += 1

    report = {"records": len(records), "verified": verified, "blockedOrPending": len(records) - verified}
    (ROOT / "rights-validation-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
