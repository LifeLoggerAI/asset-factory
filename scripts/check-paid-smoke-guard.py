#!/usr/bin/env python3
"""Fail closed if the one-call paid smoke dispatcher loses a required control."""

from __future__ import annotations

import re
import sys
from pathlib import Path

WORKFLOW = Path(".github/workflows/dispatch-one-paid-v1-smoke.yml")
PINNED_GITHUB_SCRIPT = "60a0d83039c74a4aee543508d2ffcb1c3799cdea"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def require(text: str, fragment: str, description: str) -> None:
    if fragment not in text:
        fail(f"missing {description}: {fragment!r}")


def main() -> None:
    if not WORKFLOW.is_file():
        fail(f"missing workflow: {WORKFLOW}")

    text = WORKFLOW.read_text(encoding="utf-8")

    for forbidden_trigger in ("\n  push:", "\n  pull_request:", "\n  schedule:", "\n  issues:", "\n  workflow_run:"):
        if forbidden_trigger in text:
            fail(f"automatic trigger present: {forbidden_trigger.strip()}")
    require(text, "\n  workflow_dispatch:", "manual workflow_dispatch trigger")

    required_fragments = {
        "typed authorization input": "Type AUTHORIZE_ONE_PAID_V1_SMOKE",
        "safe confirmation default": "default: NO_PAID_CALL",
        "typed job condition": "if: inputs.confirm == 'AUTHORIZE_ONE_PAID_V1_SMOKE'",
        "proven available runner": "runs-on: macos-latest",
        "protected environment": "environment: paid-asset-generation",
        "manual event validation": 'test "$GITHUB_EVENT_NAME" = workflow_dispatch',
        "repository validation": 'test "$GITHUB_REPOSITORY" = LifeLoggerAI/asset-factory',
        "main ref validation": 'test "$GITHUB_REF" = refs/heads/main',
        "40-character SHA validation": '[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]',
        "exact checked-out SHA validation": 'test "$TARGET_SHA" = "$GITHUB_SHA"',
        "non-secret approval identifier": 'test -n "$APPROVAL_ID"',
        "typed confirmation validation": "test '${{ inputs.confirm }}' = AUTHORIZE_ONE_PAID_V1_SMOKE",
        "single provider call summary": "maximum provider calls: 1",
        "one-dollar unit ceiling summary": "maximum unit cost: USD 1.00",
        "one-dollar total ceiling summary": "maximum total cost: USD 1.00",
        "single entry summary": "maximum entries: 1",
        "single output summary": "maximum outputs: 1",
        "promotion disabled summary": "promotion: disabled",
        "canonical forge target": "workflow_id: 'canonical-version-forge.yml'",
        "main forge ref": "ref: 'main'",
        "forge confirmation": "confirm: 'GENERATE_CANONICAL_VERSION'",
        "single round": "rounds: '1'",
        "single provider call input": "max_provider_calls: '1'",
        "one-dollar unit input": "max_unit_cost_usd: '1.00'",
        "one-dollar total input": "max_total_cost_usd: '1.00'",
        "single entry input": "limit_entries: '1'",
        "single output input": "limit_outputs: '1'",
        "no skipping existing output": "skip_existing: 'false'",
        "promotion disabled input": "promote: 'false'",
    }
    for description, fragment in required_fragments.items():
        require(text, fragment, description)

    if "secrets." in text or "${{ secrets" in text:
        fail("paid smoke dispatcher must not read provider secrets")

    remote_uses = re.findall(r"^\s*-?\s*uses:\s*([^\s#]+)", text, flags=re.MULTILINE)
    if remote_uses != [f"actions/github-script@{PINNED_GITHUB_SCRIPT}"]:
        fail(f"unexpected or mutable remote actions: {remote_uses!r}")

    require(text, "permissions:\n  contents: read", "read-only workflow permissions")
    require(text, "permissions:\n      actions: write\n      contents: read", "isolated job permissions")
    if text.count("actions: write") != 1:
        fail("actions: write must appear exactly once")

    print("Paid smoke guard integrity checks passed.")


if __name__ == "__main__":
    main()
