#!/usr/bin/env python3
"""Fail closed around every executable paid/provider workflow.

Consumed one-time workflows are intentionally absent. Only the exact marker
workflows listed below may bind the paid environment or provider credentials.
All other workflows are scanned by YAML scope so path filters and test fixtures
cannot be confused with executable dispatch, environment, or secret bindings.
"""
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path

AUTHORIZED_MARKER_WORKFLOWS = {
    Path(".github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml"):
        "authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json",
    Path(".github/workflows/one-time-before-rest-world-proof.yml"):
        "authorizations/execute-before-rest-world-proof-20260731.json",
    Path(".github/workflows/one-time-before-rest-world-repair.yml"):
        "authorizations/execute-before-rest-world-repair-20260731.json",
}

# Historical promotion evidence does not authorize an executable promotion path.
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
PROVIDER_MODE_KEYS = {"ASSET_RENDERER_MODE"}
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

KEY_PATTERN = re.compile(
    r"^(?:-\s+)?(?P<key>\"(?:[^\"\\]|\\.)*\"|'(?:[^']|'')*'|[A-Za-z0-9_.-]+)\s*:\s*(?P<value>.*)$"
)
BLOCK_SCALAR_PATTERN = re.compile(r"[|>](?:(?:[+-][1-9]?)|(?:[1-9][+-]?))?")
HEREDOC_PATTERN = re.compile(r"<<-?\s*['\"]?(?P<end>[A-Za-z_][A-Za-z0-9_]*)['\"]?")
SECRET_EXPRESSION_PATTERN = re.compile(
    r"\$\{\{\s*secrets\s*(?:\.\s*(?:OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER)"
    r"|\[\s*['\"]\s*(?:OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER)\s*['\"]\s*\])\s*\}\}",
    re.IGNORECASE,
)
SHELL_ASSIGNMENT_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])(?P<key>OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER|"
    r"ASSET_RENDERER_MODE|ASSET_FORGE_PAID_RUN_AUTHORIZED|ASSET_FORGE_REQUIRE_PROVIDER|"
    r"ASSET_QUALITY_REQUIRE_PROVIDER)\s*=\s*(?P<value>[^\s;]+)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class YamlRecord:
    path: tuple[str, ...]
    value: str | None
    line: int
    block: str | None = None


def _strip_yaml_comment(line: str) -> str:
    single = False
    double = False
    escaped = False
    output: list[str] = []
    for index, character in enumerate(line):
        if escaped:
            output.append(character)
            escaped = False
            continue
        if character == "\\" and double:
            output.append(character)
            escaped = True
            continue
        if character == "'" and not double:
            if single and index + 1 < len(line) and line[index + 1] == "'":
                output.append(character)
                continue
            single = not single
            output.append(character)
            continue
        if character == '"' and not single:
            double = not double
            output.append(character)
            continue
        if character == "#" and not single and not double:
            break
        output.append(character)
    return "".join(output)


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1].replace("''", "'")
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1]
    return value


def parse_workflow_yaml(text: str) -> list[YamlRecord]:
    lines = text.splitlines()
    records: list[YamlRecord] = []
    stack: list[tuple[int, str]] = []
    index = 0

    while index < len(lines):
        raw = lines[index]
        leading = raw[: len(raw) - len(raw.lstrip(" \t"))]
        if "\t" in leading:
            raise ValueError(f"leading tab is not allowed at line {index + 1}")

        cleaned = _strip_yaml_comment(raw).rstrip()
        if not cleaned.strip() or cleaned.strip() in {"---", "..."}:
            index += 1
            continue

        indent = len(cleaned) - len(cleaned.lstrip(" "))
        match = KEY_PATTERN.match(cleaned[indent:])
        if not match:
            index += 1
            continue

        key = _unquote(match.group("key"))
        value = match.group("value").strip()
        while stack and stack[-1][0] >= indent:
            stack.pop()
        path = tuple(item[1] for item in stack) + (key,)

        if BLOCK_SCALAR_PATTERN.fullmatch(value):
            block_lines: list[str] = []
            cursor = index + 1
            while cursor < len(lines):
                candidate = lines[cursor]
                candidate_leading = candidate[: len(candidate) - len(candidate.lstrip(" \t"))]
                if "\t" in candidate_leading:
                    raise ValueError(f"leading tab is not allowed at line {cursor + 1}")
                if candidate.strip():
                    candidate_indent = len(candidate) - len(candidate.lstrip(" "))
                    if candidate_indent <= indent:
                        break
                    block_lines.append(candidate)
                else:
                    block_lines.append("")
                cursor += 1
            records.append(YamlRecord(path, None, index + 1, "\n".join(block_lines)))
            index = cursor
            continue

        if value == "":
            records.append(YamlRecord(path, None, index + 1))
            stack.append((indent, key))
        else:
            records.append(YamlRecord(path, _unquote(value), index + 1))
        index += 1

    return records


def _normalized(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", value.strip()).strip("'\"").lower()


def _is_explicit_false(value: str | None) -> bool:
    return _normalized(value) in {"0", "false", "no", "off", "offline", "local", "local-proof"}


def _lower_path(record: YamlRecord) -> tuple[str, ...]:
    return tuple(part.lower() for part in record.path)


def _is_job_environment(path: tuple[str, ...]) -> bool:
    if not path or path[0] != "jobs" or "steps" in path:
        return False
    return path[-1] == "environment" or (len(path) >= 2 and path[-2:] == ("environment", "name"))


def _iter_executable_shell_lines(block: str):
    heredoc_end: str | None = None
    for offset, raw in enumerate(block.splitlines(), 1):
        stripped = _strip_yaml_comment(raw).strip()
        if heredoc_end is not None:
            if stripped == heredoc_end:
                heredoc_end = None
            continue
        match = HEREDOC_PATTERN.search(stripped)
        if match:
            prefix = stripped[: match.start()].strip()
            if prefix:
                yield offset, prefix
            heredoc_end = match.group("end")
            continue
        if stripped:
            yield offset, stripped


def _legacy_dispatch_errors(relative: Path, line: int, text: str, label: str) -> list[str]:
    errors: list[str] = []
    lowered = text.lower()
    for event in sorted(LEGACY_DISPATCH_EVENTS):
        if event in lowered:
            errors.append(f"{relative.as_posix()}:{line}: {label} legacy paid dispatch event {event}")
    for workflow in sorted(LEGACY_DISPATCH_WORKFLOWS):
        if workflow in lowered:
            errors.append(f"{relative.as_posix()}:{line}: {label} legacy paid workflow dispatch target {workflow}")
    return errors


def inspect_workflow(
    relative: Path,
    text: str,
    *,
    allow_paid_environment: bool = False,
    allow_provider: bool = False,
) -> list[str]:
    try:
        records = parse_workflow_yaml(text)
    except ValueError as exc:
        return [f"{relative.as_posix()}: workflow YAML cannot be parsed safely: {exc}"]

    errors: list[str] = []
    for record in records:
        path = _lower_path(record)
        last = path[-1]
        value = record.value or ""
        normalized = _normalized(value)

        if record.block is None:
            if not allow_paid_environment and _is_job_environment(path) and "paid-asset-generation" in normalized:
                errors.append(f"{relative.as_posix()}:{record.line}: paid environment outside authorized workflow")

            under_env = "env" in path[:-1] and (path[0] == "jobs" or path[0] == "env")
            upper_key = record.path[-1].upper()
            if not allow_provider and under_env:
                if upper_key in PROVIDER_SECRET_KEYS:
                    errors.append(f"{relative.as_posix()}:{record.line}: provider secret key {upper_key} outside marker workflow")
                if SECRET_EXPRESSION_PATTERN.search(value):
                    errors.append(f"{relative.as_posix()}:{record.line}: provider secret expression outside marker workflow")
                if upper_key in PROVIDER_MODE_KEYS and normalized == "provider":
                    errors.append(f"{relative.as_posix()}:{record.line}: provider mode {upper_key}=provider outside marker workflow")
                if upper_key in PROVIDER_REQUIRED_KEYS and not _is_explicit_false(value):
                    errors.append(f"{relative.as_posix()}:{record.line}: paid/provider authorization {upper_key} outside marker workflow")

            if last == "env" and value and not allow_provider:
                compact = re.sub(r"\s+", "", value).upper()
                for key in sorted(PROVIDER_SECRET_KEYS):
                    if key in compact:
                        errors.append(f"{relative.as_posix()}:{record.line}: inline env map contains {key}")
                if "ASSET_RENDERER_MODE" in compact and "PROVIDER" in compact:
                    errors.append(f"{relative.as_posix()}:{record.line}: inline env map enables provider mode")
                for key in sorted(PROVIDER_REQUIRED_KEYS):
                    if key in compact:
                        errors.append(f"{relative.as_posix()}:{record.line}: inline env map contains {key}")

            if "with" in path and last == "event_type" and normalized in LEGACY_DISPATCH_EVENTS:
                errors.append(f"{relative.as_posix()}:{record.line}: legacy paid dispatch event {normalized}")
            if "with" in path and last == "workflow_id" and Path(normalized).name in LEGACY_DISPATCH_WORKFLOWS:
                errors.append(f"{relative.as_posix()}:{record.line}: legacy paid workflow dispatch target {Path(normalized).name}")
            continue

        if last == "run":
            for offset, shell_line in _iter_executable_shell_lines(record.block):
                line_number = record.line + offset
                if not allow_provider and SECRET_EXPRESSION_PATTERN.search(shell_line):
                    errors.append(f"{relative.as_posix()}:{line_number}: run block consumes provider secret outside marker workflow")
                if not allow_provider:
                    for match in SHELL_ASSIGNMENT_PATTERN.finditer(shell_line):
                        key = match.group("key").upper()
                        assigned = _normalized(match.group("value"))
                        if key in PROVIDER_SECRET_KEYS:
                            errors.append(f"{relative.as_posix()}:{line_number}: shell assigns provider secret {key} outside marker workflow")
                        elif key in PROVIDER_MODE_KEYS and assigned == "provider":
                            errors.append(f"{relative.as_posix()}:{line_number}: shell enables provider mode outside marker workflow")
                        elif key in PROVIDER_REQUIRED_KEYS and not _is_explicit_false(assigned):
                            errors.append(f"{relative.as_posix()}:{line_number}: shell enables paid/provider authorization {key}")
                errors.extend(_legacy_dispatch_errors(relative, line_number, shell_line, "shell dispatches"))
        elif last == "script" and "with" in path:
            for offset, script_line in enumerate(record.block.splitlines(), 1):
                errors.extend(_legacy_dispatch_errors(relative, record.line + offset, script_line, "script dispatches"))
                if not allow_provider and SECRET_EXPRESSION_PATTERN.search(script_line):
                    errors.append(f"{relative.as_posix()}:{record.line + offset}: script consumes provider secret outside marker workflow")

    return errors


def _trigger_records(records: list[YamlRecord]) -> set[str]:
    return {
        record.path[1].lower()
        for record in records
        if len(record.path) == 2 and record.path[0].lower() == "on"
    }


def _has_record(records: list[YamlRecord], expected_path: tuple[str, ...], contains: str | None = None) -> bool:
    expected = tuple(part.lower() for part in expected_path)
    for record in records:
        if _lower_path(record) != expected:
            continue
        if contains is None or contains.lower() in _normalized(record.value):
            return True
    return False


def validate_marker_workflow(relative: Path, text: str, marker_path: str) -> list[str]:
    try:
        records = parse_workflow_yaml(text)
    except ValueError as exc:
        return [f"authorized workflow YAML cannot be parsed safely: {relative.as_posix()}: {exc}"]

    errors: list[str] = []
    prefix = relative.as_posix()
    if marker_path not in text:
        errors.append(f"{prefix}: authorized marker path missing: {marker_path}")
    triggers = _trigger_records(records)
    if triggers != {"push"}:
        errors.append(f"{prefix}: authorized marker workflow trigger drift: {sorted(triggers)}")
    if not _has_record(records, ("on", "push", "branches"), "main"):
        errors.append(f"{prefix}: authorized marker workflow push is not restricted to main")
    if not _has_record(records, ("on", "push", "paths")):
        errors.append(f"{prefix}: authorized marker workflow is not path restricted")

    protected = any(
        _is_job_environment(_lower_path(record))
        and "paid-asset-generation" in _normalized(record.value)
        for record in records
        if record.block is None
    )
    if not protected:
        errors.append(f"{prefix}: authorized marker workflow lost protected paid environment")

    provider_bound = any(
        "env" in _lower_path(record)[:-1]
        and record.path[-1].upper() in PROVIDER_SECRET_KEYS
        and SECRET_EXPRESSION_PATTERN.search(record.value or "")
        for record in records
        if record.block is None
    )
    if not provider_bound:
        errors.append(f"{prefix}: authorized marker workflow lost explicit provider secret binding")

    errors.extend(
        inspect_workflow(
            relative,
            text,
            allow_paid_environment=True,
            allow_provider=True,
        )
    )
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

    authorized_paths = set(AUTHORIZED_MARKER_WORKFLOWS)
    for relative, marker_path in AUTHORIZED_MARKER_WORKFLOWS.items():
        path = root / relative
        if not path.is_file():
            errors.append(f"authorized marker workflow is missing: {relative.as_posix()}")
            continue
        errors.extend(validate_marker_workflow(relative, path.read_text(encoding="utf-8"), marker_path))

    if workflows.is_dir():
        for path in sorted((*workflows.glob("*.yml"), *workflows.glob("*.yaml"))):
            relative = path.relative_to(root)
            if relative in authorized_paths:
                continue
            errors.extend(inspect_workflow(relative, path.read_text(encoding="utf-8")))

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail closed unless every executable paid/provider path matches an exact marker authority."
    )
    parser.add_argument("--root", default=".", help="repository root")
    args = parser.parse_args()
    errors = inspect(Path(args.root))
    if errors:
        for error in errors:
            print(f"FAIL paid workflow boundary: {error}")
        return 1
    print("PASS paid workflow boundary: executable paid paths match exact marker authorities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
