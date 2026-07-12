#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MODULE_PATH = SCRIPT_DIR / "check-paid-workflow-boundary.py"
spec = importlib.util.spec_from_file_location("check_paid_workflow_boundary", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

ALLOWED_TEXT = """name: Safe Resume 3
on:
  push:
    branches: [main]
    paths:
      - authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json
jobs:
  execute:
    environment: paid-asset-generation
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      ASSET_FORGE_PAID_RUN_AUTHORIZED: '1'
    steps:
      - run: echo authorized
"""


def make_root() -> Path:
    root = Path(tempfile.mkdtemp(prefix="paid-workflow-boundary-"))
    allowed = root / module.ALLOWED_PAID_WORKFLOW
    allowed.parent.mkdir(parents=True, exist_ok=True)
    allowed.write_text(ALLOWED_TEXT, encoding="utf-8")
    return root


def test_clean_marker_only_repository_passes() -> None:
    root = make_root()
    assert module.inspect(root) == []


def test_known_legacy_workflow_is_rejected() -> None:
    root = make_root()
    legacy = root / module.LEGACY_PAID_WORKFLOWS[0]
    legacy.write_text("name: legacy\n", encoding="utf-8")
    errors = module.inspect(root)
    assert any("legacy paid workflow remains active" in error for error in errors)


def test_differently_named_paid_workflow_is_rejected() -> None:
    root = make_root()
    candidate = root / ".github/workflows/new-paid-path.yml"
    candidate.write_text(
        """name: New paid path
on: workflow_dispatch
jobs:
  paid:
    environment: paid-asset-generation
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      ASSET_RENDERER_MODE: provider
""",
        encoding="utf-8",
    )
    errors = module.inspect(root)
    assert any("new-paid-path.yml" in error for error in errors)
    assert any("paid execution configuration outside marker workflow" in error for error in errors)


def test_marker_workflow_rejects_manual_or_repository_dispatch() -> None:
    root = make_root()
    allowed = root / module.ALLOWED_PAID_WORKFLOW
    allowed.write_text(ALLOWED_TEXT.replace("  push:\n", "  workflow_dispatch:\n  push:\n"), encoding="utf-8")
    errors = module.inspect(root)
    assert any("forbidden alternate trigger workflow_dispatch" in error for error in errors)


def main() -> int:
    test_clean_marker_only_repository_passes()
    test_known_legacy_workflow_is_rejected()
    test_differently_named_paid_workflow_is_rejected()
    test_marker_workflow_rejects_manual_or_repository_dispatch()
    print("PASS paid workflow boundary regressions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
