import crypto from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';

export const POLICY_SOURCE = Object.freeze({
  repository: 'LifeLoggerAI/urai-spatial',
  commit: 'c75eb8a10aa1712fe64030d82aafeb3a1d31e702',
  path: 'operations/performance/spatial-performance-budget.json',
  gitBlobSha: '5801a96ef668b938d7d1968a6063f1a94aabc6c2'
});
const bytes = fs.readFileSync(new URL('./spatial-performance-budget.c75.json', import.meta.url));
const blob = crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'), bytes])).digest('hex');
assert.equal(blob, POLICY_SOURCE.gitBlobSha, 'Pinned Spatial policy bytes changed');
const policy = JSON.parse(bytes);
const positiveInteger = n => Number.isSafeInteger(n) && n > 0;
assert.ok(positiveInteger(policy.budgets.largestSingleModelBytes));
assert.ok(positiveInteger(policy.budgets.initialAssetBytes));

export function evaluateModelByteBudget(outputBytes, declaredMaxBytes) {
  assert.ok(positiveInteger(outputBytes), 'Measured GLB bytes must be a positive safe integer');
  assert.ok(declaredMaxBytes == null || positiveInteger(declaredMaxBytes),
    'Declared model byte budget must be a positive safe integer when supplied');
  const ceiling = Math.min(policy.budgets.largestSingleModelBytes,
    declaredMaxBytes ?? policy.budgets.largestSingleModelBytes);
  return {
    authority: POLICY_SOURCE,
    policyBudgetId: policy.budgetId,
    largestSingleModelBytes: policy.budgets.largestSingleModelBytes,
    declaredMaxBytes: declaredMaxBytes ?? null,
    effectiveMaxBytes: ceiling,
    measuredOutputBytes: outputBytes,
    byteBudgetPass: outputBytes <= ceiling,
    initialAssetBytes: policy.budgets.initialAssetBytes,
    initialSceneBudgetState: outputBytes > policy.budgets.initialAssetBytes
      ? 'EXCEEDS_INITIAL_ASSET_CEILING_IF_LOADED_INITIALLY'
      : 'UNMEASURED_REQUIRES_COMPLETE_FIRST_VISIBLE_SCENE',
    runtimeAdmission: false
  };
}
