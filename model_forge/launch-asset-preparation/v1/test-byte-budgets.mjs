import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {evaluateModelByteBudget, POLICY_SOURCE} from './asset-byte-budgets.mjs';

test('Missing declaration binds the actual pinned model ceiling; above ceiling fails', () => {
  assert.equal(evaluateModelByteBudget(3145728, null).byteBudgetPass, true);
  assert.equal(evaluateModelByteBudget(3145729, undefined).byteBudgetPass, false);
  assert.equal(evaluateModelByteBudget(3145729, 9999999).byteBudgetPass, false);
  assert.equal(POLICY_SOURCE.commit, 'c75eb8a10aa1712fe64030d82aafeb3a1d31e702');
});
test('Stricter declared ceiling survives; initial scene ceiling is separate', () => {
  const r = evaluateModelByteBudget(1001, 1000);
  assert.equal(r.effectiveMaxBytes, 1000); assert.equal(r.byteBudgetPass, false);
  assert.equal(evaluateModelByteBudget(2500001).initialSceneBudgetState, 'EXCEEDS_INITIAL_ASSET_CEILING_IF_LOADED_INITIALLY');
  const boundary = evaluateModelByteBudget(2500000);
  assert.equal(boundary.initialSceneBudgetState, 'UNMEASURED_REQUIRES_COMPLETE_FIRST_VISIBLE_SCENE');
  assert.equal(boundary.runtimeAdmission, false);
});
test('Malformed numbers cannot bypass the pinned ceiling', () => {
  for(const n of [NaN, Infinity, -1, 0, 1.5, '100', true, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => evaluateModelByteBudget(10,n));
    assert.throws(() => evaluateModelByteBudget(n));
  }
});
test('Tampered policy refuses module initialization', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'urai-policy-'));
  try {
    fs.copyFileSync(new URL('./asset-byte-budgets.mjs',import.meta.url),path.join(dir,'asset-byte-budgets.mjs'));
    const policy=JSON.parse(fs.readFileSync(new URL('./spatial-performance-budget.c75.json',import.meta.url)));
    policy.budgets.largestSingleModelBytes=99999999;
    fs.writeFileSync(path.join(dir,'spatial-performance-budget.c75.json'),JSON.stringify(policy));
    assert.throws(()=>execFileSync(process.execPath,[path.join(dir,'asset-byte-budgets.mjs')],{stdio:'pipe'}), /Command failed/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
