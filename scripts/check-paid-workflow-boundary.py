#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

ALLOWED_PAID_WORKFLOW = Path(
    ".github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml"
)
MARKER_PATH = "authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json"
LEGACY_PAID_WORKFLOWS = (
    Path(".github/workflows/v1-forge-trigger.yml"),
    Path(".github/workflows/v1-aaa-asset-forge.yml"),
    Path(".github/workflows/patch-and-run-v1-forge.yml"),
    Path(".github/workflows/canonical-version-forge.yml"),
    Path(".github/workflows/owner-issue-one-paid-v1-smoke.yml"),
    Path(".github/workflows/versioned-aaa-asset-forge.yml"),
    Path(".github/workflows/v2-living-state-forge.yml"),
    Path(".github/workflows/final-v1-avatar-extension.yml"),
    Path(".github/workflows/dispatch-one-paid-v1-smoke.yml"),
)

ACTIVE_PAID_PATTERNS = (
    re.compile(r"^\s*environment:\s*paid-asset-generation\s*(?:#.*)?$"),
    re.compile(
        r"^\s*OPENAI_API_KEY:\s*\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}\s*(?:#.*)?$"
    ),
    re.compile(r"^\s*ASSET_FORGE_PAID_RUN_AUTHORIZED:\s*['\"]?1['\"]?\s*(?:#.*)?$"),
    re.compile(r"^\s*ASSET_RENDERER_MODE:\s*provider\s*(?:#.*)?$"),
)

FORBIDDEN_ALLOWED_TRIGGERS = (
    "workflow_dispatch:",
    "repository_dispatch:",
    "issues:",
)


def inspect(root: Path) -> list[str]:
    errors: list[str] = []
    root = root.resolve()
    workflows = root / ".github" / "workflows"

    for relative in LEGACY_PAID_WORKFLOWS:
        if (root / relative).exists():
            errors.append(f"legacy paid workflow remains active: {relative.as_posix()}")

    allowed = root / ALLOWED_PAID_WORKFLOW
    if not allowed.is_file():
        errors.append(f"authorized marker workflow is missing: {ALLOWED_PAID_WORKFLOW.as_posix()}")
        allowed_text = ""
    else:
        allowed_text = allowed.read_text(encoding="utf-8")
        if MARKER_PATH not in allowed_text:
            errors.append("authorized paid workflow is not bound to the canonical v3 marker path")
        if "push:" not in allowed_text or "branches: [main]" not in allowed_text:
            errors.append("authorized paid workflow must be a protected-main marker push workflow")
        for trigger in FORBIDDEN_ALLOWED_TRIGGERS:
            if trigger in allowed_text:
                errors.append(
                    f"authorized paid workflow exposes forbidden alternate trigger {trigger.rstrip(':')}"
                )

    if workflows.is_dir():
        for path in sorted((*workflows.glob("*.yml"), *workflows.glob("*.yaml"))):
            relative = path.relative_to(root)
            if relative == ALLOWED_PAID_WORKFLOW:
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if any(pattern.match(line) for pattern in ACTIVE_PAID_PATTERNS):
                    errors.append(
                        f"paid execution configuration outside marker workflow: "
                        f"{relative.as_posix()}:{number}: {line.strip()}"
                    )

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail closed unless the v3 marker workflow is the sole active paid generation path."
    )
    parser.add_argument("--root", default=".", help="repository root")
    args = parser.parse_args()

    errors = inspect(Path(args.root))
    if errors:
        for error in errors:
            print(f"FAIL paid workflow boundary: {error}")
        return 1

    print("PASS paid workflow boundary: v3 marker is the sole active paid generation path")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
