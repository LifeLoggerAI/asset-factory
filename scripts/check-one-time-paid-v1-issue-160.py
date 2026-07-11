#!/usr/bin/env python3
"""Fail closed if the one-time issue-160 paid executor exceeds its authority."""

from __future__ import annotations

import re
import sys
from pathlib import Path

WORKFLOW = Path('.github/workflows/one-time-paid-v1-issue-160.yml')
ALLOWED_ACTIONS = {
    'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
    'actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065',
    'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    'actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea',
}


def fail(message: str) -> None:
    print(f'ERROR: {message}', file=sys.stderr)
    raise SystemExit(1)


def require(text: str, fragment: str, label: str) -> None:
    if fragment not in text:
        fail(f'missing {label}: {fragment!r}')


def main() -> None:
    if not WORKFLOW.is_file():
        fail(f'missing workflow: {WORKFLOW}')
    text = WORKFLOW.read_text(encoding='utf-8')

    for forbidden in ('\n  push:', '\n  pull_request:', '\n  schedule:', '\n  workflow_dispatch:', '\n  workflow_run:'):
        if forbidden in text:
            fail(f'forbidden trigger present: {forbidden.strip()}')

    required = {
        'issue edited trigger': 'issues:\n    types: [edited]',
        'issue 160 binding': 'github.event.issue.number == 160',
        'owner-created issue': 'github.event.issue.user.login == github.repository_owner',
        'owner edit': 'github.event.sender.login == github.repository_owner',
        'exact execution title': "'[EXECUTE ONE PAID V1 SMOKE] URAI-ISSUE-160'",
        'exact main ref': 'test "$GITHUB_REF" = refs/heads/main',
        'exact SHA match': 'test "$target_sha" = "$GITHUB_SHA"',
        'one-time nonce': 'EXECUTION_NONCE=URAI-ISSUE-160-ONE-TIME-V1',
        'protected environment': 'environment: paid-asset-generation',
        'proven runner': 'runs-on: macos-latest',
        'one call': "ASSET_FORGE_MAX_PROVIDER_CALLS: '1'",
        'one dollar unit': "ASSET_FORGE_MAX_UNIT_COST_USD: '1.00'",
        'one dollar total': "ASSET_FORGE_MAX_COST_USD: '1.00'",
        'one entry': "ASSET_FORGE_LIMIT_ENTRIES: '1'",
        'one output': "ASSET_FORGE_LIMIT_OUTPUTS: '1'",
        'single provider attempt': "ASSET_RENDERER_MAX_ATTEMPTS: '1'",
        'provider required': "ASSET_FORGE_REQUIRE_PROVIDER: '1'",
        'paid authorization': "ASSET_FORGE_PAID_RUN_AUTHORIZED: '1'",
        'exact source checkout': 'ref: ${{ needs.authorize.outputs.target_sha }}',
        'promotion disabled evidence': "printf '%s\\n' \"$ISSUE_BODY\" | grep -Fx 'PROMOTE=false'",
        'bounded forge command': 'python image_asset_generator/forge_versioned.py --version v1',
        'artifact retention': 'retention-days: 30',
    }
    for label, fragment in required.items():
        require(text, fragment, label)

    if 'URAI_WHEEL_GITHUB_TOKEN' in text:
        fail('promotion token must not be available to one-time executor')
    if "promote: 'true'" in text or 'PROMOTE=true' in text:
        fail('promotion must remain disabled')
    if 'runs-on: ubuntu-latest' in text:
        fail('one-time executor must not depend on unavailable Ubuntu runner')
    if text.count("ASSET_FORGE_MAX_PROVIDER_CALLS: '1'") != 1:
        fail('provider-call ceiling must appear exactly once')

    remote_uses = re.findall(r'^\s*-?\s*uses:\s*([^\s#]+)', text, flags=re.MULTILINE)
    unexpected = [value for value in remote_uses if value not in ALLOWED_ACTIONS]
    if unexpected:
        fail(f'unexpected or mutable remote actions: {unexpected!r}')

    print('One-time issue-160 paid V1 executor integrity checks passed.')


if __name__ == '__main__':
    main()
