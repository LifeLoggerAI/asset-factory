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


def write_workflow(root: Path, name: str, text: str) -> Path:
    path = root / ".github/workflows" / name
    path.write_text(text, encoding="utf-8")
    return path


def test_clean_marker_only_repository_passes() -> None:
    root = make_root()
    assert module.inspect(root) == []


def test_known_legacy_workflow_is_rejected() -> None:
    root = make_root()
    legacy = root / module.LEGACY_PAID_WORKFLOWS[0]
    legacy.write_text("name: legacy\n", encoding="utf-8")
    errors = module.inspect(root)
    assert any("legacy paid workflow remains active" in error for error in errors)


def test_multiline_environment_and_quoted_secret_key_are_rejected() -> None:
    root = make_root()
    write_workflow(
        root,
        "multiline-paid-path.yml",
        """name: Multiline paid path
on: workflow_dispatch
jobs:
  paid:
    environment:
      name: paid-asset-generation
    env:
      "OPENAI_API_KEY": "${{ secrets.OPENAI_API_KEY }}"
    steps:
      - run: echo should-not-run
""",
    )
    errors = module.inspect(root)
    assert any("mapped paid environment" in error for error in errors)
    assert any("provider secret key OPENAI_API_KEY" in error for error in errors)


def test_inline_environment_map_is_rejected() -> None:
    root = make_root()
    write_workflow(
        root,
        "inline-environment.yml",
        """name: Inline paid environment
on: workflow_dispatch
jobs:
  paid:
    environment: { name: paid-asset-generation }
    steps:
      - run: echo should-not-run
""",
    )
    errors = module.inspect(root)
    assert any("inline paid environment" in error or "paid environment" in error for error in errors)


def test_inline_shell_assignments_are_rejected() -> None:
    root = make_root()
    write_workflow(
        root,
        "inline-shell-paid-path.yml",
        """name: Inline shell paid path
on: workflow_dispatch
jobs:
  paid:
    steps:
      - run: |
          ASSET_FORGE_PAID_RUN_AUTHORIZED=1 ASSET_RENDERER_MODE=provider python3 forge.py
""",
    )
    errors = module.inspect(root)
    assert any("shell enables paid/provider authorization" in error for error in errors)
    assert any("shell enables provider mode" in error for error in errors)


def test_exported_provider_secret_is_rejected() -> None:
    root = make_root()
    write_workflow(
        root,
        "exported-secret.yml",
        """name: Exported provider secret
on: workflow_dispatch
jobs:
  paid:
    steps:
      - run: |
          export ASSET_RENDERER_API_KEY=placeholder
          python3 forge.py
""",
    )
    errors = module.inspect(root)
    assert any("shell assigns provider secret ASSET_RENDERER_API_KEY" in error for error in errors)


def test_differently_named_paid_dispatcher_is_rejected() -> None:
    root = make_root()
    write_workflow(
        root,
        "new-paid-dispatcher.yml",
        """name: New paid dispatcher
on: workflow_dispatch
jobs:
  dispatch:
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            await github.rest.repos.createDispatchEvent({
              event_type: 'urai-version-forge-requested'
            });
            await github.rest.actions.createWorkflowDispatch({
              workflow_id: 'canonical-version-forge.yml'
            });
""",
    )
    errors = module.inspect(root)
    assert any("legacy paid event" in error for error in errors)
    assert any("legacy paid workflow" in error for error in errors)


def test_marker_workflow_rejects_manual_or_repository_dispatch() -> None:
    root = make_root()
    allowed = root / module.ALLOWED_PAID_WORKFLOW
    allowed.write_text(ALLOWED_TEXT.replace("  push:\n", "  workflow_dispatch:\n  push:\n"), encoding="utf-8")
    errors = module.inspect(root)
    assert any("forbidden alternate trigger workflow_dispatch" in error for error in errors)


def test_ambiguous_leading_tabs_fail_closed() -> None:
    root = make_root()
    write_workflow(
        root,
        "tabbed.yml",
        "name: Tabbed\njobs:\n\tpaid:\n    environment: paid-asset-generation\n",
    )
    errors = module.inspect(root)
    assert any("cannot be parsed safely" in error for error in errors)


def main() -> int:
    test_clean_marker_only_repository_passes()
    test_known_legacy_workflow_is_rejected()
    test_multiline_environment_and_quoted_secret_key_are_rejected()
    test_inline_environment_map_is_rejected()
    test_inline_shell_assignments_are_rejected()
    test_exported_provider_secret_is_rejected()
    test_differently_named_paid_dispatcher_is_rejected()
    test_marker_workflow_rejects_manual_or_repository_dispatch()
    test_ambiguous_leading_tabs_fail_closed()
    print("PASS paid workflow boundary regressions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
