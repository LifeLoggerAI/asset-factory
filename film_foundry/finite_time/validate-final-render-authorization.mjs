import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] ?? 'film_foundry/finite_time/final-render-authorization.template.json');
const authorization = JSON.parse(readFileSync(path, 'utf8'));
const sha256 = /^sha256:[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const requiredApprovalDomains = ['animatic', 'likeness', 'rightsAndConsent', 'narration', 'narratorVoice', 'scoreDirection', 'privacyRetention'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonemptyString = value => typeof value === 'string' && value.trim().length > 0;
const positiveFiniteNumber = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const lockedSha256 = value => typeof value === 'string' && sha256.test(value);
const numberOrNull = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

assert.equal(authorization.schemaVersion, 'finite-time-final-render-authorization-v1');
assert.equal(authorization.projectId, 'finite-time');
assert.equal(authorization.chapterId, 'farm-to-lake');

const blockers = [];
if (typeof authorization.sourceCommit !== 'string' || !commit.test(authorization.sourceCommit)) blockers.push('source-commit-not-locked');
if (!lockedSha256(authorization.sourceManifestSha256)) blockers.push('source-manifest-not-locked');

const approvals = record(authorization.approvals) ? authorization.approvals : {};
if (!record(authorization.approvals)) blockers.push('approval-map-invalid');
for (const name of Object.keys(approvals)) {
  if (!requiredApprovalDomains.includes(name)) blockers.push(`${name}-approval-domain-unknown`);
}
for (const name of requiredApprovalDomains) {
  const approval = approvals[name];
  if (!Object.hasOwn(approvals, name) || !record(approval)) {
    blockers.push(`${name}-approval-missing`);
    continue;
  }
  if (approval.status !== 'approved') blockers.push(`${name}-not-approved`);
  if (!nonemptyString(approval.artifactId) || !lockedSha256(approval.artifactSha256)) blockers.push(`${name}-artifact-not-locked`);
  if (![approval.approver, approval.approvedAt, approval.authenticatedReference].every(nonemptyString)) blockers.push(`${name}-approval-incomplete`);
}

const providers = Array.isArray(authorization.providers) ? authorization.providers : [];
if (providers.length === 0) blockers.push('no-provider-model-authorized');
let initialCalls = 0;
let retries = 0;
for (const provider of providers) {
  if (!record(provider)) {
    blockers.push('provider-record-invalid');
    continue;
  }
  const validCalls = Number.isSafeInteger(provider.maxInitialCalls) && provider.maxInitialCalls > 0;
  const validRetries = Number.isSafeInteger(provider.maxRetries) && provider.maxRetries >= 0;
  if (validCalls) initialCalls += provider.maxInitialCalls;
  if (validRetries) retries += provider.maxRetries;
  if (![provider.provider, provider.model, provider.modelVersion].every(nonemptyString)) blockers.push('provider-model-version-incomplete');
  if (!validCalls) blockers.push('provider-call-ceiling-missing');
  if (!validRetries) blockers.push('provider-retry-ceiling-invalid');
  if (!positiveFiniteNumber(provider.maxCostPerCallUsd) || !positiveFiniteNumber(provider.maxPhaseCostUsd)) blockers.push('provider-cost-ceiling-missing');
  if (provider.trainingUse !== 'prohibited') blockers.push('provider-training-use-not-prohibited');
  if (provider.commercialUseReviewed !== true || provider.likenessRestrictionsReviewed !== true) blockers.push('provider-terms-review-incomplete');
  if (!Array.isArray(provider.acceptanceCriteria) || provider.acceptanceCriteria.length === 0 || !provider.acceptanceCriteria.every(nonemptyString)) blockers.push('provider-acceptance-criteria-missing');
}
if (!Number.isSafeInteger(initialCalls) || !Number.isSafeInteger(retries) || !Number.isSafeInteger(initialCalls + retries)) blockers.push('provider-total-call-ceiling-invalid');

if (!positiveFiniteNumber(authorization.perShotCeilingUsd)) blockers.push('per-shot-ceiling-missing');
if (!positiveFiniteNumber(authorization.absoluteProjectCeilingUsd)) blockers.push('absolute-project-ceiling-missing');
if (![authorization.authorizedBy, authorization.authorizedAt, authorization.authorizationReference].every(nonemptyString)) blockers.push('final-authorization-signature-incomplete');
if (authorization.finalRenderingAuthorized !== true) blockers.push('final-rendering-not-authorized');

const result = {
  ready: blockers.length === 0,
  sourceSchemaOnly: true,
  providerExecutionAuthorized: false,
  blockers: [...new Set(blockers)].sort(),
  initialCalls,
  retries,
  perShotCeilingUsd: numberOrNull(authorization.perShotCeilingUsd),
  absoluteProjectCeilingUsd: numberOrNull(authorization.absoluteProjectCeilingUsd)
};

console.log(JSON.stringify(result, null, 2));

if (process.env.FINITE_TIME_REQUIRE_FINAL_RENDER_AUTHORIZATION === '1') {
  assert.equal(result.ready, true, `Final rendering blocked: ${result.blockers.join(', ')}`);
} else {
  assert.equal(result.ready, false, 'Template must remain fail-closed until a separate signed authorization is supplied.');
  assert.equal(result.initialCalls, 0);
  assert.equal(result.retries, 0);
  assert.equal(result.absoluteProjectCeilingUsd, 0);
}
