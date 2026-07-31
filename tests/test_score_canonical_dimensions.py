from __future__ import annotations

import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "image_asset_generator" / "score_v1_assets.py"
SPEC = importlib.util.spec_from_file_location("score_v1_assets", MODULE_PATH)
assert SPEC and SPEC.loader
scorer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scorer)


def test_declared_768_scene_uses_768_minimum() -> None:
    entry = {"sizes": [768], "alpha": False}
    assert scorer.canonical_minimum_edge(entry, alpha=False) == 768


def test_declared_scene_size_overrides_legacy_floor() -> None:
    entry = {"sizes": [1400], "alpha": False}
    assert scorer.canonical_minimum_edge(entry, alpha=False) == 1400


def test_legacy_defaults_remain_fail_closed() -> None:
    assert scorer.canonical_minimum_edge({}, alpha=False) == 1200
    assert scorer.canonical_minimum_edge({}, alpha=True) == 512


def test_invalid_declared_sizes_do_not_weaken_defaults() -> None:
    entry = {"sizes": [0, -1, "invalid"]}
    assert scorer.canonical_minimum_edge(entry, alpha=False) == 1200
