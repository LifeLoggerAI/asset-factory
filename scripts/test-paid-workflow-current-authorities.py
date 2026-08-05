#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
MODULE_PATH = SCRIPT_DIR / "check-paid-workflow-boundary-current.py"
spec = importlib.util.spec_from_file_location("check_paid_workflow_boundary_current", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

EXPECTED_CURRENT = {
    ".github/workflows/one-time-before-rest-world-cinematic-motion.yml":
        "authorizations/execute-before-rest-world-cinematic-motion-20260801.json",
    ".github/workflows/one-time-before-rest-world-full-master-t1.yml":
        "authorizations/execute-before-rest-world-full-master-t1-20260801.json",
}

EXPECTED_ALL = {
    ".github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml":
        "authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json",
    ".github/workflows/one-time-before-rest-world-proof.yml":
        "authorizations/execute-before-rest-world-proof-20260731.json",
    ".github/workflows/one-time-before-rest-world-repair.yml":
        "authorizations/execute-before-rest-world-repair-20260731.json",
    **EXPECTED_CURRENT,
}


def load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def assert_disabled_controls(record: dict, *, delivery_field: bool) -> None:
    for key in (
        "automaticRetryAuthorized",
        "remixAuthorized",
        "promotionAuthorized",
        "deploymentAuthorized",
        "publicReleaseAuthorized",
    ):
        assert record.get(key) is False, (key, record)
    if delivery_field:
        assert record.get("deliveryAuthorized") is False, record
    assert record.get("privateReviewAuthorized") is True, record


def main() -> int:
    current = {path.as_posix(): marker for path, marker in module.CURRENT_MARKER_WORKFLOWS.items()}
    all_authorities = {path.as_posix(): marker for path, marker in module.AUTHORIZED_MARKER_WORKFLOWS.items()}
    assert current == EXPECTED_CURRENT, current
    assert all_authorities == EXPECTED_ALL, all_authorities

    cinematic = load(EXPECTED_CURRENT[".github/workflows/one-time-before-rest-world-cinematic-motion.yml"])
    assert cinematic["executionAuthority"] == "LifeLoggerAI/asset-factory#224", cinematic
    assert cinematic["maximumProviderCalls"] == 7, cinematic
    assert cinematic["maximumReservedCostUsd"] == "8.00", cinematic
    assert_disabled_controls(cinematic, delivery_field=False)

    full_master = load(EXPECTED_CURRENT[".github/workflows/one-time-before-rest-world-full-master-t1.yml"])
    assert full_master["executionAuthority"] == "LifeLoggerAI/asset-factory#226", full_master
    assert full_master["maximumProviderCalls"] == 12, full_master
    assert full_master["maximumReservedCostUsd"] == "15.00", full_master
    assert_disabled_controls(full_master, delivery_field=True)

    errors = module.inspect(ROOT)
    assert errors == [], "\n".join(errors)
    print("PASS current paid workflow authorities and bounded budgets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
