#!/usr/bin/env python3
"""Fail closed when the sole spend-critical workflow uses mutable actions or weak authorization."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKFLOWS = [Path('.github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml')]
FULL_SHA = re.compile(r'^[0-9a-f]{40}$')
USES_LINE = re.compile(r'^\s*uses:\s*([^\s#]+)', re.MULTILINE)


def fail(message: str) -> None:
    raise SystemExit(f'workflow-integrity: {message}')


def check_remote_uses(path: Path, text: str) -> None:
    references = USES_LINE.findall(text)
    if not references:
        fail(f'{path} has no uses: references to verify')
    for reference in references:
        if reference.startswith('./'):
            continue
        if '@' not in reference:
            fail(f'{path}: remote action lacks @ref: {reference}')
        action, ref = reference.rsplit('@', 1)
        if not action or not FULL_SHA.fullmatch(ref):
            fail(f'{path}: mutable or non-SHA action reference: {reference}')


def check_recovery_contract(path: Path, text: str) -> None:
    required_fragments = {
        'canonical marker trigger': 'authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json',
        'push-only event': '\n  push:',
        'protected main branch': 'branches: [main]',
        'protected paid environment': 'environment: paid-asset-generation',
        'exact main ref check': 'test "$GITHUB_REF" = refs/heads/main',
        'exact checked-out source check': 'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
        'one-file recovery validator': 'scripts/validate_v1_receptionist_recovery_commit.py',
        'retained artifact identity': '8741010314',
        'retained digest identity': 'sha256:10318639cd60051d612a4277a639a2bd9fd55d64fda3e17b1a7d42452d9e24ff',
        'one-attempt limit': 'test "$GITHUB_RUN_ATTEMPT" = \'1\'',
        'one-call ceiling': "ASSET_FORGE_MAX_PROVIDER_CALLS: '1'",
        'one-dollar ceiling': "ASSET_FORGE_MAX_COST_USD: '1.00'",
        'single target': 'avatar_receptionist',
        'pinned OpenAI endpoint': 'https://api.openai.com/v1/images/generations',
        'no Spatial token': 'test -z "${URAI_WHEEL_GITHUB_TOKEN:-}"',
        'read-only contents permission': 'contents: read',
    }
    missing = [label for label, fragment in required_fragments.items() if fragment not in text]
    if missing:
        fail(f'{path}: missing critical controls: {", ".join(missing)}')
    if text.count('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}') != 1:
        fail(f'{path}: provider secret must appear in exactly one protected execute step')
    for forbidden in ('workflow_dispatch:', 'repository_dispatch:', '\n  issues:', 'git push origin', 'contents: write', 'deployments: write', 'id-token: write'):
        if forbidden in text:
            fail(f'{path}: forbidden alternate trigger, write permission, or direct promotion path: {forbidden!r}')


def main(argv: list[str]) -> int:
    workflow_paths = [Path(value) for value in argv] if argv else DEFAULT_WORKFLOWS
    for relative in workflow_paths:
        path = ROOT / relative
        if not path.is_file():
            fail(f'missing critical workflow: {relative}')
        text = path.read_text(encoding='utf-8')
        check_remote_uses(relative, text)
        if relative == DEFAULT_WORKFLOWS[0]:
            check_recovery_contract(relative, text)
        print(f'workflow-integrity: verified {relative}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
