#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "generate_finite_time_openai_video.py"
spec = importlib.util.spec_from_file_location("finite_time_video", MODULE_PATH)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

assert mod.choose_duration(4) == 4
assert mod.choose_duration(5) == 8
assert mod.choose_duration(8) == 8
assert mod.choose_duration(9) == 12
assert mod.choose_duration(12) == 12

shot = {
    "id": "ft-fl-test",
    "title": "Continuity test",
    "visual": "A person crosses a lived-in room.",
    "audioDescription": "A person crosses the room."
}
prompt = mod.build_prompt(shot, 6)
assert "Photoreal memory-realism" in prompt
assert "no logos" in prompt
assert "without inventing facts" in prompt

with tempfile.TemporaryDirectory() as tmp:
    path = Path(tmp) / "refs.json"
    path.write_text(json.dumps({
        "schemaVersion": "finite-time-private-reference-map-v1",
        "shots": {"ft-fl-test": {"path": "/private/ref.jpg", "clearedForProviderSubmission": True}}
    }))
    refs = mod.load_reference_map(path)
    assert refs["ft-fl-test"]["clearedForProviderSubmission"] is True

print("FINITE TIME OpenAI generator guardrails: PASS")
