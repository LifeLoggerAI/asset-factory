#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "image_asset_generator"
OUT = ROOT / "creative-review"
sys.path.insert(0, str(GEN))


def sha256(path: Path) ->