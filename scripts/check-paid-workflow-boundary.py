#!/usr/bin/env python3
"""Fail closed around every executable paid/provider workflow.

Consumed one-time workflows are intentionally absent. Only the marker workflows
listed below may use the paid environment or provider credentials. Every other
workflow is scanned as an untrusted path.
"""
from __future__ import annotations

import argparse
import re
import shlex
from pathlib import Path

AUTHORIZED_MARKER_WORKFLOWS = {
    Path(".github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml"):
        "authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json",
    Path(".github/workflows/one-time-before-rest-world-proof.yml"):
        "authorizations/execute-before-rest-world-proof-20260731.json",
    Path(".github/workflows/one-time-before-rest-world-repair.yml"):
        "authorizations/execute-before-rest-world-repair-20260731.json",
}

# No executable promotion workflow remains authorized. Historical promotion
# runs and receipts are immutable evidence, not permission to keep a trigger.
AUTHORIZED_PROMOTION_WORKFLOWS: dict[Path, str] = {}

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
    Path(".github/workflows/dispatch-canonical-v2-v5-wave.yml"),
    Path(".github/workflows/rerun-v1-now.yml"),
    Path(".github/workflows/rerun-v2-now.yml"),
    Path(".github/workflows/rerun-v3-now.yml"),
    Path(".github/workflows/v1-checkpoint-finalize.yml"),
    Path(".github/workflows/v1-promote-finalized-checkpoint.yml"),
)

CONSUMED_WORKFLOWS = (
    Path(".github/workflows/one-time-v2-v5-exact-paid-generation.yml"),
    Path(".github/workflows/one-time-v4-exact-five-recovery.yml"),
    Path(".github/workflows/one-time-v2-v5-exact-paid-promotion.yml"),
    Path(".github/workflows/one-time-promote-recovered-v2-v5-assets.yml"),
    Path(".github/workflows/one-time-promote-exact-v2-assets.yml"),
)

PROVIDER_SECRET_KEYS = {
    "OPENAI_API_KEY",
    "ASSET_RENDERER_API_KEY",
    "ASSET_RENDERER_AUTH_HEADER",
}
PROVIDER_REQUIRED_KEYS = {
    "ASSET_FORGE_PAID_RUN_AUTHORIZED",
    "ASSET_FORGE_REQUIRE_PROVIDER",
    "ASSET_QUALITY_REQUIRE_PROVIDER",
}
LEGACY_DISPATCH_EVENTS = {"urai-v1-forge-requested", "urai-version-forge-requested"}
LEGACY_DISPATCH_WORKFLOWS = {
    "canonical-version-forge.yml",
    "v1-aaa-asset-forge.yml",
    "versioned-aaa-asset-forge.yml",
    "v1-checkpoint-finalize.yml",
    "v1-promote-finalized-checkpoint.yml",
}

SECRET_EXPRESSION_PATTERN = re.compile(
    r"\$\{\{\s*secrets\s*(?:\.\s*(?:OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER)|"
    r"\[\s*['\"]\s*(?:OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER)\s*['\"]\s*\])\s*\}\}",
    re.IGNORECASE,
)
ENV_ASSIGNMENT_PATTERN = re.compile(
    r"^\s*(?P<key>OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER|"
    r"ASSET_RENDERER_MODE|ASSET_FORGE_PAID_RUN_AUTHORIZED|ASSET_FORGE_REQUIRE_PROVIDER|"
    r"ASSET_QUALITY_REQUIRE_PROVIDER)\s*:\s*(?P<value>.*?)\s*$",
    re.IGNORECASE,
)
SHELL_ASSIGNMENT_PATTERN = re.compile(
    r"(?:^|\s)(?P<key>OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER|"
    r"ASSET_RENDERER_MODE|ASSET_FORGE_PAID_RUN_AUTHORIZED|ASSET_FORGE_REQUIRE_PROVIDER|"
    r"ASSET_QUALITY_REQUIRE_PROVIDER)=(?P<value>[^\s;]+)",
    re.IGNORECASE,
)


def _strip_comments(line: str) -> str:
    single = False
    double = False
    escaped = False
    output: list[str] = []
    for character in line:
        if escaped:
            output.append(character)
            escaped = False
            continue
        if character == "\\" and double:
            output.append(character)
            escaped = True
            continue
        if character == "'" and not double:
            single = not single
        elif character == '"' and not single:
            double = not double
        elif character == "#" and not single and not double:
            break
        output.append(character)
    return "".join(output)


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).strip("'\"").lower()


def _explicit_false(value: str) -> bool:
    return _normalized(value) in {"0", "false", "no", "off", "offline", "local", "local-proof", ""}


def _line_error(relative: Path, line: int, message: str) -> str:
    return f"{relative.as_posix()}:{line}: {message}"


def inspect_workflow(
    relative: Path,
    text: str,
    *,
    allow_paid_environment: bool = False,
    allow_provider: bool = False,
) -> list[str]:
    errors: list[str] = []
    for number, raw in enumerate(text.splitlines(), 1):
        leading = raw[: len(raw) - len(raw.lstrip(" \t"))]
        if "\t" in leading:
            errors.append(_line_error(relative, number, "workflow YAML cannot be parsed safely: leading tab"))
            continue
        line = _strip_comments(raw)
        compact = re.sub(r"\s+", "", line.lower())
        normalized = _normalized(line)

        if not allow_paid_environment and "paid-asset-generation" in compact:
            errors.append(_line_error(relative, number, "paid environment outside authorized workflow"))

        match = ENV_ASSIGNMENT_PATTERN.match(line)
        if match and not allow_provider:
            key = match.group("key").upper()
            value = match.group("value")
            if key in PROVIDER_SECRET_KEYS:
                errors.append(_line_error(relative, number, f"provider secret key {key} outside marker workflow"))
            elif key == "ASSET_RENDERER_MODE" and _normalized(value) == "provider":
                errors.append(_line_error(relative, number, "provider mode ASSET_RENDERER_MODE=provider outside marker workflow"))
            elif key in PROVIDER_REQUIRED_KEYS and not _explicit_false(value):
                errors.append(_line_error(relative, number, f"paid/provider authorization {key} outside marker workflow"))

        if not allow_provider and SECRET_EXPRESSION_PATTERN.search(line):
            errors.append(_line_error(relative, number, "provider secret expression outside marker workflow"))

        if not allow_provider:
            try:
                shell_line = " ".join(shlex.split(line, comments=False, posix=True))
            except ValueError:
                shell_line = line
            for assignment in SHELL_ASSIGNMENT_PATTERN.finditer(shell_line):
                key = assignment.group("key").upper()
                value = assignment.group("value")
                if key in PROVIDER_SECRET_KEYS:
                    errors.append(_line_error(relative, number, f"shell assigns provider secret {key} outside marker workflow"))
                elif key == "ASSET_RENDERER_MODE" and _normalized(value) == "provider":
                    errors.append(_line_error(relative, number, "shell enables provider mode outside marker workflow"))
                elif key in PROVIDER_REQUIRED_KEYS and not _explicit_false(value):
                    errors.append(_line_error(relative, number, f"shell enables paid/provider authorization {key}"))

        for event in LEGACY_DISPATCH_EVENTS:
            if event in normalized:
                errors.append(_line_error(relative, number, f"legacy paid dispatch event {event}"))
        for workflow in LEGACY_DISPATCH_WORKFLOWS:
            if workflow in normalized:
                errors.append(_line_error(relative, number, f"legacy paid workflow dispatch target {workflow}"))

    return errors


def _top_level_on_block(text: str) -> str:
    lines = text.splitlines()
    collected: list[str] = []
    in_on = False
    for line in lines:
        if re.match(r"^on\s*:\s*$", line):
            in_on = True
            collected.append(line)
            continue
        if in_on:
            if line and not line.startswith((" ", "\t")):
                break
            collected.append(line)
    return "\n".join(collected)


def validate_marker_workflow(relative: Path, text: str, marker_path: str) -> list[str]:
    errors = inspect_workflow(relative, text, allow_paid_environment=True, allow_provider=True)
    prefix = relative.as_posix()
    on_block = _top_level_on_block(text)

    if text.count(marker_path) < 1:
        errors.append(f"{prefix}: authorized marker path missing: {marker_path}")
    if not re.search(r"(?m)^\s{2}push\s*:\s*$", on_block):
        errors.append(f"{prefix}: authorized marker workflow trigger drift: push missing")
    for forbidden in ("workflow_dispatch", "pull_request", "schedule", "workflow_run", "repository_dispatch"):
        if re.search(rf"(?m)^\s{{2}}{re.escape(forbidden)}\s*:", on_block):
            errors.append(f"{prefix}: authorized marker workflow trigger drift: {forbidden}")
    if not re.search(r"(?m)^\s+branches\s*:\s*\[?\s*main\s*\]?\s*$", on_block):
        errors.append(f"{prefix}: authorized marker workflow push is not restricted to main")
    if not re.search(r"(?m)^\s+paths\s*:\s*$", on_block):
        errors.append(f"{prefix}: authorized marker workflow is not path restricted")
    if marker_path not in on_block:
        errors.append(f"{prefix}: authorization marker is not the push path restriction: {marker_path}")
    if "paid-asset-generation" not in text:
        errors.append(f"{prefix}: authorized marker workflow lost protected paid environment")
    if not SECRET_EXPRESSION_PATTERN.search(text):
        errors.append(f"{prefix}: authorized marker workflow lost explicit provider secret binding")
    return errors


def validate_promotion_workflow(relative: Path, text: str, source_workflow: str) -> list[str]:
    # Retained for compatibility with the regression harness. No live promotion
    # workflow is currently listed in AUTHORIZED_PROMOTION_WORKFLOWS.
    errors = inspect_workflow(relative, text, allow_paid_environment=True, allow_provider=False)
    on_block = _top_level_on_block(text)
    if not re.search(r"(?m)^\s{2}workflow_run\s*:\s*$", on_block):
        errors.append(f"{relative.as_posix()}: authorized promotion workflow trigger drift")
    if source_workflow not in on_block:
        errors.append(f"{relative.as_posix()}: authorized promotion workflow source drift: {source_workflow}")
    if "completed" not in on_block:
        errors.append(f"{relative.as_posix()}: authorized promotion workflow must wait for completed source run")
    return errors


def inspect(root: Path) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    workflows = root / ".github" / "workflows"

    for relative in LEGACY_PAID_WORKFLOWS:
        if (root / relative).exists():
            errors.append(f"legacy paid workflow remains active: {relative.as_posix()}")
    for relative in CONSUMED_WORKFLOWS:
        if (root / relative).exists():
            errors.append(f"consumed one-time workflow remains executable: {relative.as_posix()}")

    authorized_paths = set(AUTHORIZED_MARKER_WORKFLOWS) | set(AUTHORIZED_PROMOTION_WORKFLOWS)
    for relative, marker_path in AUTHORIZED_MARKER_WORKFLOWS.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"authorized marker workflow is missing: {relative.as_posix()}")
            continue
        errors.extend(validate_marker_workflow(relative, path.read_text(encoding="utf-8"), marker_path))

    for relative, source_workflow in AUTHORIZED_PROMOTION_WORKFLOWS.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"authorized promotion workflow is missing: {relative.as_posix()}")
            continue
        errors.extend(validate_promotion_workflow(relative, path.read_text(encoding="utf-8"), source_workflow))

    if workflows.is_dir():
        for path in sorted((*workflows.glob("*.yml"), *workflows.glob("*.yaml"))):
            relative = path.relative_to(root)
            if relative in authorized_paths:
                continue
            errors.extend(inspect_workflow(relative, path.read_text(encoding="utf-8")))

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail closed unless every paid generation path matches an explicit one-marker authority contract."
    )
    parser.add_argument("--root", default=".", help="repository root")
    args = parser.parse_args()
    errors = inspect(Path(args.root))
    if errors:
        for error in errors:
            print(f"FAIL paid workflow boundary: {error}")
        return 1
    print("PASS paid workflow boundary: all paid paths match explicit authority contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
