#!/usr/bin/env python3
"""Prove the legacy one-call paid smoke dispatcher remains retired."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY_DISPATCHER = ROOT / ".github/workflows/dispatch-one-paid-v1-smoke.yml"
BOUNDARY_CHECKER = ROOT / "scripts/check-paid-workflow-boundary.py"


def main() -> int:
    if LEGACY_DISPATCHER.exists():
        print(f"ERROR: legacy paid smoke dispatcher remains active: {LEGACY_DISPATCHER}", file=sys.stderr)
        return 1
    if not BOUNDARY_CHECKER.is_file():
        print(f"ERROR: global paid workflow boundary checker is missing: {BOUNDARY_CHECKER}", file=sys.stderr)
        return 1

    completed = subprocess.run(
        [sys.executable, str(BOUNDARY_CHECKER), "--root", str(ROOT)],
        check=False,
        text=True,
    )
    if completed.returncode != 0:
        return completed.returncode

    print("Paid smoke compatibility guard passed: legacy dispatcher is retired.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
