#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, json, sys
from pathlib import Path
SCRIPT_DIR=Path(__file__).resolve().parent; ROOT=SCRIPT_DIR.parent
MODULE_PATH=SCRIPT_DIR/'check-paid-workflow-boundary-current.py'
spec=importlib.util.spec_from_file_location('check_paid_workflow_boundary_current',MODULE_PATH); assert spec and spec.loader
module=importlib.util.module_from_spec(spec); sys.modules[spec.name]=module; spec.loader.exec_module(module)
FILM_WORKFLOW='.github/workflows/one-time-built-from-survival-hero-cinema.yml'
FILM_MARKER='authorizations/execute-built-from-survival-hero-cinema-20260829.json'
FILM_RESUME_MARKER='authorizations/resume-built-from-survival-hero-cinema-20260829.json'
EXPECTED_CURRENT={
'.github/workflows/one-time-before-rest-world-cinematic-motion.yml':'authorizations/execute-before-rest-world-cinematic-motion-20260801.json',
'.github/workflows/one-time-before-rest-world-full-master-t1.yml':'authorizations/execute-before-rest-world-full-master-t1-20260801.json',
FILM_WORKFLOW:FILM_MARKER}
EXPECTED_ALL={
'.github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml':'authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json',
'.github/workflows/one-time-before-rest-world-proof.yml':'authorizations/execute-before-rest-world-proof-20260731.json',
'.github/workflows/one-time-before-rest-world-repair.yml':'authorizations/execute-before-rest-world-repair-20260731.json',**EXPECTED_CURRENT}
def load(relative): return json.loads((ROOT/relative).read_text())
def assert_disabled(record,delivery=False):
    for key in ('automaticRetryAuthorized','remixAuthorized','promotionAuthorized','deploymentAuthorized','publicReleaseAuthorized'): assert record.get(key) is False,(key,record)
    if delivery: assert record.get('deliveryAuthorized') is False
    assert record.get('privateReviewAuthorized') is True
def main():
    current={p.as_posix():m for p,m in module.CURRENT_MARKER_WORKFLOWS.items()}; all_auth={p.as_posix():m for p,m in module.AUTHORIZED_MARKER_WORKFLOWS.items()}
    assert current==EXPECTED_CURRENT,current; assert all_auth==EXPECTED_ALL,all_auth
    cinematic=load(EXPECTED_CURRENT['.github/workflows/one-time-before-rest-world-cinematic-motion.yml']); assert cinematic['maximumProviderCalls']==7; assert_disabled(cinematic)
    full=load(EXPECTED_CURRENT['.github/workflows/one-time-before-rest-world-full-master-t1.yml']); assert full['maximumProviderCalls']==12; assert_disabled(full,True)
    film=load(FILM_MARKER); assert film['maximumProviderCalls']==5; assert film['maximumReservedCostUsd']=='8.00'; assert_disabled(film)
    assert not (ROOT/FILM_RESUME_MARKER).exists(),'resume marker must remain absent on no-spend support PR'
    text=(ROOT/FILM_WORKFLOW).read_text()
    for required in ('environment: paid-asset-generation',FILM_MARKER,FILM_RESUME_MARKER,'EXECUTION_MODE=resume'):
        assert required in text,required
    errors=module.inspect(ROOT); assert errors==[],'\n'.join(errors)
    print('PASS current paid workflow authorities, consumed original Film marker, and no-spend resume support')
    return 0
if __name__=='__main__': raise SystemExit(main())
