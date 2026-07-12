#!/usr/bin/env python3
"""Validate that a protected-main commit adds only the canonical V1 marker.

The comparison is always against the commit's first parent. This supports a
single direct commit, squash merge, or normal PR merge while preserving the
one-effective-file authorization boundary.
"""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

from validate_v1_safe_resume_v3_marker import MARKER_PATH, validate_marker


def git_output(*args: str) -> str:
    return subprocess.check_output(
        ["git", *args],
        text=True,
        encoding="utf-8",
        stderr=subprocess.STDOUT,
    ).strip()


def validate_marker_commit(commit_sha: str, marker_path: Path = MARKER_PATH) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", commit_sha):
        raise ValueError("commit SHA must be a lowercase 40-character SHA-1")

    resolved = git_output("rev-parse", commit_sha)
    if resolved != commit_sha:
        raise ValueError(f"commit identity mismatch: {resolved} != {commit_sha}")

    parent_sha = git_output("rev-parse", f"{commit_sha}^1")
    changes = git_output(
        "diff",
        "--name-status",
        "--no-renames",
        parent_sha,
        commit_sha,
    ).splitlines()
    expected_change = f"A\t{marker_path.as_posix()}"
    if changes != [expected_change]:
        raise ValueError(
            "authorization commit must add exactly the canonical marker relative "
            f"to its first parent; actual={changes!r}, expected={[expected_change]!r}"
        )

    validate_marker(marker_path, parent_sha)
    return parent_sha


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", required=True)
    parser.add_argument("--marker", type=Path, default=MARKER_PATH)
    parser.add_argument("--github-output", type=Path)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    parent_sha = validate_marker_commit(args.commit, args.marker)
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            output.write(f"parent_sha={parent_sha}\n")
    print(parent_sha)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
