#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
MODULE_PATH = SCRIPT_DIR / "validate_v1_marker_commit.py"
spec = importlib.util.spec_from_file_location("validate_v1_marker_commit", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

VALIDATOR_PATH = SCRIPT_DIR / "validate_v1_safe_resume_v3_marker.py"
validator_spec = importlib.util.spec_from_file_location(
    "validate_v1_safe_resume_v3_marker", VALIDATOR_PATH
)
assert validator_spec and validator_spec.loader
validator = importlib.util.module_from_spec(validator_spec)
validator_spec.loader.exec_module(validator)


def run(root: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", *args], cwd=root, text=True, encoding="utf-8"
    ).strip()


def commit(root: Path, message: str) -> str:
    run(root, "add", "-A")
    run(root, "commit", "-m", message)
    return run(root, "rev-parse", "HEAD")


def write_marker(root: Path, parent_sha: str) -> None:
    path = root / validator.MARKER_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(validator.expected_marker(parent_sha), indent=2) + "\n",
        encoding="utf-8",
    )


def init_repo(root: Path) -> str:
    run(root, "init", "-b", "main")
    run(root, "config", "user.name", "URAI Test")
    run(root, "config", "user.email", "urai-test@example.invalid")
    (root / "README.md").write_text("base\n", encoding="utf-8")
    return commit(root, "base")


def test_direct_marker_commit() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        parent = init_repo(root)
        write_marker(root, parent)
        head = commit(root, "authorize")
        old = Path.cwd()
        try:
            os.chdir(root)
            assert module.validate_marker_commit(head) == parent
        finally:
            os.chdir(old)


def test_normal_merge_marker_commit() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        parent = init_repo(root)
        run(root, "checkout", "-b", "authorize")
        write_marker(root, parent)
        commit(root, "add marker")
        run(root, "checkout", "main")
        run(root, "merge", "--no-ff", "authorize", "-m", "merge marker")
        merge_sha = run(root, "rev-parse", "HEAD")
        old = Path.cwd()
        try:
            os.chdir(root)
            assert module.validate_marker_commit(merge_sha) == parent
        finally:
            os.chdir(old)


def test_extra_file_is_rejected() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        parent = init_repo(root)
        write_marker(root, parent)
        (root / "extra.txt").write_text("not allowed\n", encoding="utf-8")
        head = commit(root, "authorize plus extra")
        old = Path.cwd()
        try:
            os.chdir(root)
            try:
                module.validate_marker_commit(head)
            except ValueError as exc:
                assert "exactly the canonical marker" in str(exc)
            else:
                raise AssertionError("multi-file authorization commit was accepted")
        finally:
            os.chdir(old)


def main() -> int:
    test_direct_marker_commit()
    test_normal_merge_marker_commit()
    test_extra_file_is_rejected()
    print("PASS merge-aware V1 marker commit validation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
