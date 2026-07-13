#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shlex
from dataclasses import dataclass
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
    Path(".github/workflows/dispatch-canonical-v2-v5-wave.yml"),
    Path(".github/workflows/rerun-v1-now.yml"),
    Path(".github/workflows/rerun-v2-now.yml"),
    Path(".github/workflows/rerun-v3-now.yml"),
    Path(".github/workflows/v1-checkpoint-finalize.yml"),
    Path(".github/workflows/v1-promote-finalized-checkpoint.yml"),
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
ASSIGNMENT_PATTERN = re.compile(r"^(?P<key>[A-Za-z_][A-Za-z0-9_]*)=(?P<value>.*)$")
_PROVIDER_SECRET_NAME = r"(?:OPENAI_API_KEY|ASSET_RENDERER_API_KEY|ASSET_RENDERER_AUTH_HEADER)"
SECRET_EXPRESSION_PATTERN = re.compile(
    rf"\$\{{\{{\s*secrets\s*(?:\.\s*{_PROVIDER_SECRET_NAME}|\[\s*['\"]\s*{_PROVIDER_SECRET_NAME}\s*['\"]\s*\])\s*\}}\}}",
    re.IGNORECASE,
)
BLOCK_SCALAR_PATTERN = re.compile(r"[|>](?:(?:[+-][1-9]?)|(?:[1-9][+-]?))?")
DISPATCH_EVENT_PATTERN = re.compile(
    r"event_type\s*:\s*['\"]?(urai-(?:v1|version)-forge-requested)['\"]?",
    re.IGNORECASE,
)
DISPATCH_WORKFLOW_PATTERN = re.compile(
    r"workflow_id\s*:\s*['\"]?((?:canonical-version-forge|v1-aaa-asset-forge|versioned-aaa-asset-forge|v1-checkpoint-finalize|v1-promote-finalized-checkpoint)\.yml)['\"]?",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class YamlRecord:
    path: tuple[str, ...]
    value: str | None
    line: int
    block: bool = False


def _strip_yaml_comment(line: str) -> str:
    single = False
    double = False
    escaped = False
    index = 0
    while index < len(line):
        character = line[index]
        if escaped:
            escaped = False
            index += 1
            continue
        if character == "\\" and double:
            escaped = True
            index += 1
            continue
        if character == "'" and not double:
            if single and index + 1 < len(line) and line[index + 1] == "'":
                index += 2
                continue
            single = not single
            index += 1
            continue
        if character == '"' and not single:
            double = not double
            index += 1
            continue
        if character == "#" and not single and not double:
            return line[:index]
        index += 1
    return line


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1].replace("''", "'")
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1]
    return value


def parse_workflow_yaml(text: str) -> list[YamlRecord]:
    """Parse the workflow subset needed for fail-closed security decisions."""
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
                    block_lines.append(candidate[min(len(candidate), indent + 1) :])
                else:
                    block_lines.append("")
                cursor += 1
            records.append(YamlRecord(path, "\n".join(block_lines), index + 1, True))
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


def _shell_assignments(block: str) -> list[tuple[int, str, str]]:
    assignments: list[tuple[int, str, str]] = []
    for line_number, raw in enumerate(block.splitlines(), 1):
        line = _strip_yaml_comment(raw).strip()
        if not line:
            continue
        try:
            tokens = shlex.split(line, comments=False, posix=True)
        except ValueError:
            tokens = line.split()
        if not tokens:
            continue
        if tokens[0] == "export":
            tokens = tokens[1:]
        elif tokens[0] == "env":
            tokens = tokens[1:]
            while tokens and tokens[0].startswith("-"):
                tokens = tokens[1:]
        for token in tokens:
            match = ASSIGNMENT_PATTERN.match(token)
            if not match:
                break
            assignments.append((line_number, match.group("key"), match.group("value")))
    return assignments


def _record_error(relative: Path, record: YamlRecord, detail: str) -> str:
    return f"{relative.as_posix()}:{record.line}: {detail}"


def inspect_workflow(relative: Path, text: str) -> list[str]:
    try:
        records = parse_workflow_yaml(text)
    except ValueError as exc:
        return [f"{relative.as_posix()}: workflow YAML cannot be parsed safely: {exc}"]

    errors: list[str] = []
    for record in records:
        lowered_path = tuple(part.lower() for part in record.path)
        last = lowered_path[-1]
        value = record.value or ""
        normalized = _normalized(value)

        if last == "environment" and "paid-asset-generation" in normalized:
            errors.append(_record_error(relative, record, "paid environment outside marker workflow"))
        if len(lowered_path) >= 2 and lowered_path[-2:] == ("environment", "name") and "paid-asset-generation" in normalized:
            errors.append(_record_error(relative, record, "mapped paid environment outside marker workflow"))
        if last == "environment" and "paid-asset-generation" in re.sub(r"\s+", "", value.lower()):
            errors.append(_record_error(relative, record, "inline paid environment outside marker workflow"))

        under_env = "env" in lowered_path[:-1]
        upper_key = record.path[-1].upper()
        if under_env and upper_key in PROVIDER_SECRET_KEYS:
            errors.append(_record_error(relative, record, f"provider secret key {upper_key} outside marker workflow"))
        if under_env and upper_key in PROVIDER_MODE_KEYS and normalized == "provider":
            errors.append(_record_error(relative, record, f"provider mode {upper_key}=provider outside marker workflow"))
        if under_env and upper_key in PROVIDER_REQUIRED_KEYS and not _is_explicit_false(value):
            errors.append(_record_error(relative, record, f"paid/provider authorization {upper_key} outside marker workflow"))

        if not record.block and SECRET_EXPRESSION_PATTERN.search(value):
            errors.append(_record_error(relative, record, "provider secret expression outside marker workflow"))
        if last == "event_type" and normalized in LEGACY_DISPATCH_EVENTS:
            errors.append(_record_error(relative, record, f"legacy paid dispatch event {normalized}"))
        if last == "workflow_id" and Path(normalized).name in LEGACY_DISPATCH_WORKFLOWS:
            errors.append(_record_error(relative, record, f"legacy paid workflow dispatch target {normalized}"))

        if last == "run" and record.block:
            for offset, key, assigned_value in _shell_assignments(value):
                normalized_assignment = _normalized(assigned_value)
                if key in PROVIDER_SECRET_KEYS:
                    errors.append(
                        f"{relative.as_posix()}:{record.line + offset}: shell assigns provider secret {key} outside marker workflow"
                    )
                elif key in PROVIDER_MODE_KEYS and normalized_assignment == "provider":
                    errors.append(
                        f"{relative.as_posix()}:{record.line + offset}: shell enables provider mode outside marker workflow"
                    )
                elif key in PROVIDER_REQUIRED_KEYS and not _is_explicit_false(assigned_value):
                    errors.append(
                        f"{relative.as_posix()}:{record.line + offset}: shell enables paid/provider authorization {key}"
                    )

        if record.block:
            block_label = f"{last} block"
            if SECRET_EXPRESSION_PATTERN.search(value):
                errors.append(_record_error(relative, record, f"{block_label} consumes provider secret outside marker workflow"))
            for match in DISPATCH_EVENT_PATTERN.finditer(value):
                errors.append(_record_error(relative, record, f"{block_label} dispatches legacy paid event {match.group(1)}"))
            for match in DISPATCH_WORKFLOW_PATTERN.finditer(value):
                errors.append(_record_error(relative, record, f"{block_label} dispatches legacy paid workflow {match.group(1)}"))

        if last == "env" and value:
            compact = re.sub(r"\s+", "", value.lower())
            if "paid-asset-generation" in compact:
                errors.append(_record_error(relative, record, "inline env map contains paid environment"))
            for key in PROVIDER_SECRET_KEYS | PROVIDER_REQUIRED_KEYS:
                if key.lower() in compact:
                    errors.append(_record_error(relative, record, f"inline env map contains {key}"))
            if "asset_renderer_mode" in compact and "provider" in compact:
                errors.append(_record_error(relative, record, "inline env map enables provider mode"))

    return errors


def inspect(root: Path) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    workflows = root / ".github" / "workflows"

    for relative in LEGACY_PAID_WORKFLOWS:
        if (root / relative).exists():
            errors.append(f"legacy paid workflow remains active: {relative.as_posix()}")

    allowed = root / ALLOWED_PAID_WORKFLOW
    if not allowed.is_file():
        errors.append(f"authorized marker workflow is missing: {ALLOWED_PAID_WORKFLOW.as_posix()}")
    else:
        allowed_text = allowed.read_text(encoding="utf-8")
        if MARKER_PATH not in allowed_text:
            errors.append("authorized paid workflow is not bound to the canonical v3 marker path")
        try:
            allowed_records = parse_workflow_yaml(allowed_text)
        except ValueError as exc:
            errors.append(f"authorized marker workflow YAML cannot be parsed safely: {exc}")
            allowed_records = []
        allowed_paths = {tuple(part.lower() for part in record.path) for record in allowed_records}
        if ("on", "push") not in allowed_paths:
            errors.append("authorized paid workflow must include a protected-main push trigger")
        for forbidden in ("workflow_dispatch", "repository_dispatch", "issues"):
            if ("on", forbidden) in allowed_paths:
                errors.append(f"authorized paid workflow exposes forbidden alternate trigger {forbidden}")
        if not any(
            tuple(part.lower() for part in record.path)[-2:] == ("push", "branches")
            and "main" in _normalized(record.value)
            for record in allowed_records
        ):
            errors.append("authorized paid workflow push trigger is not restricted to main")

    if workflows.is_dir():
        for path in sorted((*workflows.glob("*.yml"), *workflows.glob("*.yaml"))):
            relative = path.relative_to(root)
            if relative == ALLOWED_PAID_WORKFLOW:
                continue
            errors.extend(inspect_workflow(relative, path.read_text(encoding="utf-8")))

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
