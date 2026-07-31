#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE_SCRIPT = ROOT / "scripts/generate_v2_certified_replacements.py"
SOURCE_MANIFEST = ROOT / "manifests/v2-certified-repair-manifest-20260730.json"
RETRY_MANIFEST = ROOT / "artifacts/v2-certified-repair/retry-manifest.json"
RECEIPT = ROOT / "artifacts/v2-certified-repair/generation-receipt.json"

spec = importlib.util.spec_from_file_location("v2_base_generator", BASE_SCRIPT)
if spec is None or spec.loader is None:
    raise SystemExit("cannot load base V2 generator")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
replacements = manifest["replacements"]
if len(replacements) != 71:
    raise SystemExit("expected 71 authorized replacements")

# One rejected request was already consumed by the first asset. Reducing that
# asset to one remaining attempt keeps the aggregate ceiling at 142 requests.
replacements[0]["maxAttempts"] = 1
RETRY_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
RETRY_MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
base.MANIFEST = RETRY_MANIFEST

original_api_generate = base.api_generate


def compatible_api_generate(asset, prompt):
    effective_model = "gpt-image-1" if asset["alphaRequired"] else "gpt-image-2"
    asset["model"] = effective_model
    asset["background"] = "transparent" if asset["alphaRequired"] else "opaque"
    return original_api_generate(asset, prompt)


base.api_generate = compatible_api_generate
result = base.main()

if RECEIPT.exists():
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    receipt["schemaVersion"] = "1.1.0"
    receipt["model"] = "mixed-compatible"
    receipt["modelPolicy"] = {
        "opaque": "gpt-image-2",
        "alphaRequired": "gpt-image-1",
    }
    receipt["priorRejectedProviderRequests"] = 1
    receipt["maxAdditionalProviderCalls"] = 141
    receipt["maxAggregateProviderCalls"] = 142
    receipt["aggregateProviderRequests"] = 1 + int(receipt.get("providerCalls", 0))
    receipt["authorizedSpendCeilingUsd"] = "20.00"
    RECEIPT.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")

raise SystemExit(result)
