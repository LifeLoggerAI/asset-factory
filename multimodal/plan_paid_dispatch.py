from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
REGISTRY = ROOT / "provider-registry.json"
OUT = ROOT / "paid-dispatch-plan.json"

PAID_LANES = {"visual", "3d", "audio", "film"}
COMPLETE = {"certified", "removed-from-scope"}
APPROVAL_ID = "urai-multimodal-2026-07-11