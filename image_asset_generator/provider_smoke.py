from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import canonical_release_manifests
import forge_budget
import render_v1_round

BASE_DIR = Path(__file__).resolve().parent
ACTIVE_MANIFEST = BASE_DIR / "manifest.json"
RECEIPT = BASE_DIR / "provider_smoke_receipt.json"


def main() -> int:
    version = os.environ.get("URAI_VERSION", "v2")
    selected = canonical_release_manifests.build(version)
    selected_bytes = selected.read_bytes()
    active_before = ACTIVE_MANIFEST.read_bytes()

    os.environ["ASSET_FORGE_REQUIRE_PROVIDER"] = "1"
    os.environ["ASSET_FORGE_MISSING_ONLY"] = "1"
    os.environ["ASSET_FORGE_SMOKE_MAX_ASSETS"] = "1"
    forge_budget.validate_paid_run()

    try:
        ACTIVE_MANIFEST.write_bytes(selected_bytes)
        outcome = render_v1_round.render_round(1)
        if outcome["renderedAssets"] != 1 or outcome["providerCalls"] != 1:
            raise RuntimeError(f"Provider smoke must render exactly one asset and one provider call: {outcome}")
        payload = {
            "schemaVersion": "1.0.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "provider-smoke-passed",
            "version": version,
            "manifest": str(selected.relative_to(BASE_DIR)),
            "renderedAssets": outcome["renderedAssets"],
            "providerCalls": outcome["providerCalls"],
            "promotionAllowed": False,
            "fullVersionCertificationAllowed": False,
            "maxProviderCalls": int(os.environ["ASSET_FORGE_MAX_PROVIDER_CALLS"]),
            "estimatedUsdPerCall": os.environ["ASSET_RENDERER_ESTIMATED_USD_PER_CALL"],
            "maxEstimatedUsd": os.environ["ASSET_FORGE_MAX_ESTIMATED_USD"],
        }
        RECEIPT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(payload, indent=2))
        return 0
    finally:
        ACTIVE_MANIFEST.write_bytes(active_before)


if __name__ == "__main__":
    raise SystemExit(main())
