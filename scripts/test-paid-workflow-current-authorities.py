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

FILM_WORKFLOW = ".github/workflows/one-time-built-from-survival-hero-cinema.yml"
FILM_MARKER = "authorizations/execute-built-from-survival-hero-cinema-20260829.json"

EXPECTED_CURRENT = {
    ".github/workflows/one-time-before-rest-world-cinematic-motion.yml":
        "authorizations/execute-before-rest-world-cinematic-motion-20260801.json",
    ".github/workflows/one-time-before-rest-world-full-master-t1.yml":
        "authorizations/execute-before-rest-world-full-master-t1-20260801.json",
    FILM_WORKFLOW: FILM_MARKER,
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

    # Support PR must register the future Film #001 paid authority while remaining no-spend.
    assert not (ROOT / FILM_MARKER).exists(), "Film #001 execution marker must not exist on support PR"
    film_text = (ROOT / FILM_WORKFLOW).read_text(encoding="utf-8")
    for required in (
        "environment: paid-asset-generation",
        "OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}",
        "test \"$changed\" = \"$AUTHORIZATION_MARKER\"",
        "test \"$GITHUB_RUN_ATTEMPT\" = '1'",
        "assert receipt['providerCallsAuthorized'] == 5",
        "assert receipt['maximumReservedCostUsd'] == '8.00'",
        "assert receipt['automaticRetryAuthorized'] is False",
        "assert receipt['publicReleaseAuthorized'] is False",
        "assert receipt['editorialPromotionAuthorized'] is False",
    ):
        assert required in film_text, required

    errors = module.inspect(ROOT)
    assert errors == [], "\n".join(errors)
    print("PASS current paid workflow authorities and bounded budgets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
