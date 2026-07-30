#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "scripts/build-v1-v5-multimodal-ledger.py"

spec = importlib.util.spec_from_file_location("urai_multimodal_ledger", TARGET)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load ledger builder: {TARGET}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

original_legacy_glb_candidates = module.legacy_glb_candidates


def guarded_legacy_glb_candidates():
    try:
        return original_legacy_glb_candidates()
    except RuntimeError as exc:
        detail = str(exc)
        if "404" not in detail and "Not Found" not in detail:
            raise
        return [], {
            "repository": module.PROD_REPO,
            "path": "manifest/glb_manifest.json",
            "ref": module.PROD_REF,
            "accessStatus": "unavailable-to-current-repository-token",
            "reason": "private-cross-repository-read-denied",
            "candidateInventoryStatus": "deferred-to-connector-side-reconciliation",
        }


module.legacy_glb_candidates = guarded_legacy_glb_candidates
raise SystemExit(module.main())
