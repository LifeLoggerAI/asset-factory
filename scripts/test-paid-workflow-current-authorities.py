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
FINITE_TIME_WORKFLOW = '.github/workflows/one-time-finite-time-openai-physics-validation.yml'
FINITE_TIME_MARKER = 'authorizations/execute-finite-time-openai-physics-validation-20260912.json'
FINITE_TIME_NONPRIVATE_WORKFLOW = '.github/workflows/one-time-finite-time-openai-nonprivate-story-wave.yml'
FINITE_TIME_NONPRIVATE_MARKER = 'authorizations/execute-finite-time-openai-nonprivate-story-wave-20260912.json'
FINITE_TIME_CANARY_WORKFLOW = '.github/workflows/one-time-finite-time-openai-semantic-canary.yml'
FINITE_TIME_CANARY_MARKER = 'authorizations/execute-finite-time-openai-semantic-canary-20260912.json'

EXPECTED_CURRENT = {
    '.github/workflows/one-time-before-rest-world-cinematic-motion.yml':
        'authorizations/execute-before-rest-world-cinematic-motion-20260801.json',
    '.github/workflows/one-time-before-rest-world-full-master-t1.yml':
        'authorizations/execute-before-rest-world-full-master-t1-20260801.json',
    FILM_WORKFLOW: FILM_MARKER,
    FINITE_TIME_WORKFLOW: FINITE_TIME_MARKER,
    '.github/workflows/one-time-finite-time-openai-physics-validation-v2.yml':
        'authorizations/execute-finite-time-openai-physics-validation-v2-20260912.json',
    '.github/workflows/one-time-finite-time-openai-representative-validation.yml':
        'authorizations/execute-finite-time-openai-representative-validation-20260912.json',
    '.github/workflows/one-time-finite-time-openai-representative-retry-v2.yml':
        'authorizations/execute-finite-time-openai-representative-retry-v2-20260912.json',
    FINITE_TIME_NONPRIVATE_WORKFLOW: FINITE_TIME_NONPRIVATE_MARKER,
    FINITE_TIME_CANARY_WORKFLOW: FINITE_TIME_CANARY_MARKER,
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

    resume = load(FILM_RESUME_MARKER)
    assert resume['schemaVersion'] == '1.0.0', resume
    assert resume['mode'] == 'resume-existing-generation', resume
    assert resume['programAuthorityRepository'] == 'LifeLoggerAI/urai-studio', resume
    assert resume['programAuthoritySha'] == '802f909ecad2bd000e4c8011a14bc3340fe88950', resume
    assert resume['executionAuthorityRepository'] == 'LifeLoggerAI/asset-factory', resume
    assert resume['executionAuthorityPullRequest'] == 255, resume
    assert resume['manifestPath'] == 'manifests/film/built-from-survival-hero-cinema.manifest.json', resume
    assert resume['provider'] == 'openai', resume
    assert resume['priorRunId'] == 33237442786, resume
    assert resume['priorArtifactId'] == 9710419037, resume
    assert resume['maximumProviderCalls'] == 5, resume
    assert resume['providerCreateCallsPreviouslyExecuted'] == 2, resume
    assert resume['maximumNewProviderCalls'] == 3, resume
    assert resume['maximumReservedCostUsd'] == '8.00', resume
    assert_disabled_controls(resume, delivery_field=True)
    assert resume['generationRetryAuthorized'] is False, resume
    assert resume['editorialPromotionAuthorized'] is False, resume
    assert resume['generatedImageryIsRecreation'] is True, resume
    assert set(resume['existingProviderJobs']) == {'GEN-01', 'GEN-02'}, resume
    assert all(resume['existingProviderJobs'].values()), resume

    finite_time_text = (ROOT / FINITE_TIME_WORKFLOW).read_text(encoding='utf-8')
    for required in ('environment: paid-asset-generation', FINITE_TIME_MARKER, 'maximumProviderCalls', 'independentReviewDeferred'):
        assert required in finite_time_text, required

    nonprivate = load(FINITE_TIME_NONPRIVATE_MARKER)
    assert nonprivate['schemaVersion']=='finite-time-nonprivate-story-wave-v1', nonprivate
    assert nonprivate['provider']=='openai', nonprivate
    assert nonprivate['maximumProviderCalls']==12, nonprivate
    assert nonprivate['shotNumbers']==[7,8,12,13,14,15,17,19,25,26,27,28], nonprivate
    assert nonprivate['containsPrivateReferenceMedia'] is False, nonprivate
    assert nonprivate['automaticRetryAuthorized'] is False, nonprivate
    assert nonprivate['promotionAuthorized'] is False, nonprivate
    assert nonprivate['deploymentAuthorized'] is False, nonprivate
    assert nonprivate['deliveryAuthorized'] is False, nonprivate
    assert nonprivate['publicReleaseAuthorized'] is False, nonprivate
    assert nonprivate['privateReviewAuthorized'] is True, nonprivate
    nonprivate_text=(ROOT / FINITE_TIME_NONPRIVATE_WORKFLOW).read_text(encoding='utf-8')
    for required in ('environment: paid-asset-generation', FINITE_TIME_NONPRIVATE_MARKER, 'matrix:', 'SHOT_NUMBER', '2a872b885b3a7b99182f6a9d440cd8f1ee3ab27e'):
        assert required in nonprivate_text, required

    canary = load(FINITE_TIME_CANARY_MARKER)
    assert canary['schemaVersion']=='finite-time-nonprivate-semantic-canary-v1', canary
    assert canary['defectSourceRun']==34677073895, canary
    assert canary['productionSource']=='32041da2e66d553ce8e2aa696bb125cc25261ac5', canary
    assert canary['provider']=='openai', canary
    assert canary['model']=='sora-2', canary
    assert canary['maximumProviderCalls']==2, canary
    assert canary['shotNumbers']==[8,28], canary
    assert canary['containsPrivateReferenceMedia'] is False, canary
    assert canary['automaticRetryAuthorized'] is False, canary
    assert canary['promotionAuthorized'] is False, canary
    assert canary['deploymentAuthorized'] is False, canary
    assert canary['deliveryAuthorized'] is False, canary
    assert canary['publicReleaseAuthorized'] is False, canary
    assert canary['privateReviewAuthorized'] is True, canary
    assert canary['literalVisualQcRequired'] is True, canary
    assert canary['successDoesNotAuthorizeRemainingRetries'] is True, canary
    canary_text=(ROOT / FINITE_TIME_CANARY_WORKFLOW).read_text(encoding='utf-8')
    for required in ('environment: paid-asset-generation', FINITE_TIME_CANARY_MARKER, 'matrix:', 'shot: [8, 28]', '32041da2e66d553ce8e2aa696bb125cc25261ac5', '34677073895'):
        assert required in canary_text, required

    film_text = (ROOT / FILM_WORKFLOW).read_text(encoding='utf-8')
    for required in (
        'environment: paid-asset-generation', FILM_MARKER, FILM_RESUME_MARKER,
        'EXECUTION_MODE=resume', 'gh run download "$PRIOR_RUN_ID"',
        'providerCreateCallsPreviouslyExecuted', 'providerCreateCallsExecutedThisRun',
        'providerCreateCallsLifetime',
    ):
        assert required in film_text, required

    errors = module.inspect(ROOT)
    assert errors == [], '\n'.join(errors)
    print('PASS exact current paid authorities including bounded FINITE TIME semantic canary')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
