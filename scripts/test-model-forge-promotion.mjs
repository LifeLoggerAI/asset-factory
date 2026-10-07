import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const validator = fileURLToPath(new URL('../model_forge/verify-promotion.mjs', import.meta.url));
function declaredReceipt() {
  // Synthetic receipt shape only. No real reviewer or approval is represented.
  return {
    schemaVersion: 'urai-model-promotion-receipt-v1', assetId: 'synthetic-fixture',
    candidate: { provider: 'synthetic', providerModel: 'test', taskId: 'fixture', sha256: 'a'.repeat(64), provenancePath: 'fixture/provenance.json' },
    structuralValidation: { passed: true, reportPath: 'fixture/structural.json' },
    cleanup: { passed: true, receiptPath: 'fixture/cleanup.json', lod0: 'fixture/lod0.glb', lod1: 'fixture/lod1.glb', lod2: 'fixture/lod2.glb' },
    performance: { passed: true, triangleBudget: true, textureBudget: true, drawCallBudget: true },
    sceneIntegration: { integrated: true, spatialRepository: 'LifeLoggerAI/urai-spatial', exactHead: 'b'.repeat(40), route: '/synthetic', targetPath: 'fixture/lod0.glb' },
    literalPixelReview: { accepted: true, desktop: true, phonePortrait: true, reducedMotion: true, proofArtifact: 'synthetic-test-only' },
    explicitApproval: { approved: true, reviewer: 'synthetic-test-only', reviewedAt: '2026-10-07T00:00:00Z' },
    governance: { promotionAllowed: true }, promoted: true,
  };
}
function run(t, receipt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-promotion-contract-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'receipt.json'); fs.writeFileSync(file, JSON.stringify(receipt));
  return spawnSync(process.execPath, [validator, file], { encoding: 'utf8', timeout: 10000 });
}
test('complete declared fields pass only the receipt contract, never authenticate approval', (t) => {
  const result = run(t, declaredReceipt());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RECEIPT_CONTRACT_PASSED/);
  assert.match(result.stdout, /DECLARED_FIELDS_ONLY/);
  assert.doesNotMatch(result.stdout, /PROMOTION=VERIFIED/);
});
for (const budget of ['triangleBudget', 'textureBudget', 'drawCallBudget']) {
  test(`${budget} cannot be bypassed by aggregate performance.passed`, (t) => {
    const receipt = declaredReceipt(); receipt.performance[budget] = false;
    const result = run(t, receipt);
    assert.equal(result.status, 1); assert.match(result.stderr, /all performance budgets/);
  });
}
for (const [section, field, reason] of [
  ['candidate', 'provenancePath', 'candidate provenance path'],
  ['structuralValidation', 'reportPath', 'structural report path'],
  ['cleanup', 'receiptPath', 'cleanup receipt path'],
  ['literalPixelReview', 'proofArtifact', 'literal pixel proof artifact'],
  ['sceneIntegration', 'targetPath', 'scene route and target path'],
  ['explicitApproval', 'reviewer', 'explicit approval'],
]) {
  test(`approval booleans cannot bypass missing ${section}.${field}`, (t) => {
    const receipt = declaredReceipt(); receipt[section][field] = '   ';
    const result = run(t, receipt);
    assert.equal(result.status, 1); assert.ok(result.stderr.includes(reason));
  });
}
test('malformed digests, timestamps, provider identity and scene repository fail closed', (t) => {
  for (const mutate of [
    (r) => { r.candidate.sha256 = 'truthy'; },
    (r) => { r.explicitApproval.reviewedAt = 'yesterday'; },
    (r) => { r.candidate.taskId = ''; },
    (r) => { r.sceneIntegration.spatialRepository = 'another/runtime'; },
  ]) {
    const receipt = declaredReceipt(); mutate(receipt);
    assert.equal(run(t, receipt).status, 1);
  }
});
