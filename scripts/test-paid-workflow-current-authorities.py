#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
MODULE_PATH = SCRIPT_DIR / 'check-paid-workflow-boundary-current.py'
spec = importlib.util.spec_from_file_location('check_paid_workflow_boundary_current', MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

FILM_WORKFLOW = '.github/workflows/one-time-built-from-survival-hero-cinema.yml'
FILM_MARKER = 'authorizations/execute-built-from-survival-hero-cinema-20260829.json'
FILM_RESUME_MARKER = 'authorizations/resume-built-from-survival-hero-cinema-20260829.json'

EXPECTED_CURRENT = {
    '.github/workflows/one-time-before-rest-world-cinematic-motion.yml':
        'authorizations/execute-before-rest-world-cinematic-motion-20260801.json',
    '.github/workflows/one-time-before-rest-world-full-master-t1.yml':
        'authorizations/execute-before-rest-world-full-master-t1-20260801.json',
    FILM_WORKFLOW: FILM_MARKER,
}
EXPECTED_ALL = {
    '.github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml':
        'authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json',
    '.github/workflows/one-time-before-rest-world-proof.yml':
        'authorizations/execute-before-rest-world-proof-20260731.json',
    '.github/workflows/one-time-before-rest-world-repair.yml':
        'authorizations/execute-before-rest-world-repair-20260731.json',
    **EXPECTED_CURRENT,
}

def load(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))

def assert_disabled_controls(record: dict, *, delivery_field: bool) -> None:
    for key in ('automaticRetryAuthorized','remixAuthorized','promotionAuthorized','deploymentAuthorized','publicReleaseAuthorized'):
        assert record.get(key) is False, (key, record)
    if delivery_field:
        assert record.get('deliveryAuthorized') is False, record
    assert record.get('privateReviewAuthorized') is True, record

def main() -> int:
    current = {path.as_posix(): marker for path, marker in module.CURRENT_MARKER_WORKFLOWS.items()}
    all_authorities = {path.as_posix(): marker for path, marker in module.AUTHORIZED_MARKER_WORKFLOWS.items()}
    assert current == EXPECTED_CURRENT, current
    assert all_authorities == EXPECTED_ALL, all_authorities

    cinematic = load(EXPECTED_CURRENT['.github/workflows/one-time-before-rest-world-cinematic-motion.yml'])
    assert cinematic['executionAuthority'] == 'LifeLoggerAI/asset-factory#224', cinematic
    assert cinematic['maximumProviderCalls'] == 7, cinematic
    assert cinematic['maximumReservedCostUsd'] == '8.00', cinematic
    assert_disabled_controls(cinematic, delivery_field=False)

    full_master = load(EXPECTED_CURRENT['.github/workflows/one-time-before-rest-world-full-master-t1.yml'])
    assert full_master['executionAuthority'] == 'LifeLoggerAI/asset-factory#226', full_master
    assert full_master['maximumProviderCalls'] == 12, full_master
    assert full_master['maximumReservedCostUsd'] == '15.00', full_master
    assert_disabled_controls(full_master, delivery_field=True)

    film = load(FILM_MARKER)
    assert film['schemaVersion'] == '1.0.0', film
    assert film['programAuthorityRepository'] == 'LifeLoggerAI/urai-studio', film
    assert film['programAuthoritySha'] == '802f909ecad2bd000e4c8011a14bc3340fe88950', film
    assert film['executionAuthorityRepository'] == 'LifeLoggerAI/asset-factory', film
    assert film['executionAuthorityPullRequest'] == 254, film
    assert film['manifestPath'] == 'manifests/film/built-from-survival-hero-cinema.manifest.json', film
    assert film['provider'] == 'openai', film
    assert film['maximumProviderCalls'] == 5, film
    assert film['maximumReservedCostUsd'] == '8.00', film
    assert_disabled_controls(film, delivery_field=True)
    assert film['editorialPromotionAuthorized'] is False, film
    assert film['generatedImageryIsRecreation'] is True, film

    assert not (ROOT / FILM_RESUME_MARKER).exists(), 'resume marker must remain absent on no-spend support PR'
    film_text = (ROOT / FILM_WORKFLOW).read_text(encoding='utf-8')
    for required in (
        'environment: paid-asset-generation',
        FILM_MARKER,
        FILM_RESUME_MARKER,
        'EXECUTION_MODE=resume',
        'gh run download "$PRIOR_RUN_ID"',
        'providerCreateCallsPreviouslyExecuted',
        'providerCreateCallsExecutedThisRun',
        'providerCreateCallsLifetime',
    ):
        assert required in film_text, required

    errors = module.inspect(ROOT)
    assert errors == [], '\n'.join(errors)
    print('PASS exact current paid authorities, spend caps, consumed Film marker, and no-spend resume support')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
