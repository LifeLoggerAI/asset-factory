#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("validate_v1_safe_resume_v3_marker.py")
spec = importlib.util.spec_from_file_location("validate_v1_safe_resume_v3_marker", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

PARENT = "a" * 40


def write_marker(root: Path, payload: dict) -> Path:
    path = root / module.MARKER_PATH.name
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def assert_rejected(payload: dict, expected_fragment: str) -> None:
    with tempfile.TemporaryDirectory() as directory:
        path = write_marker(Path(directory), payload)
        try:
            module.validate_marker(path, PARENT)
        except (ValueError, FileNotFoundError) as exc:
            assert expected_fragment in str(exc), str(exc)
        else:
            raise AssertionError("noncanonical authorization marker was accepted")


def main() -> int:
    expected = module.expected_marker(PARENT)
    with tempfile.TemporaryDirectory() as directory:
        path = write_marker(Path(directory), expected)
        assert module.validate_marker(path, PARENT) == expected

    changed = dict(expected)
    changed["provider"] = "custom"
    assert_rejected(changed, "canonical paid boundary")

    changed = dict(expected)
    changed["endpoint"] = "https://example.invalid/render"
    assert_rejected(changed, "canonical paid boundary")

    changed = dict(expected)
    changed["opaqueModel"] = "unapproved-model"
    assert_rejected(changed, "canonical paid boundary")

    changed = dict(expected)
    changed["alphaModel"] = "unapproved-alpha-model"
    assert_rejected(changed, "canonical paid boundary")

    changed = dict(expected)
    changed["expectedParentSha"] = "b" * 40
    assert_rejected(changed, "canonical paid boundary")

    changed = dict(expected)
    changed["extra"] = True
    assert_rejected(changed, "canonical paid boundary")

    assert module.PROVIDER == "openai"
    assert module.ENDPOINT == "https://api.openai.com/v1/images/generations"
    assert module.OPAQUE_MODEL == "gpt-image-2"
    assert module.ALPHA_MODEL == "gpt-image-1.5"
    print("PASS canonical V1 safe-resume v3 authorization marker")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
