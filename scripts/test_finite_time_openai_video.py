#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "film_foundry" / "finite_time" / "generate-openai-production.py"
spec = importlib.util.spec_from_file_location("finite_time_video", MODULE_PATH)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

assert mod.choose_source_duration(4) == 4
assert mod.choose_source_duration(5) == 8
assert mod.choose_source_duration(8) == 8
assert mod.choose_source_duration(9) == 12
assert mod.choose_source_duration(12) == 12

shot = {
    "id": "ft-fl-test",
    "title": "Milking line",
    "visual": "Cows stand side by side in a working milking line.",
    "audioDescription": "Cows stand side by side in a working milking line."
}
prompt = mod.build_prompt(shot, 6, False)
assert prompt.startswith("MANDATORY SHOT ft-fl-test")
assert prompt.index("Milking line") < 100
assert prompt.index("Cows stand side by side") < 250
assert prompt.index("FINITE TIME autobiographical prestige short film") > prompt.index("Cows stand side by side")
assert "never a slideshow" in prompt
assert "do not introduce people, vehicles, animals, or props" in prompt
assert "generic adult portrait, pickup-truck portrait, porch portrait" in prompt
assert "Photoreal East Texas memory-realism" in prompt
assert "readable brands" in prompt
assert "invented dialogue" in prompt
assert len(prompt) <= 1800

reference_prompt = mod.build_prompt({
    "id": "ft-fl-ref",
    "title": "Family memory",
    "visual": "A parent and child share a quiet smile.",
    "audioDescription": "A parent and child smile together."
}, 6, True)
assert reference_prompt.startswith("MANDATORY SHOT ft-fl-ref")
assert "identity/appearance authority" in reference_prompt
assert "identity drift" in reference_prompt

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "refs.json"
    path.write_text(json.dumps({
        "schemaVersion": "finite-time-private-reference-map-v1",
        "shots": {"ft-fl-test": {"path": "/private/ref.jpg", "clearedForProviderSubmission": True}}
    }))
    refs = mod.load_reference_map(path)
    assert refs["ft-fl-test"]["clearedForProviderSubmission"] is True

print("FINITE TIME OpenAI generator guardrails: PASS")
