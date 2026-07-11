"""Render one canonical forge round with bounded, resumable provider requests."""

from __future__ import annotations

import json
import os
from typing import Dict

import cost_guarded_renderer
import generate_assets as base


def optional_limit(name: str) -> int | None:
    raw = os.environ.get(name, "").strip()
    if not raw or raw == "0":