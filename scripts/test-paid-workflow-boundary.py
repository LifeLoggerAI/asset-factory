#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MODULE_PATH = SCRIPT_DIR / "check-paid-workflow-boundary.py"
spec = importlib.util.spec_from_file_location("check_paid_workflow_boundary", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

MARKER_TEXT = """name: Authorized Marker
on:
  push:
    branches: [main]
    paths:
      - {marker}
jobs:
  execute:
    environment: paid-asset-generation
    env:
      OPENAI_API_KEY: ${{{{ secrets.OPENAI_API_KEY }}}}
      ASSET_RENDERER_MODE: provider
      ASSET_FORGE_PAID_RUN_AUTHORIZED: '1'
    steps:
      - run: echo authorized
"""


def make_root() -> Path:
    root = Path(tempfile.mkdtemp(prefix="paid-workflow-boundary-"))
    for relative, marker in module.AUTHORIZED_MARKER_WORKFLOWS.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(MARKER_TEXT.format(marker=marker), encoding="utf-8")
    return root


def write_workflow(root: Path, name: str, text: str) -> Path:
    path = root / ".github/workflows" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def test_clean_authorized_repository_passes() -> None:
    root = make_root()
    assert module.inspect(root) == []


def test_active_authorities_are_exact() -> None:
    expected = {
        ".github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml":
            "authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json",
        ".github/workflows/one-time-before-rest-world-proof.yml":
            "authorizations/execute-before-rest-world-proof-20260731.json",
        ".github/workflows/one-time-before-rest-world-repair.yml":
            "authorizations/execute-before-rest-world-repair-20260731.json",
    }
    assert {path.as_posix(): marker for path, marker in module.AUTHORIZED_MARKER_WORKFLOWS.items()} == expected
    assert module.AUTHORIZED_PROMOTION_WORKFLOWS == {}


def test_known_legacy_workflow_is_rejected() -> None:
    root = make_root()
    legacy = root / module.LEGACY_PAID_WORKFLOWS[0]
    legacy.write_text("name: legacy\n", encoding="utf-8")
    assert any("legacy paid workflow remains active" in error for error in module.inspect(root))


def test_consumed_workflow_is_rejected() -> None:
    root = make_root()
    consumed = root / module.CONSUMED_WORKFLOWS[0]
    consumed.write_text("name: consumed\n", encoding="utf-8")
    assert any("consumed one-time workflow remains executable" in error for error in module.inspect(root))


def test_unknown_paid_workflow_is_rejected() -> None:
    root = make_root()
    write_workflow(root, "unknown-paid.yml", """name: Unknown paid
on: workflow_dispatch
jobs:
  paid:
    environment: paid-asset-generation
    env:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
""")
    errors = module.inspect(root)
    assert any("paid environment outside authorized workflow" in error for error in errors)
    assert any("provider secret key OPENAI_API_KEY" in error for error in errors)


def test_marker_trigger_drift_is_rejected() -> None:
    root = make_root()
    relative, marker = next(iter(module.AUTHORIZED_MARKER_WORKFLOWS.items()))
    (root / relative).write_text(
        MARKER_TEXT.format(marker=marker).replace("  push:\n", "  workflow_dispatch:\n  push:\n"),
        encoding="utf-8",
    )
    assert any("trigger drift" in error for error in module.inspect(root))


def test_marker_path_drift_is_rejected() -> None:
    root = make_root()
    relative, marker = next(iter(module.AUTHORIZED_MARKER_WORKFLOWS.items()))
    (root / relative).write_text(MARKER_TEXT.format(marker="authorizations/wrong.json"), encoding="utf-8")
    errors = module.inspect(root)
    assert any(marker in error and "authorized marker path missing" in error for error in errors)


def test_marker_branch_drift_is_rejected() -> None:
    root = make_root()
    relative, marker = next(iter(module.AUTHORIZED_MARKER_WORKFLOWS.items()))
    (root / relative).write_text(
        MARKER_TEXT.format(marker=marker).replace("branches: [main]", "branches: [dev]"),
        encoding="utf-8",
    )
    assert any("push is not restricted to main" in error for error in module.inspect(root))


def test_marker_without_paid_environment_is_rejected() -> None:
    root = make_root()
    relative, marker = next(iter(module.AUTHORIZED_MARKER_WORKFLOWS.items()))
    (root / relative).write_text(
        MARKER_TEXT.format(marker=marker).replace("    environment: paid-asset-generation\n", ""),
        encoding="utf-8",
    )
    assert any("lost protected paid environment" in error for error in module.inspect(root))


def test_marker_without_provider_secret_is_rejected() -> None:
    root = make_root()
    relative, marker = next(iter(module.AUTHORIZED_MARKER_WORKFLOWS.items()))
    (root / relative).write_text(
        MARKER_TEXT.format(marker=marker).replace("      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}\n", ""),
        encoding="utf-8",
    )
    assert any("lost explicit provider secret binding" in error for error in module.inspect(root))


def test_multiline_environment_and_quoted_secret_key_are_rejected() -> None:
    root = make_root()
    write_workflow(root, "multiline-paid-path.yml", """name: Multiline paid path
on: workflow_dispatch
jobs:
  paid:
    environment:
      name: paid-asset-generation
    env:
      "OPENAI_API_KEY": "${{ secrets.OPENAI_API_KEY }}"
""")
    errors = module.inspect(root)
    assert any("paid environment outside authorized workflow" in error for error in errors)
    assert any("provider secret expression outside marker workflow" in error for error in errors)


def test_inline_environment_map_is_rejected() -> None:
    root = make_root()
    write_workflow(root, "inline-environment.yml", """name: Inline paid environment
on: workflow_dispatch
jobs:
  paid:
    environment: { name: paid-asset-generation }
""")
    assert any("paid environment outside authorized workflow" in error for error in module.inspect(root))


def test_inline_shell_assignments_are_rejected() -> None:
    root = make_root()
    write_workflow(root, "inline-shell-paid-path.yml", """name: Inline shell paid path
on: workflow_dispatch
jobs:
  paid:
    steps:
      - run: |
          ASSET_FORGE_PAID_RUN_AUTHORIZED=1 ASSET_RENDERER_MODE=provider python3 forge.py
""")
    errors = module.inspect(root)
    assert any("shell enables paid/provider authorization" in error for error in errors)
    assert any("shell enables provider mode" in error for error in errors)


def test_exported_provider_secret_is_rejected() -> None:
    root = make_root()
    write_workflow(root, "exported-secret.yml", """name: Exported provider secret
on: workflow_dispatch
jobs:
  paid:
    steps:
      - run: |
          export ASSET_RENDERER_API_KEY=placeholder
          python3 forge.py
""")
    assert any("shell assigns provider secret ASSET_RENDERER_API_KEY" in error for error in module.inspect(root))


def test_legacy_dispatcher_is_rejected() -> None:
    root = make_root()
    write_workflow(root, "new-paid-dispatcher.yml", """name: New paid dispatcher
on: workflow_dispatch
jobs:
  dispatch:
    steps:
      - run: |
          echo urai-version-forge-requested
          echo canonical-version-forge.yml
""")
    errors = module.inspect(root)
    assert any("legacy paid dispatch event" in error for error in errors)
    assert any("legacy paid workflow dispatch target" in error for error in errors)


def test_ambiguous_leading_tabs_fail_closed() -> None:
    root = make_root()
    write_workflow(root, "tabbed.yml", "name: Tabbed\njobs:\n\tpaid:\n    environment: paid-asset-generation\n")
    assert any("cannot be parsed safely" in error for error in module.inspect(root))


def main() -> int:
    test_clean_authorized_repository_passes()
    test_active_authorities_are_exact()
    test_known_legacy_workflow_is_rejected()
    test_consumed_workflow_is_rejected()
    test_unknown_paid_workflow_is_rejected()
    test_marker_trigger_drift_is_rejected()
    test_marker_path_drift_is_rejected()
    test_marker_branch_drift_is_rejected()
    test_marker_without_paid_environment_is_rejected()
    test_marker_without_provider_secret_is_rejected()
    test_multiline_environment_and_quoted_secret_key_are_rejected()
    test_inline_environment_map_is_rejected()
    test_inline_shell_assignments_are_rejected()
    test_exported_provider_secret_is_rejected()
    test_legacy_dispatcher_is_rejected()
    test_ambiguous_leading_tabs_fail_closed()
    print("PASS paid workflow boundary regressions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
