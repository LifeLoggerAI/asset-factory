import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] ?? 'film_foundry/finite_time/final-render-authorization.template.json');
const authorization = JSON.parse(readFileSync(path, 'utf8'));
const sha256 = /^sha256:[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;

assert.equal(authorization.schemaVersion, 'finite-time-final-render-authorization-v1');
assert.equal(authorization.projectId, 'finite-time');
assert.equal(authorization.chapterId, 'farm-to-lake');

const blockers = [];
if (!commit.test(authorization.sourceCommit)) blockers.push('source-commit-not-locked');
if (!sha256.test(authorization.sourceManifestSha256)) blockers.push('source-manifest-not-locked');

for (const [name, approval] of Object.entries(authorization.approvals ?? {})) {
  if (approval.status !== 'approved') blockers.push(`${name}-not-approved`);
  if (!sha256.test(approval.artifactSha256 ?? '')) blockers.push(`${name}-artifact-not-locked`);
  if (!approval.approver || !approval.approvedAt || !approval.authenticatedReference) blockers.push(`${name}-approval-incomplete`);
}

if (!Array.isArray(authorization.providers) || authorization.providers.length === 0) blockers.push('no-provider-model-authorized');
let initialCalls = 0;
let retries = 0;
for (const provider of authorization.providers ?? []) {
  initialCalls += Number(provider.maxInitialCalls ?? 0);
  retries += Number(provider.maxRetries ?? 0);
  if (!provider.provider || !provider.model || !provider.modelVersion) blockers.push('provider-model-version-incomplete');
  if (!(provider.maxInitialCalls > 0)) blockers.push('provider-call-ceiling-missing');
  if (!(provider.maxRetries >= 0)) blockers.push('provider-retry-ceiling-invalid');
  if (!(provider.maxCostPerCallUsd > 0) || !(provider.maxPhaseCostUsd > 0)) blockers.push('provider-cost-ceiling-missing');
  if (provider.trainingUse !== 'prohibited') blockers.push('provider-training-use-not-prohibited');
  if (!provider.commercialUseReviewed || !provider.likenessRestrictionsReviewed) blockers.push('provider-terms-review-incomplete');
  if (!Array.isArray(provider.acceptanceCriteria) || provider.acceptanceCriteria.length === 0) blockers.push('provider-acceptance-criteria-missing');
}

if (!(authorization.perShotCeilingUsd > 0)) blockers.push('per-shot-ceiling-missing');
if (!(authorization.absoluteProjectCeilingUsd > 0)) blockers.push('absolute-project-ceiling-missing');
if (!authorization.authorizedBy || !authorization.authorizedAt || !authorization.authorizationReference) blockers.push('final-authorization-signature-incomplete');
if (authorization.finalRenderingAuthorized !== true) blockers.push('final-rendering-not-authorized');

const result = {
  ready: blockers.length === 0,
  blockers: [...new Set(blockers)].sort(),
  initialCalls,
  retries,
  perShotCeilingUsd: Number(authorization.perShotCeilingUsd ?? 0),
  absoluteProjectCeilingUsd: Number(authorization.absoluteProjectCeilingUsd ?? 0)
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
