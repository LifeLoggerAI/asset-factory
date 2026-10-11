import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const domains = ['animatic', 'likeness', 'rightsAndConsent', 'narration', 'narratorVoice', 'scoreDirection', 'privacyRetention'];
function sourceSchemaFixture() {
  // These deliberately artificial labels test schema shape only. They are not
  // signatures, human approval, budget authority or executable provider grants.
  return {
    schemaVersion: 'finite-time-final-render-authorization-v1', projectId: 'finite-time', chapterId: 'farm-to-lake',
    sourceCommit: 'a'.repeat(40), sourceManifestSha256: `sha256:${'b'.repeat(64)}`,
    approvals: Object.fromEntries(domains.map(name => [name, { artifactId: 'SOURCE_SCHEMA_FIXTURE_ONLY', artifactSha256: `sha256:${'c'.repeat(64)}`,
      approver: 'SOURCE_SCHEMA_FIXTURE_ONLY', approvedAt: '2026-10-08T00:00:00.000Z', authenticatedReference: 'SOURCE_SCHEMA_FIXTURE_ONLY', status: 'approved' }])),
    providers: [{ provider: 'SOURCE_SCHEMA_FIXTURE_ONLY', model: 'SOURCE_SCHEMA_FIXTURE_ONLY', modelVersion: 'SOURCE_SCHEMA_FIXTURE_ONLY',
      maxInitialCalls: 1, maxRetries: 0, maxCostPerCallUsd: 1, maxPhaseCostUsd: 1, trainingUse: 'prohibited',
      commercialUseReviewed: true, likenessRestrictionsReviewed: true, acceptanceCriteria: ['SOURCE_SCHEMA_FIXTURE_ONLY'] }],
    perShotCeilingUsd: 1, absoluteProjectCeilingUsd: 1, authorizedBy: 'SOURCE_SCHEMA_FIXTURE_ONLY',
    authorizedAt: '2026-10-08T00:00:00.000Z', authorizationReference: 'SOURCE_SCHEMA_FIXTURE_ONLY', finalRenderingAuthorized: true,
  };
}
function run(value, requireAuthorization = true) {
  const folder = mkdtempSync(join(tmpdir(), 'urai-final-render-source-schema-'));
  try {
    const file = join(folder, 'schema-fixture.json');
    writeFileSync(file, JSON.stringify(value));
    const result = spawnSync(process.execPath, [join(root, 'film_foundry/finite_time/validate-final-render-authorization.mjs'), file],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024, env: { ...process.env, FINITE_TIME_REQUIRE_FINAL_RENDER_AUTHORIZATION: requireAuthorization ? '1' : '0' } });
    return { exit: result.status, receipt: JSON.parse(result.stdout) };
  } finally { rmSync(folder, { recursive: true, force: true }); }
}
test('complete artificial fixture meets source schema only', () => {
  const result = run(sourceSchemaFixture());
  assert.equal(result.exit, 0);
  assert.equal(result.receipt.ready, true);
  assert.equal(result.receipt.sourceSchemaOnly, true);
  assert.equal(result.receipt.providerExecutionAuthorized, false);
});
test('empty approval object cannot omit every adopted approval domain', () => {
  const fixture = sourceSchemaFixture(); fixture.approvals = {};
  const result = run(fixture);
  assert.notEqual(result.exit, 0);
  assert.equal(result.receipt.ready, false);
});
for (const domain of domains) test(`missing ${domain} approval remains blocked`, () => {
  const fixture = sourceSchemaFixture(); delete fixture.approvals[domain];
  assert.notEqual(run(fixture).exit, 0);
});
test('approval arrays cannot masquerade as the named approval map', () => {
  const fixture = sourceSchemaFixture(); fixture.approvals = [];
  assert.notEqual(run(fixture).exit, 0);
});
for (const [name, field, value] of [
  ['fractional calls', 'maxInitialCalls', 1.5],
  ['coerced calls', 'maxInitialCalls', '1'],
  ['coerced retries', 'maxRetries', '0'],
  ['fractional retries', 'maxRetries', 0.5],
  ['nonfinite call ceiling', 'maxCostPerCallUsd', 'Infinity'],
  ['coerced phase ceiling', 'maxPhaseCostUsd', '1'],
]) test(`${name} cannot become bounded execution authority`, () => {
  const fixture = sourceSchemaFixture(); fixture.providers[0][field] = value;
  assert.notEqual(run(fixture).exit, 0);
});
test('nonfinite project ceiling cannot be admitted', () => {
  const fixture = sourceSchemaFixture(); fixture.absoluteProjectCeilingUsd = 'Infinity';
  assert.notEqual(run(fixture).exit, 0);
});
test('missing exact approval artifact identity remains blocked', () => {
  const fixture = sourceSchemaFixture(); delete fixture.approvals.narration.artifactId;
  assert.notEqual(run(fixture).exit, 0);
});
test('original unapproved template remains an explicitly no-spend source check', () => {
  const template = JSON.parse(readFileSync(join(root, 'film_foundry/finite_time/final-render-authorization.template.json'), 'utf8'));
  const result = run(template, false);
  assert.equal(result.exit, 0);
  assert.equal(result.receipt.ready, false);
  assert.equal(result.receipt.initialCalls, 0);
  assert.equal(result.receipt.retries, 0);
  assert.equal(result.receipt.absoluteProjectCeilingUsd, 0);
  assert.equal(result.receipt.providerExecutionAuthorized, false);
});
test('unknown approval domains cannot replace adopted domains', () => {
  const fixture = sourceSchemaFixture(); fixture.approvals.other = fixture.approvals.animatic;
  assert.notEqual(run(fixture).exit, 0);
});
test('blank approval identity does not become authenticated approval', () => {
  const fixture = sourceSchemaFixture(); fixture.approvals.privacyRetention.approver = '  ';
  assert.notEqual(run(fixture).exit, 0);
});
test('null approval records remain blocked', () => {
  const fixture = sourceSchemaFixture(); fixture.approvals.likeness = null;
  assert.notEqual(run(fixture).exit, 0);
});
for (const [name, value] of [['null', null], ['object', {}], ['array containing null', [null]]]) test(`${name} provider list cannot authorize rendering`, () => {
  const fixture = sourceSchemaFixture(); fixture.providers = value;
  const result = run(fixture);
  assert.notEqual(result.exit, 0);
  assert.equal(result.receipt.ready, false);
});
test('truthy text cannot satisfy explicit provider terms review', () => {
  const fixture = sourceSchemaFixture(); fixture.providers[0].commercialUseReviewed = 'true';
  assert.notEqual(run(fixture).exit, 0);
});
test('blank acceptance criteria cannot authorize a provider', () => {
  const fixture = sourceSchemaFixture(); fixture.providers[0].acceptanceCriteria = [''];
  assert.notEqual(run(fixture).exit, 0);
});
test('aggregate calls and retries cannot overflow integer bounds', () => {
  const fixture = sourceSchemaFixture(); fixture.providers[0].maxInitialCalls = Number.MAX_SAFE_INTEGER; fixture.providers[0].maxRetries = 1;
  assert.notEqual(run(fixture).exit, 0);
});
