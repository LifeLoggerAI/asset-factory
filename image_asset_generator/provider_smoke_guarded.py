"""Execute exactly one paid provider request under the canonical atomic budget guard.

This command is intentionally non-promoting. It renders one output in the workflow
workspace, records the provider request ledger, and restores the active manifest.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import canonical_release_manifests
import paid_request_guard
import render_v1_round

BASE_DIR = Path(__file__).resolve().parent
ACTIVE_MANIFEST = BASE_DIR / "manifest.json"
RECEIPT = BASE_DIR / "provider_smoke_receipt.json"


def main() -> int:
    version = os.environ.get("URAI_VERSION", "v2").strip().lower()
    if version not in {"v1", "v2", "v3", "v4", "v5"}:
        raise ValueError(f"Unsupported URAI_VERSION={version!r}")

    if os.environ.get("ASSET_FORGE_MAX_PROVIDER_CALLS", "").strip() != "1":
        raise ValueError("Provider smoke requires ASSET_FORGE_MAX_PROVIDER_CALLS=1")
    if os.environ.get("ASSET_RENDERER_MAX_ATTEMPTS", "").strip() != "1":
        raise ValueError("Provider smoke requires ASSET_RENDERER_MAX_ATTEMPTS=1")

    selected = canonical_release_manifests.build(version)
    selected_bytes = selected.read_bytes()
    active_before = ACTIVE_MANIFEST.read_bytes()

    os.environ["ASSET_RENDERER_MODE"] = "provider"
    os.environ["ASSET_FORGE_REQUIRE_PROVIDER"] = "1"
    os.environ["ASSET_QUALITY_REQUIRE_PROVIDER"] = "1"
    os.environ["ASSET_FORGE_LIMIT_OUTPUTS"] = "1"
    os.environ["ASSET_FORGE_MAX_ROUNDS"] = "1"
    os.environ["ASSET_FORGE_SKIP_EXISTING_OUTPUTS"] = "0"

    try:
        ACTIVE_MANIFEST.write_bytes(selected_bytes)
        outcome = render_v1_round.render_round(1)
        ledger = paid_request_guard.snapshot()

        provider_calls = int(ledger.get("providerCallsExecuted", 0))
        attempts = ledger.get("attempts", [])
        incomplete = [
            attempt.get("attemptId")
            for attempt in attempts
            if attempt.get("status") == "reserved"
        ]

        if outcome.get("outputRequests") != 1:
            raise RuntimeError(f"Provider smoke must issue exactly one output request: {outcome}")
        if provider_calls != 1 or len(attempts) != 1:
            raise RuntimeError(f"Provider smoke must reserve exactly one provider call: {ledger}")
        if incomplete:
            raise RuntimeError(f"Provider smoke left an incomplete request reservation: {incomplete}")
        if attempts[0].get("status") != "succeeded":
            raise RuntimeError(f"Provider smoke request did not succeed: {attempts[0]}")

        payload = {
            "schemaVersion": "urai-provider-smoke-receipt-1",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "provider-smoke-passed",
            "version": version,
            "manifest": str(selected.relative_to(BASE_DIR)),
            "outputRequests": outcome.get("outputRequests"),
            "providerCallsExecuted": provider_calls,
            "paidRequestLedger": ledger,
            "promotionAllowed": False,
            "fullVersionCertificationAllowed": False,
        }
        RECEIPT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(payload, indent=2))
        return 0
    finally:
        ACTIVE_MANIFEST.write_bytes(active_before)


if __name__ == "__main__":
    raise SystemExit(main())
