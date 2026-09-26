import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync(new URL('../model_forge/founder_digital_human/move-ai-provider-contract-v1.json', import.meta.url), 'utf8'));
const runtime = fs.readFileSync(new URL('../assetfactory-studio/lib/server/founderMoveAiRuntime.ts', import.meta.url), 'utf8');

assert.equal(contract.schemaVersion, 'urai-adam-move-ai-provider-contract-v1');
assert.equal(contract.status, 'adapter-implemented-execution-disabled');
assert.equal(contract.execution.enabledGate, 'ASSET_FACTORY_MOVE_AI_ENABLED');
assert.equal(contract.execution.spendGate, 'ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED');
assert.equal(contract.execution.outputUseGate, 'MOVE_AI_OUTPUT_USE_APPROVED');
assert.equal(contract.execution.subjectConsentRequired, true);
assert.equal(contract.usageBoundary.feedOutputIntoAnotherAiSystem, false);
assert.equal(contract.usageBoundary.runtimePromotion, false);
assert.equal(contract.adamCurrentSource.currentCanonicalVideoSuitableForGoldMasterMocap, false);

for (const required of [
  "https://api.move.ai/ugc/graphql",
  "MOVE_API_KEY",
  "ASSET_FACTORY_MOVE_AI_ENABLED",
  "ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED",
  "MOVE_AI_OUTPUT_USE_APPROVED",
  "explicitSubjectConsent",
  "createSingleCamTake",
  "createSingleCamJob",
  "getJob"
]) {
  assert.ok(runtime.includes(required), `Move AI runtime missing fail-closed contract marker: ${required}`);
}

assert.ok(!runtime.includes('MOVE_API_KEY='), 'Move API secret value must never be committed');
console.log('Adam Move AI provider contract passed');
