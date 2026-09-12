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
    "title": "Continuity test",
    "visual": "A person crosses a lived-in room.",
    "audioDescription": "A person crosses the room."
}
prompt = mod.build_prompt(shot, 6)
assert "Photoreal memory-realism" in prompt
assert "no readable brands" in prompt
assert "do not invent facts or dialogue" in prompt

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "refs.json"
    path.write_text(json.dumps({
        "schemaVersion": "finite-time-private-reference-map-v1",
        "shots": {"ft-fl-test": {"path": "/private/ref.jpg", "clearedForProviderSubmission": True}}
    }))
    refs = mod.load_reference_map(path)
    assert refs["ft-fl-test"]["clearedForProviderSubmission"] is True

print("FINITE TIME OpenAI generator guardrails: PASS")
