import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { makeProviderContractReceipt } from './provider-contract-receipt.mjs';

const fixture = () => ({
  inventory: JSON.parse(fs.readFileSync('model_forge/launch-model-inventory.json', 'utf8')),
  resolution: JSON.parse(fs.readFileSync('model_forge/reference-resolution.json', 'utf8')),
  readiness: { spendAuthorized: false, deploymentReadiness: {
    dedicatedProductionTarget: { configured: false }, wif: { configured: false }, providerLiveSmoke: { certified: false },
  } },
  env: { TARGET_SHA: 'a'.repeat(40), ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED: 'false',
    ...Object.fromEntries(['MEDIA', 'IMAGE', 'MODEL3D', 'AUDIO', 'SFX', 'MUSIC', 'STT', 'VIDEO'].map((m) => [`ASSET_FACTORY_${m}_PROVIDER`, 'local-proof'])),
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', GITHUB_EVENT_NAME: 'pull_request' },
  actualHead: 'a'.repeat(40), sourceDigests: {},
});

test('receipt accepts reconciled current authority and binds run identity', () => {
  const input = fixture();
  const receipt = makeProviderContractReceipt(input);
  assert.equal(receipt.spatialHead, input.resolution.recoveredSpatialHead);
  assert.equal(receipt.workflowRunId, '123');
  assert.equal(receipt.workflowRunAttempt, '2');
  assert.equal(receipt.noSpend, true);
});

for (const [name, mutate] of [
  ['stale execution source', (f) => { f.inventory.providerExecutionBoundary.spatialHead = 'b'.repeat(40); }],
  ['stale reference source', (f) => { f.resolution.recoveredSpatialHead = 'b'.repeat(40); }],
  ['stale generation policy', (f) => { f.resolution.generationPolicy.currentSpatialHead = 'b'.repeat(40); }],
  ['generation target authorization', (f) => { f.resolution.generationPolicy.currentProductionProviderTargetsAuthorized = true; }],
  ['unreconciled source', (f) => { f.inventory.authority.dependencyReconciliation.admittedSpatialHead = 'b'.repeat(40); }],
  ['wrong checkout', (f) => { f.actualHead = 'b'.repeat(40); }],
  ['transferred approval', (f) => { f.inventory.authority.dependencyReconciliation.predecessorEvidenceTransferred = true; }],
  ['authorized paid targets', (f) => { f.inventory.authority.dependencyReconciliation.paidProductionTargetsAuthorized = true; }],
  ['nonempty production targets', (f) => { f.inventory.productionTargets = ['forbidden']; }],
  ['missing explicit no-spend', (f) => { delete f.env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED; }],
  ['spend enabled', (f) => { f.env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED = 'true'; }],
  ['injected credential', (f) => { f.env.OPENAI_API_KEY = 'synthetic-test-only'; }],
  ['external provider selected', (f) => { f.env.ASSET_FACTORY_IMAGE_PROVIDER = 'openai'; }],
  ['live proof claimed', (f) => { f.readiness.deploymentReadiness.providerLiveSmoke.certified = true; }],
]) test(`receipt rejects ${name}`, () => { const input = fixture(); mutate(input); assert.throws(() => makeProviderContractReceipt(input)); });

// Shape-validation fixtures do not authorize dependency repinning or release.
test('receipt accepts a consistently reconciled PR without hardcoding its number', () => {
  const input = fixture();
  const nextPr = input.inventory.authority.spatialPr + 1;
  input.inventory.authority.spatialPr = nextPr;
  input.inventory.providerExecutionBoundary.spatialPr = nextPr;
  input.resolution.spatialPr = nextPr;
  input.resolution.generationPolicy.currentSpatialPr = nextPr;
  const receipt = makeProviderContractReceipt(input);
  assert.equal(receipt.spatialPr, nextPr);
  assert.equal(receipt.spatialHead, input.inventory.authority.recoveredSpatialHead);
  assert.equal(receipt.noSpend, true);
});

test('receipt rejects stale execution PR after the other authorities reconcile', () => {
  const input = fixture();
  const nextPr = input.inventory.authority.spatialPr + 1;
  input.inventory.authority.spatialPr = nextPr;
  input.resolution.spatialPr = nextPr;
  input.resolution.generationPolicy.currentSpatialPr = nextPr;
  assert.throws(() => makeProviderContractReceipt(input), /execution boundary PR drift/);
});

test('receipt rejects a missing execution-boundary PR', () => {
  const input = fixture();
  delete input.inventory.providerExecutionBoundary.spatialPr;
  assert.throws(() => makeProviderContractReceipt(input), /execution boundary PR drift/);
});

test('receipt rejects a stale reference-resolution PR', () => {
  const input = fixture();
  input.resolution.spatialPr += 1;
  assert.throws(() => makeProviderContractReceipt(input), /reference-resolution PR drift/);
});

test('receipt rejects a stale generation-policy PR', () => {
  const input = fixture();
  input.resolution.generationPolicy.currentSpatialPr += 1;
  assert.throws(() => makeProviderContractReceipt(input));
});

test('receipt rejects mutually absent PR identities', () => {
  const input = fixture();
  delete input.inventory.authority.spatialPr;
  delete input.inventory.providerExecutionBoundary.spatialPr;
  delete input.resolution.spatialPr;
  delete input.resolution.generationPolicy.currentSpatialPr;
  assert.throws(() => makeProviderContractReceipt(input), /valid recorded Spatial PR is required/);
});

test('receipt rejects aligned but malformed PR identities', () => {
  for (const invalid of [null, '', '1296', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const input = fixture();
    input.inventory.authority.spatialPr = invalid;
    input.inventory.providerExecutionBoundary.spatialPr = invalid;
    input.resolution.spatialPr = invalid;
    input.resolution.generationPolicy.currentSpatialPr = invalid;
    assert.throws(() => makeProviderContractReceipt(input), /valid recorded Spatial PR is required/);
  }
});
