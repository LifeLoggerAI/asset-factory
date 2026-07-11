#!/usr/bin/env python3
"""Fail closed when a spend/promotion-critical workflow uses mutable actions."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKFLOWS = [Path('.github/workflows/canonical-version-forge.yml')]
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


def check_paid_forge_contract(path: Path, text: str) -> None:
    required_fragments = {
        'protected paid environment': 'environment: paid-asset-generation',
        'exact main ref check': 'test "$GITHUB_REF" = refs/heads/main',
        'exact checked-out source check': 'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
        'promotion defaults disabled': "promote:\n        description: 'Open a Spatial promotion PR after complete certification'\n        required: true\n        type: boolean\n        default: false",
        'spatial base identity': 'SPATIAL_BASE_SHA',
        'promotion is review only': 'Promotion remains review-only and is never auto-merged.',
    }
    missing = [label for label, fragment in required_fragments.items() if fragment not in text]
    if missing:
        fail(f'{path}: missing critical controls: {", ".join(missing)}')


def main(argv: list[str]) -> int:
    workflow_paths = [Path(value) for value in argv] if argv else DEFAULT_WORKFLOWS
    for relative in workflow_paths:
        path = ROOT / relative
        if not path.is_file():
            fail(f'missing critical workflow: {relative}')
        text = path.read_text(encoding='utf-8')
        check_remote_uses(relative, text)
        if relative.as_posix().endswith('canonical-version-forge.yml'):
            check_paid_forge_contract(relative, text)
        print(f'workflow-integrity: verified {relative}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
