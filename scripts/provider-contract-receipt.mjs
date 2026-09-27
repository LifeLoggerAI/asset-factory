import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const modalities = ['media', 'image', 'model3d', 'audio', 'sfx', 'music', 'stt', 'video'];
const credentialNames = ['OPENAI_API_KEY', 'REPLICATE_API_TOKEN', 'ELEVENLABS_API_KEY',
  'RUNWAYML_API_SECRET', 'RUNWAY_API_KEY', 'MESHY_API_KEY', 'FAL_KEY', 'STABILITY_API_KEY'];

export function makeProviderContractReceipt({ inventory, resolution, readiness, env, actualHead, sourceDigests }) {
  assert.match(env.TARGET_SHA || '', /^[0-9a-f]{40}$/, 'exact candidate SHA is required');
  assert.equal(actualHead, env.TARGET_SHA, 'checkout must equal the candidate SHA');
  const spatialHead = inventory.authority?.recoveredSpatialHead;
  assert.match(spatialHead || '', /^[0-9a-f]{40}$/, 'recorded Spatial source authority is required');
  assert.equal(inventory.providerExecutionBoundary?.spatialHead, spatialHead, 'execution boundary source drift');
  assert.equal(resolution.recoveredSpatialHead, spatialHead, 'reference-resolution source drift');
  assert.equal(resolution.generationPolicy?.currentSpatialHead, spatialHead, 'generation policy source drift');
  assert.equal(resolution.generationPolicy.currentSpatialPr, inventory.authority.spatialPr);
  assert.equal(resolution.generationPolicy.currentProductionProviderTargetsAuthorized, false);
  assert.equal(inventory.authority.dependencyReconciliation?.admittedSpatialHead, spatialHead, 'unreconciled dependency');
  assert.equal(inventory.authority.dependencyReconciliation.predecessorEvidenceTransferred, false);
  assert.equal(inventory.authority.dependencyReconciliation.paidProductionTargetsAuthorized, false);
  assert.match(inventory.providerExecutionBoundary.status, /^blocked-/);
  assert.deepEqual(inventory.productionTargets, []);
  assert.equal(env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED, 'false', 'explicit no-spend mode is required');
  for (const name of credentialNames) assert.ok(!env[name], `${name} must be absent`);
  const selectors = Object.fromEntries(modalities.map((modality) => {
    const provider = env[`ASSET_FACTORY_${modality.toUpperCase()}_PROVIDER`];
    assert.equal(provider, 'local-proof', `${modality} must stay local-proof`);
    return [modality, provider];
  }));
  assert.equal(readiness.spendAuthorized, false);
  assert.equal(readiness.deploymentReadiness.dedicatedProductionTarget.configured, false);
  assert.equal(readiness.deploymentReadiness.wif.configured, false);
  assert.equal(readiness.deploymentReadiness.providerLiveSmoke.certified, false);
  return {
    schemaVersion: 1,
    headSha: actualHead,
    spatialHead,
    workflowRunId: env.GITHUB_RUN_ID || null,
    workflowRunAttempt: env.GITHUB_RUN_ATTEMPT || null,
    workflowEvent: env.GITHUB_EVENT_NAME || 'local',
    authoritySourceDigests: sourceDigests,
    modelForgeExecutionBoundary: inventory.providerExecutionBoundary.status,
    modelForgeProductionTargets: inventory.productionTargets,
    noSpend: true,
    deploymentReadiness: {
      dedicatedProductionTargetConfigured: false,
      wifConfigured: false,
      providerLiveSmokeCertified: false,
    },
    selectors,
    providerSecretsInjected: false,
    result: 'contracts-passed',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = {
    inventory: 'model_forge/launch-model-inventory.json',
    resolution: 'model_forge/reference-resolution.json',
    readiness: 'artifacts/provider-contract/provider-readiness-local-proof.json',
  };
  const inputs = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, fs.readFileSync(value)]));
  const receipt = makeProviderContractReceipt({
    ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, JSON.parse(value)])),
    sourceDigests: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [paths[key], crypto.createHash('sha256').update(value).digest('hex')])),
    env: process.env,
    actualHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  });
  fs.writeFileSync('artifacts/provider-contract/receipt.json', `${JSON.stringify(receipt, null, 2)}\n`);
  console.log('PASS exact-head no-spend provider receipt');
}
