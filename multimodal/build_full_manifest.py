from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
GENERATOR = REPO / "image_asset_generator"
sys.path[:0] = [str(GENERATOR), str(REPO)]
REQ = json.loads((ROOT / "canonical-requirements.json").read_text())
LOCK = json.loads((ROOT / "source-lock.json").read_text())
OUT = ROOT / "full-multimodal-asset-manifest.json"


def entry(asset_id, lane, asset_type, path, **overrides):
    value = {
        "assetId": asset_id,
        "version": "v1",
        "world": "global",
        "state": "required",
        "experienceArea": "URAI",
        "lane": lane,
        "assetType": asset_type,
        "routes": [],