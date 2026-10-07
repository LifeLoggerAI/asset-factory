import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cpSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { authenticateSpend, authenticateSpendWorker, canonical, hash, isDedicatedSpendProject, jobDigest, spendAction, spendGatewaySourceSha, spendRecord, spendSigningPolicy, SpendRejected } from '../assetfactory-studio/lib/server/productionSpend.ts';
import { ModelSpendClient, freezeRequest } from '../model_forge/model-spend-client.mjs';
import { syntheticCleanBuild } from './lib/studio-spend-test-fixture.mjs';

const NOW = Date.parse('2026-10-07T16:30:00Z');
const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const signing = record => ({ ...record, signature: sign(null, Buffer.from(canonical(record)), pair.privateKey).toString('base64') });
const chargePair = generateKeyPairSync('ed25519');
const chargePublicKey = chargePair.publicKey.export({ type: 'spki', format: 'pem' });
const chargeSigning = record => ({ ...record, signature: sign(null, Buffer.from(canonical(record)), chargePair.privateKey).toString('base64') });
const options = { sourceSha: 'a'.repeat(40), now: () => NOW, approvalKeys: { synthetic: { subject: 'synthetic-approver', publicKey } }, reconciliationKeys: { synthetic: { subject: 'synthetic-reconciler', publicKey: chargePublicKey } } };

/** Serialized transactional storage, shared between independently created clients. */
class Db {
  rows = new Map(); pending = Promise.resolve();
  doc(path) { return { path }; }
  runTransaction(fn) {
    const run = this.pending.then(async () => {
      const writes = new Map();
      const result = await fn({ get: async ref => ({ exists: this.rows.has(ref.path), data: () => structuredClone(this.rows.get(ref.path)) }), set: (ref, value) => writes.set(ref.path, structuredClone(value)) });
      for (const [path, value] of writes) this.rows.set(path, value);
      return result;
    });
    this.pending = run.catch(() => {}); return run;
  }
}

function fixture(db = new Db(), id = 'synthetic-pilot') {
  const binding = { repository: 'synthetic/fixture', sha: 'a'.repeat(40) };
  const rates = { usd_micros_per_unit: 1000000, credits_per_unit: 10, receipt: 'SYNTHETIC-PRICE', verified_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z' };
  const job = { schema_version: 1, job_id: id, provider: 'custom', account_id: 'synthetic-api', operation: 'render', model_version: 'synthetic-model', owner_lane: 'synthetic', consumer: 'synthetic', truth_class: 'GENERIC', rights_reviewed: true, authority: binding, input_sha256: ['b'.repeat(64)], reuse_review: { input_sha256: ['b'.repeat(64)], decision: 'MISSING_COMPONENT', receipt: 'SYNTHETIC-REUSE' }, acceptance: { stage: 'SPECIFIED', criteria: 'Synthetic fixture', verification: 'Synthetic verifier' }, expected_outputs: ['geometry', 'receipt'], budget: { currency: 'USD', max_usd_micros: 2500000, max_credits: 20, max_concurrency: 2, units: 1, max_retries: 1, max_runtime_seconds: 2, hard_stop_supported: true, auto_top_up: false, storage_egress_overhead_usd_micros: 100000, rates }, attempts: [], approval_ref: hash(`approval:${id}`), authority_ref: hash('authority'), pricing_ref: hash('pricing'), executor: { source_sha: 'a'.repeat(40), controls_ref: hash('controls'), request_sha256: hash('synthetic request'), endpoint: 'https://example.invalid/render', asset: 'synthetic-image', request_size: '64x64' } };
  const authority = { binding, trusted_readback: true, observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z' };
  Object.assign(job.executor, { credential_sha256: hash('SYNTHETIC-CREDENTIAL'), semantic_headers_sha256: hash('SYNTHETIC-HEADERS'), source_input_sha256: 'b'.repeat(64), semantic_input_sha256: hash(`semantic:${id}`), artifact_hosts: ['outputs.example.test'], content_type: 'application/json' });
  job.input_sha256.push(job.executor.request_sha256); job.reuse_review.input_sha256 = job.input_sha256;
  const account = { provider: job.provider, account_id: job.account_id, credential_sha256: job.executor.credential_sha256, credential_binding_verified: true, credential_binding_receipt: 'SYNTHETIC-ACCOUNT-MAP', balance_type: 'API', trusted_readback: true, frozen: false, max_concurrency: 2, available_usd_micros: 3000000, available_credits: 30, observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z', reservations: [] };
  const approval = { status: 'APPROVED', kind: 'EXPLICIT_BOUNDED_SPEND', receipt: 'SYNTHETIC-NOT-AUTHORIZATION', approver: 'synthetic-approver', issued_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z', job_digest: jobDigest(job), max_usd_micros: job.budget.max_usd_micros, max_credits: job.budget.max_credits, max_concurrency: 2, key_id: 'synthetic' };
  const controls = { artifact_hosts: ['outputs.example.test'], provider: job.provider, account_id: job.account_id, endpoint: job.executor.endpoint, request_sha256: job.executor.request_sha256, trusted_readback: true, hard_stop_supported: true, cost_cap_enforced: true, auto_top_up: false, max_runtime_seconds: 2, max_usd_micros: 2500000, max_credits: 20, max_concurrency: 2, proof_receipt: 'SYNTHETIC-CONTROL-PROOF', enforcement_source_sha: 'a'.repeat(40), observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z' };
  for (const field of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256', 'content_type']) controls[field] = job.executor[field];
  const jobPath = `assetFactorySpendJobs/${hash(id)}`, accountPath = `assetFactorySpendAccounts/${hash('custom\nsynthetic-api')}`;
  db.rows.set(jobPath, { job });
  if (!db.rows.has(accountPath)) db.rows.set(accountPath, account);
  db.rows.set(`assetFactorySpendApprovals/${job.approval_ref}`, signing(approval));
  db.rows.set(`assetFactorySpendAuthorities/${job.authority_ref}`, authority);
  const price = { provider: job.provider, account_id: job.account_id, model_version: job.model_version, request_sha256: job.executor.request_sha256, trusted_readback: true, receipt: 'SYNTHETIC-PRICE-PROOF', observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z', rates };
  for (const field of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256', 'content_type']) price[field] = job.executor[field];
  db.rows.set(`assetFactorySpendPricing/${job.pricing_ref}`, price);
  db.rows.set(`assetFactorySpendControls/${job.executor.controls_ref}`, controls);
  const input = { executor_source_sha: 'a'.repeat(40), account_id: job.account_id, credential_sha256: job.executor.credential_sha256, semantic_headers_sha256: job.executor.semantic_headers_sha256, source_input_sha256: job.executor.source_input_sha256, semantic_input_sha256: job.executor.semantic_input_sha256, content_type: job.executor.content_type, job_id: id, provider: job.provider, model: job.model_version, asset: job.executor.asset, request_size: job.executor.request_size, request_sha256: job.executor.request_sha256, endpoint: job.executor.endpoint, job_digest: jobDigest(job) };
  return { db, job, input, jobPath, accountPath, account, authority, approval, controls };
}
const act = (f, action, extra = {}, opts = options) => spendAction(f.db, action, { ...f.input, ...extra }, opts);
async function actualModelGatewayFixture({ delayedReserve = false, distinctSpecification = false } = {}) {
  const sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const endpoint = 'https://api.replicate.com/v1/models/synthetic/model/predictions', model = 'synthetic/model';
  const init = { method: 'POST', headers: { authorization: 'Bearer SYNTHETIC-PROVIDER-ONLY', 'content-type': 'application/json' }, body: '{"input":{"prompt":"synthetic"}}' };
  const request = await freezeRequest(endpoint, init, 'replicate'), f = fixture();
  let now = Date.now(), calls = 0;
  const observed = new Date(now - 60_000).toISOString(), expires = new Date(now + 600_000).toISOString();
  f.job.provider = 'replicate'; f.job.model_version = model;
  f.job.authority = distinctSpecification ? { repository: 'LifeLoggerAI/urai-reality', sha: 'b'.repeat(40) } : { repository: 'LifeLoggerAI/asset-factory', sha: sourceSha }; f.authority.binding = f.job.authority;
  Object.assign(f.job.executor, { source_sha: sourceSha, endpoint, request_sha256: request.request_sha256, request_size: request.request_size, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, semantic_input_sha256: request.semantic_input_sha256, content_type: request.content_type });
  f.job.input_sha256 = [f.job.executor.source_input_sha256, request.request_sha256]; f.job.reuse_review.input_sha256 = f.job.input_sha256;
  f.job.budget.max_runtime_seconds = 10;
  Object.assign(f.controls, { provider: f.job.provider, endpoint, request_sha256: request.request_sha256, enforcement_source_sha: sourceSha, max_runtime_seconds: 10, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, semantic_input_sha256: request.semantic_input_sha256 });
  Object.assign(f.account, { provider: f.job.provider, credential_sha256: request.credential_sha256 });
  f.accountPath = `assetFactorySpendAccounts/${hash(`${f.job.provider}\n${f.job.account_id}`)}`; f.db.rows.set(f.accountPath, f.account);
  const price = f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`);
  Object.assign(price, { provider: f.job.provider, model_version: model, request_sha256: request.request_sha256, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, semantic_input_sha256: request.semantic_input_sha256 });
  for (const proof of [f.approval, f.authority, f.controls, f.account, price, f.job.budget.rates]) { proof.expires_at = expires; proof[proof === f.approval ? 'issued_at' : proof === f.job.budget.rates ? 'verified_at' : 'observed_at'] = observed; }
  f.approval.job_digest = jobDigest(f.job); f.db.rows.set(`assetFactorySpendApprovals/${f.job.approval_ref}`, signing(f.approval));
  const gateway = 'https://synthetic-gateway.invalid/api/worker/production-spend';
  const env = { URAI_SOURCE_SHA: sourceSha, ASSET_FORGE_SPEND_GATEWAY_URL: gateway, ASSET_FORGE_SPEND_GATEWAY_ORIGIN: new URL(gateway).origin, ASSET_FORGE_SPEND_WORKER_TOKEN: 'SYNTHETIC-WORKER-NOT-AUTHORIZATION-ONLY', MODEL_FORGE_SPEND_JOB_IDS_JSON: JSON.stringify({ [request.request_sha256]: f.job.job_id }) };
  const client = () => new ModelSpendClient({ provider: 'replicate', asset: f.job.executor.asset, sourceSpecSha256: f.job.executor.source_input_sha256, env, now: () => now, fetchImpl: async (url, input) => {
    if (url === gateway) {
      const fields = JSON.parse(input.body), result = await spendAction(f.db, fields.action, fields, { ...options, sourceSha, now: () => now });
      if (delayedReserve && fields.action === 'reserve') now += 10_001;
      return Response.json(result);
    }
    assert.equal(url, endpoint); calls++; return Response.json({ id: 'SYNTHETIC-TASK' });
  } });
  return { f, client, endpoint, init, model, calls: () => calls };
}
test('actual Model Forge client consumes the actual signed gateway and global account transaction', async () => {
  const t = await actualModelGatewayFixture();
  const result = await t.client().submit(t.endpoint, t.init, t.model);
  assert.equal(result.payload.id, 'SYNTHETIC-TASK'); assert.equal(t.calls(), 1);
  assert.equal(t.f.db.rows.get(t.f.accountPath).reservations.length, 1);
  assert.equal(t.f.db.rows.get(t.f.jobPath).job.attempts[0].status, 'RECONCILIATION_REQUIRED');
  await assert.rejects(t.client().submit(t.endpoint, t.init, t.model)); assert.equal(t.calls(), 1);
});
test('actual gateway reservation delivered after expiry cannot cause an actual Model Forge POST', async () => {
  const t = await actualModelGatewayFixture({ delayedReserve: true });
  await assert.rejects(t.client().submit(t.endpoint, t.init, t.model), /deadline/);
  assert.equal(t.calls(), 0); assert.equal(t.f.db.rows.get(t.f.accountPath).reservations.length, 1);
  assert.equal(t.f.db.rows.get(t.f.jobPath).job.attempts[0].status, 'RESERVED');
});
test('actual Forge and gateway preserve accepted specification authority distinct from executing source', async () => {
  const t = await actualModelGatewayFixture({ distinctSpecification: true });
  assert.equal((await t.client().submit(t.endpoint, t.init, t.model)).payload.id, 'SYNTHETIC-TASK');
  assert.equal(t.calls(), 1);
  assert.equal(t.f.db.rows.get(t.f.jobPath).job.authority.repository, 'LifeLoggerAI/urai-reality');
  assert.equal(t.f.db.rows.get(t.f.jobPath).job.attempts[0].status, 'RECONCILIATION_REQUIRED');
});
function charge(f, attempt, status, usd = 400000, credits = 2, change = {}) {
  const receipt = chargeSigning({ job_id: f.job.job_id, attempt_id: attempt.attempt_id, provider: f.job.provider, account_id: f.job.account_id, job_digest: jobDigest(f.job), status, final: true, task_id: `SYNTHETIC-TASK-${attempt.attempt_id}`, actual_usd_micros: usd, actual_credits: credits, corrective_action: 'Synthetic reviewed correction', observed_at: '2026-10-07T16:30:00Z', reconciler: 'synthetic-reconciler', key_id: 'synthetic', ...change });
  const digest = hash(canonical(receipt)); f.db.rows.set(`assetFactorySpendChargeReceipts/${digest}`, receipt);
  return { attempt_id: attempt.attempt_id, receipt_sha256: digest };
}

test('authenticated worker auth is closed with missing short wrong or legacy authorization', () => {
  assert.equal(authenticateSpend(undefined, 'x'.repeat(32)), false);
  assert.equal(authenticateSpend('x', 'x'), false);
  assert.equal(authenticateSpend('x'.repeat(32), 'y'.repeat(32)), false);
  assert.equal(authenticateSpend('x'.repeat(32), 'x'.repeat(32)), true);
});
test('gateway preflight is read-only and matches actual pinned Python #229 including Unicode digest', async () => {
  const f = fixture(); f.job.acceptance.criteria = 'Synthetic café 😀';
  f.db.rows.get(`assetFactorySpendApprovals/${f.job.approval_ref}`).job_digest = jobDigest(f.job);
  const a = f.db.rows.get(`assetFactorySpendApprovals/${f.job.approval_ref}`); delete a.signature; f.db.rows.set(`assetFactorySpendApprovals/${f.job.approval_ref}`, signing(a));
  const before = canonical(f.db.rows.get(f.jobPath)); const result = await act(f, 'preflight');
  assert.equal(result.provider_call_authorized, false); assert.equal(result.execution_performed, false); assert.equal(canonical(f.db.rows.get(f.jobPath)), before); assert.equal(f.db.rows.get(f.accountPath).reservations.length, 0);
  const script = fileURLToPath(new URL('../image_asset_generator', import.meta.url));
  const python = spawnSync('python3', ['-c', 'import json,sys;sys.path.insert(0,sys.argv[1]);from spend_preflight_contract import check,instant;e=json.load(sys.stdin);print(json.dumps(check(e["job"],e["account"],e["authority"],instant("2026-10-07T16:30:00Z"))))', script], { input: JSON.stringify(result.envelope), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr); const receipt = JSON.parse(python.stdout); assert.equal(receipt.provider_call_authorized, false); assert.equal(receipt.job_digest, jobDigest(result.envelope.job));
});
test('forty independent clients racing same job create exactly one durable reservation', async () => {
  const f = fixture(); const results = await Promise.allSettled(Array.from({ length: 40 }, () => act(f, 'reserve')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.db.rows.get(f.jobPath).job.attempts.length, 1); assert.equal(f.db.rows.get(f.accountPath).reservations.length, 1);
});
test('distinct jobs and run identities share account budget, preventing oversubscription', async () => {
  const f = fixture(); const g = fixture(f.db, 'other-synthetic-run'); const results = await Promise.allSettled([act(f, 'reserve'), act(g, 'reserve')]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});
const rejects = [
  ['old executor source', f => { f.input.executor_source_sha = 'c'.repeat(40); }],
  ['enforcement proof from another build', f => { f.controls.enforcement_source_sha = 'c'.repeat(40); }],
  ['altered exact request', f => { f.input.request_sha256 = 'e'.repeat(64); }],
  ['changed endpoint', f => { f.input.endpoint += '/other'; }],
  ['changed model', f => { f.input.model = 'other'; }],
  ['unsigned self asserted approval', f => { delete f.db.rows.get(`assetFactorySpendApprovals/${f.job.approval_ref}`).signature; }],
  ['signed fields tampered', f => { f.db.rows.get(`assetFactorySpendApprovals/${f.job.approval_ref}`).max_usd_micros = 10000000; }],
  ['missing authority', f => { f.db.rows.delete(`assetFactorySpendAuthorities/${f.job.authority_ref}`); }],
  ['stale authority', f => { f.authority.expires_at = '2026-10-07T16:20:00Z'; }],
  ['invalid calendar authority date', f => { f.authority.observed_at = '2026-02-30T00:00:00Z'; }],
  ['date without complete ISO time', f => { f.controls.observed_at = '2026-10-07Z'; }],
  ['future balance', f => { f.account.observed_at = '2026-10-07T17:00:00Z'; }],
  ['subscription balance', f => { f.account.balance_type = 'SUBSCRIPTION'; }],
  ['hard stop missing', f => { f.controls.hard_stop_supported = false; }],
  ['cost cap not enforced', f => { f.controls.cost_cap_enforced = false; }],
  ['auto top up enabled', f => { f.controls.auto_top_up = true; }],
  ['pricing changed', f => { f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`).rates = { ...f.job.budget.rates, usd_micros_per_unit: 2 }; }],
  ['unsafe integer cost', f => { f.account.available_usd_micros = Number.MAX_SAFE_INTEGER + 1; }],
  ['boolean cost', f => { f.account.available_usd_micros = true; }],
  ['duplicate reservation', f => { f.account.reservations = [{ job_id: 'other', usd_micros: 0, credits: 0 }, { job_id: 'other', usd_micros: 0, credits: 0 }]; }],
  ['prior success replay', f => { f.job.attempts = [{ status: 'SUCCEEDED', task_id: 'synthetic', charges_reconciled: true }]; }],
  ['pending history replay', f => { f.job.attempts = [{ status: 'RESERVED', task_id: 'synthetic', charges_reconciled: false }]; }],
];
for (const [name, change] of rejects) test(name + ' cannot commit reservation', async () => { const f = fixture(); change(f); await assert.rejects(act(f, 'reserve')); assert.equal(f.db.rows.get(f.accountPath).reservations.some(r => r.job_id === f.job.job_id), false); });
test('missing or changed current gateway source cannot reserve', async () => { for (const sourceSha of ['', 'c'.repeat(40)]) { const f = fixture(); await assert.rejects(act(f, 'reserve', {}, { ...options, sourceSha }), SpendRejected); assert.equal(f.db.rows.get(f.accountPath).reservations.length, 0); } });
test('unconfigured authentic signer keys cannot reserve', async () => { const f = fixture(); await assert.rejects(act(f, 'reserve', {}, { ...options, approvalKeys: {} }), SpendRejected); });
test('malformed protected job and nested structures reject before any write', async () => {
  const changes = [
    f => { f.db.rows.set(f.jobPath, null); },
    f => { f.db.rows.get(f.jobPath).job = []; },
    ...['authority', 'reuse_review', 'acceptance', 'budget', 'executor'].map(field => f => { f.job[field] = null; }),
    f => { f.job.budget.rates = []; },
    f => { f.job.budget.max_usd_micros = true; },
    f => { f.job.attempts = [null]; },
    f => { f.account.reservations = [null]; },
  ];
  for (const change of changes) {
    const f = fixture(); change(f); const before = structuredClone(f.db.rows);
    await assert.rejects(act(f, 'reserve'), SpendRejected); assert.deepEqual(f.db.rows, before);
  }
});
test('present but malformed trusted Firestore records cannot authorize or write', async () => {
  for (const prefix of ['Approvals', 'Authorities', 'Pricing', 'Controls']) {
    for (const value of [null, [], false, 'untrusted']) {
      const f = fixture(), path = [...f.db.rows.keys()].find(key => key.startsWith(`assetFactorySpend${prefix}/`));
      f.db.rows.set(path, value); const before = structuredClone(f.db.rows);
      await assert.rejects(act(f, 'reserve'), SpendRejected); assert.deepEqual(f.db.rows, before);
    }
  }
});
test('malformed stored charge receipt retains the durable hold and pending attempt', async () => {
  const f = fixture(), attempt = await act(f, 'reserve'), digest = hash('SYNTHETIC-MALFORMED-RECEIPT');
  f.db.rows.set(`assetFactorySpendChargeReceipts/${digest}`, null); const before = structuredClone(f.db.rows);
  await assert.rejects(act(f, 'reconcile', { attempt_id: attempt.attempt_id, receipt_sha256: digest }), SpendRejected);
  assert.deepEqual(f.db.rows, before); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 2500000);
});
test('worker success is not charge truth, holds funds and does not allow another call', async () => {
  const f = fixture(); const a = await act(f, 'reserve'); await act(f, 'record', { attempt_id: a.attempt_id, status: 'succeeded', request_id: 'synthetic-id', actual_usd_micros: 0 });
  const attempt = f.db.rows.get(f.jobPath).job.attempts[0]; assert.equal(attempt.status, 'RECONCILIATION_REQUIRED'); assert.equal(attempt.charges_reconciled, false); assert.equal(attempt.actual_usd_micros, undefined); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 2500000); await assert.rejects(act(f, 'reserve'));
});
test('signed charge receipt settles success and prevents duplicate generation permanently', async () => {
  const f = fixture(); const a = await act(f, 'reserve'); const result = await act(f, 'reconcile', charge(f, a, 'SUCCEEDED')); assert.equal(result.terminal, true); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 400000); await assert.rejects(act(f, 'reserve')); await assert.rejects(act(f, 'reconcile', charge(f, a, 'SUCCEEDED')));
});
test('settled debit identity cannot collide with a different job or reopen a consumed hold', async () => {
  const f = fixture(); const a = await act(f, 'reserve'); await act(f, 'reconcile', charge(f, a, 'SUCCEEDED'));
  const account = f.db.rows.get(f.accountPath); account.available_usd_micros = 500000; account.available_credits = 3;
  function boundedToActual(g) {
    g.job.budget.max_usd_micros = 400000; g.job.budget.max_credits = 2;
    g.job.budget.rates.usd_micros_per_unit = 100000; g.job.budget.rates.credits_per_unit = 1;
    g.controls.max_usd_micros = 400000; g.controls.max_credits = 2;
    g.input.job_digest = jobDigest(g.job);
    g.db.rows.set(`assetFactorySpendApprovals/${g.job.approval_ref}`, signing({ ...g.approval, job_digest: g.input.job_digest, max_usd_micros: 400000, max_credits: 2 }));
  }
  const other = fixture(f.db, `settled:${f.job.job_id}`); boundedToActual(other);
  await assert.rejects(act(other, 'reserve'), SpendRejected);
  // Even a protected-writer history reset cannot consume the same settled debit again.
  const reopened = fixture(f.db, f.job.job_id); boundedToActual(reopened);
  await assert.rejects(act(reopened, 'reserve'), SpendRejected);
  assert.equal(f.db.rows.get(f.accountPath).reservations.length, 1);
});
test('only signed final failed charge reconciliation enables one corrective retry', async () => {
  const f = fixture(); const a = await act(f, 'reserve'); await act(f, 'record', { attempt_id: a.attempt_id, status: 'failed' }); await assert.rejects(act(f, 'reserve'));
  await act(f, 'reconcile', charge(f, a, 'FAILED')); const b = await act(f, 'reserve'); assert.notEqual(a.attempt_id, b.attempt_id); const r = await act(f, 'reconcile', charge(f, b, 'FAILED')); assert.equal(r.terminal, true); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 800000); await assert.rejects(act(f, 'reserve'));
});
test('duplicate provider task cannot reconcile a different corrective attempt', async () => { const f = fixture(); const a = await act(f, 'reserve'); const first = charge(f, a, 'FAILED'); await act(f, 'reconcile', first); const b = await act(f, 'reserve'); const firstReceipt = f.db.rows.get(`assetFactorySpendChargeReceipts/${first.receipt_sha256}`); const duplicated = charge(f, b, 'FAILED', 400000, 2, { task_id: firstReceipt.task_id }); await assert.rejects(act(f, 'reconcile', duplicated), SpendRejected); assert.equal(f.db.rows.get(f.jobPath).job.attempts[1].charges_reconciled, false); });
test('unsigned or foreign charge receipts cannot release held funds', async () => {
  for (const change of [{ job_id: 'foreign' }, { account_id: 'foreign' }, { final: false }, { reconciler: 'forged' }]) { const f = fixture(); const a = await act(f, 'reserve'); const args = charge(f, a, 'SUCCEEDED', 400000, 2, change); await assert.rejects(act(f, 'reconcile', args)); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 2500000); }
});
test('actual overrun is recorded truthfully, freezes account and rejects future spend', async () => {
  const f = fixture(); const a = await act(f, 'reserve'); const result = await act(f, 'reconcile', charge(f, a, 'SUCCEEDED', 4000000, 30)); assert.equal(result.cap_overrun, true); assert.equal(f.db.rows.get(f.accountPath).frozen, true); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 4000000); const g = fixture(f.db, 'after-overrun'); await assert.rejects(act(g, 'reserve'));
});
test('request authority changing after preflight is revalidated at the atomic reserve', async () => {
  const f = fixture(); await act(f, 'preflight'); f.authority.binding.sha = 'c'.repeat(40); await assert.rejects(act(f, 'reserve'));
});

async function route(f, envChange = {}, runtime = {}) {
  const env = { ASSET_FACTORY_SPEND_WORKER_TOKEN: 'synthetic-worker-'.repeat(4), ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN: 'synthetic-reconciler-'.repeat(4), ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-dedicated', FIREBASE_PROJECT_ID: 'synthetic-dedicated', URAI_SOURCE_SHA: 'a'.repeat(40), ASSET_FACTORY_SPEND_APPROVER_PUBLIC_KEYS: JSON.stringify(options.approvalKeys), ASSET_FACTORY_SPEND_RECONCILER_PUBLIC_KEYS: JSON.stringify(options.reconciliationKeys), ...envChange };
  f.db.projectId = runtime.projectId || 'synthetic-dedicated'; let initializations = 0;
  const context = vm.createContext({ process: { env }, Buffer, AbortSignal: runtime.AbortSignal || AbortSignal, Date: class extends Date { static now() { return runtime.now ? runtime.now() : NOW; } } });
  const next = { NextRequest: class {}, NextResponse: { json: (data, args = {}) => ({ data, status: args.status || 200 }) } };
  const sources = {
    'next/server': next,
    '@/lib/server/firebaseAdmin': { getAdminDb: () => { initializations++; return f.db; } },
    '@/lib/server/productionSpend': { authenticateSpend, authenticateSpendWorker, isDedicatedSpendProject, spendAction, spendGatewaySourceSha: runtime.verifySource || (() => options.sourceSha), spendRecord, SpendRejected },
  };
  const source = stripTypeScriptTypes(readFileSync(new URL('../assetfactory-studio/app/api/worker/production-spend/route.ts', import.meta.url), 'utf8'), { mode: 'strip' });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async specifier => { const values = sources[specifier]; return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); });
  await module.evaluate();
  const postRequest = request => module.namespace.POST(request);
  const post = async (body, token = env.ASSET_FACTORY_SPEND_WORKER_TOKEN) => postRequest(new Request('https://synthetic-gateway.invalid/api/worker/production-spend', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { post, postRequest, env, initializations: () => initializations };
}
test('actual HTTP route refuses oversized declarations without opening the body or Firestore', async () => {
  const f = fixture(), r = await route(f);
  const request = new Request('https://synthetic-gateway.invalid/api/worker/production-spend', { method: 'POST', headers: { 'content-length': '65537' }, body: 'x' });
  const result = await r.postRequest(request);
  assert.equal(result.status, 413); assert.equal(result.data.provider_call_authorized, false);
  assert.equal(request.bodyUsed, false); assert.equal(r.initializations(), 0);
});
test('actual HTTP route cancels chunked overflow before reading further bytes or opening Firestore', async () => {
  const f = fixture(), r = await route(f); let pulls = 0, cancelled = false;
  const chunks = [Buffer.alloc(32768, 32), Buffer.alloc(32768, 32), Buffer.from(' '), Buffer.alloc(65536, 32)];
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(chunks[pulls++]); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const request = new Request('https://synthetic-gateway.invalid/api/worker/production-spend', { method: 'POST', body: stream, duplex: 'half' });
  const result = await r.postRequest(request);
  assert.equal(result.status, 413); assert.equal(result.data.provider_call_authorized, false);
  assert.equal(pulls, 3); assert.equal(cancelled, true); assert.equal(stream.locked, false); assert.equal(r.initializations(), 0);
});
test('actual HTTP route bounds streamed bytes despite absent false or malformed content-length', async () => {
  for (const declared of [undefined, '0', '1', '-1', 'NaN']) {
    const f = fixture(), r = await route(f), headers = declared === undefined ? {} : { 'content-length': declared };
    const request = new Request('https://synthetic-gateway.invalid/api/worker/production-spend', { method: 'POST', headers, body: Buffer.alloc(65537, 32) });
    const result = await r.postRequest(request);
    assert.equal(result.status, 413); assert.equal(result.data.provider_call_authorized, false); assert.equal(r.initializations(), 0);
  }
  const f = fixture(), r = await route(f), result = await r.post('"' + '😀'.repeat(16384) + '"');
  assert.equal(result.status, 413); assert.equal(r.initializations(), 0);
});
test('actual HTTP route accepts exactly 64 KiB split across streaming chunks', async () => {
  const f = fixture(), r = await route(f), raw = JSON.stringify({ ...f.input, action: 'preflight' });
  const bytes = Buffer.from(raw + ' '.repeat(65536 - Buffer.byteLength(raw))); let offset = 0;
  const stream = new ReadableStream({ pull(controller) { if (offset === bytes.length) return controller.close(); const next = Math.min(offset + 137, bytes.length); controller.enqueue(bytes.subarray(offset, next)); offset = next; } });
  const request = new Request('https://synthetic-gateway.invalid/api/worker/production-spend', { method: 'POST', headers: { authorization: `Bearer ${r.env.ASSET_FACTORY_SPEND_WORKER_TOKEN}` }, body: stream, duplex: 'half' });
  const result = await r.postRequest(request);
  assert.equal(result.status, 200); assert.equal(result.data.provider_call_authorized, false); assert.equal(r.initializations(), 1);
  assert.equal(f.db.rows.get(f.accountPath).reservations.length, 0);
});
test('actual HTTP route cancels aborted and timed-out body streams without opening Firestore', async () => {
  for (const expired of [false, true]) {
    const f = fixture(), controller = new AbortController(); let cancelled = false;
    const timeout = expired ? { any: AbortSignal.any.bind(AbortSignal), timeout(ms) { assert.equal(ms, 15000); return AbortSignal.timeout(15); } } : AbortSignal;
    const r = await route(f, {}, { AbortSignal: timeout });
    const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const request = new Request('https://synthetic-gateway.invalid/api/worker/production-spend', { method: 'POST', body: stream, duplex: 'half', signal: controller.signal });
    const keepalive = setTimeout(() => {}, 1000);
    try {
      const response = r.postRequest(request); if (!expired) controller.abort();
      const result = await response;
      assert.equal(result.status, 408); assert.equal(result.data.provider_call_authorized, false); assert.equal(cancelled, true); assert.equal(stream.locked, false); assert.equal(r.initializations(), 0);
    } finally { clearTimeout(keepalive); }
  }
});
test('actual HTTP route rejects absent and broken streams without opening Firestore', async () => {
  for (const body of [undefined, new ReadableStream({ pull(controller) { controller.error(new Error('synthetic body failure')); } })]) {
    const f = fixture(), r = await route(f), request = new Request('https://synthetic-gateway.invalid/api/worker/production-spend', { method: 'POST', body, ...(body ? { duplex: 'half' } : {}) });
    const result = await r.postRequest(request);
    assert.equal(result.status, body ? 503 : 400); assert.equal(result.data.provider_call_authorized, false); assert.equal(r.initializations(), 0);
  }
});
test('actual HTTP route rejects missing/wrong credentials before opening Firestore', async () => {
  const f = fixture(), r = await route(f); const result = await r.post({ ...f.input, action: 'reserve' }, 'wrong'); assert.equal(result.status, 401); assert.equal(r.initializations(), 0);
});
test('actual HTTP route rejects non-object bodies and non-string actions before opening Firestore', async () => {
  for (const payload of ['null', '[]', 'false', '3', '"scalar"', '{}', '{"action":[]}']) {
    const f = fixture(), r = await route(f), result = await r.post(payload);
    assert.equal(result.status, 409); assert.equal(result.data.provider_call_authorized, false); assert.equal(r.initializations(), 0);
  }
});
test('actual HTTP route validates individual signer records before admission', async () => {
  for (const value of [null, [], { subject: 7, publicKey }, { subject: 'synthetic-approver', publicKey: false }]) {
    const f = fixture(), r = await route(f, { ASSET_FACTORY_SPEND_APPROVER_PUBLIC_KEYS: JSON.stringify({ synthetic: value }) });
    const before = structuredClone(f.db.rows), result = await r.post({ ...f.input, action: 'reserve' });
    assert.equal(result.status, 409); assert.equal(result.data.provider_call_authorized, false); assert.deepEqual(f.db.rows, before);
  }
});
test('actual HTTP transaction adapter supplies SDK-owned references on every read and write', async () => {
  const f = fixture(), marker = Symbol('SDK reference'), run = f.db.runTransaction;
  let reads = 0, writes = 0;
  f.db.doc = path => ({ path, owner: marker });
  f.db.runTransaction = fn => run.call(f.db, tx => fn({
    get: ref => { assert.equal(ref.owner, marker); reads++; return tx.get(ref); },
    set: (ref, value) => { assert.equal(ref.owner, marker); writes++; return tx.set(ref, value); },
  }));
  const r = await route(f), result = await r.post({ ...f.input, action: 'reserve' });
  assert.equal(result.status, 200); assert.equal(reads, 7); assert.equal(writes, 3);
  assert.equal(f.db.rows.get(f.jobPath).job.attempts.length, 1);
});
test('actual HTTP route blocks shared/mismatched store and missing exact deployment source', async () => {
  for (const change of [{ ASSET_FACTORY_FIREBASE_PROJECT_ID: '' }, { FIREBASE_PROJECT_ID: 'other' }, ...['urai-4dc1d', 'asset-factory-dev-id', 'geturai-landing-hub'].map(project => ({ ASSET_FACTORY_FIREBASE_PROJECT_ID: project, FIREBASE_PROJECT_ID: project })), { URAI_SOURCE_SHA: '' }]) { const f = fixture(), r = await route(f, change); const result = await r.post({ ...f.input, action: 'reserve' }); assert.equal(result.status, 503); assert.equal(r.initializations(), 0); }
});
test('actual HTTP route preserves non-authorizing preflight and invokes protected reserve', async () => {
  const f = fixture(), r = await route(f); const result = await r.post({ ...f.input, action: 'preflight' }); assert.equal(result.status, 200); assert.equal(result.data.provider_call_authorized, false); const reserved = await r.post({ ...f.input, action: 'reserve' }); assert.equal(reserved.status, 200); assert.equal(reserved.data.execution_performed, false); assert.equal(f.db.rows.get(f.jobPath).job.attempts.length, 1);
});
test('actual HTTP reconciliation route requires a distinct independently authenticated actor', async () => {
  const f = fixture(), r = await route(f); const a = await act(f, 'reserve'); const fields = { ...f.input, action: 'reconcile', ...charge(f, a, 'SUCCEEDED') }; assert.equal((await r.post(fields)).status, 401); assert.equal((await r.post(fields, r.env.ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN)).status, 200);
  const same = await route(f, { ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN: r.env.ASSET_FACTORY_SPEND_WORKER_TOKEN }); assert.equal((await same.post(fields)).status, 503);
});

// Independent synthetic verifier credentials exist only in this test process.
const verifierPair = generateKeyPairSync('ed25519');
const verifierPublicKey = verifierPair.publicKey.export({ type: 'spki', format: 'pem' });
const proofSign = record => ({ ...record, signature: sign(null, Buffer.from(canonical(record)), verifierPair.privateKey).toString('base64') });
function refreshCrossProofs(f) {
  const deployment = proofSign(f.deployment), controls = proofSign(f.controls);
  f.job.executor.deployment_ref = hash(canonical(deployment)); f.job.executor.controls_ref = hash(canonical(controls));
  f.db.rows.set(`assetFactorySpendDeployments/${f.job.executor.deployment_ref}`, deployment);
  f.db.rows.set(`assetFactorySpendControls/${f.job.executor.controls_ref}`, controls);
  f.input.job_digest = jobDigest(f.job);
  f.db.rows.set(`assetFactorySpendApprovals/${f.job.approval_ref}`, signing({ ...f.approval, job_digest: f.input.job_digest }));
}
function crossFixture(db, id) {
  const f = fixture(db, id);
  const source = 'd'.repeat(40), tenant = hash('SYNTHETIC-TENANT'), credential = hash('SYNTHETIC-CREDENTIAL');
  f.worker = { id: 'synthetic-spatial-worker', executor_repository: 'LifeLoggerAI/urai-spatial', executor_source_sha: source, consumer: 'spatial-functions', tenant_sha256: tenant, provider: f.job.provider, account_id: f.job.account_id, credential_sha256: credential };
  f.job.consumer = f.worker.consumer; f.job.authority = { repository: f.worker.executor_repository, sha: source }; f.authority.binding = f.job.authority;
  f.account.credential_sha256 = credential;
  f.job.input_sha256 = ['b'.repeat(64), f.job.executor.request_sha256]; f.job.reuse_review.input_sha256 = f.job.input_sha256;
  Object.assign(f.job.executor, { binding_version: 2, repository: f.worker.executor_repository, source_sha: source, gateway_repository: 'LifeLoggerAI/asset-factory', gateway_source_sha: options.sourceSha, worker_id: f.worker.id, tenant_sha256: tenant, credential_sha256: credential, source_input_sha256: 'b'.repeat(64), semantic_input_sha256: hash(`semantic:${id}`), artifact_hosts: ['outputs.example.test'], semantic_headers_sha256: hash('SYNTHETIC-HEADERS'), content_type: 'application/json' });
  const binding = { job_id: f.job.job_id, worker_id: f.worker.id, executor_repository: f.worker.executor_repository, executor_source_sha: source, gateway_repository: 'LifeLoggerAI/asset-factory', gateway_source_sha: options.sourceSha, consumer: f.job.consumer, tenant_sha256: tenant, provider: f.job.provider, account_id: f.job.account_id, credential_sha256: credential, source_input_sha256: 'b'.repeat(64), semantic_input_sha256: hash(`semantic:${id}`), semantic_headers_sha256: f.job.executor.semantic_headers_sha256, content_type: 'application/json', request_sha256: f.job.executor.request_sha256, endpoint: f.job.executor.endpoint, model: f.job.model_version, asset: f.job.executor.asset, request_size: f.job.executor.request_size };
  Object.assign(f.input, binding);
  const proof = { binding, verified: true, trusted_readback: true, deployment_id: `SYNTHETIC-DEPLOYMENT-${f.job.job_id}`, proof_receipt: 'SYNTHETIC-VERIFIED-READBACK-NOT-PRODUCTION', verifier: 'synthetic-verifier', key_id: 'verifier', observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z' };
  f.deployment = structuredClone(proof); Object.assign(f.controls, structuredClone(proof));
  for (const field of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256', 'content_type']) f.controls[field] = f.job.executor[field];
  for (const field of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256', 'content_type']) f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`)[field] = f.job.executor[field];
  f.opts = { ...options, worker: f.worker, verifierKeys: { verifier: { subject: 'synthetic-verifier', publicKey: verifierPublicKey } } };
  refreshCrossProofs(f); return f;
}
test('scoped cross-repository admission pins distinct real gateway and executor sources', async () => {
  const f = crossFixture(); const p = await act(f, 'preflight', {}, f.opts);
  assert.equal(p.provider_call_authorized, false); assert.equal(p.execution_performed, false);
  const a = await act(f, 'reserve', {}, f.opts);
  assert.equal(a.executor_source_sha, 'd'.repeat(40)); assert.equal(a.gateway_source_sha, 'a'.repeat(40)); assert.equal(a.worker_id, f.worker.id);
  assert.equal(f.db.rows.get(f.accountPath).reservations.length, 1);
});
test('independently signed v2 executors share the same atomic account concurrency cap', async () => {
  const db = new Db(), clients = Array.from({ length: 21 }, (_, i) => crossFixture(db, `SYNTHETIC-V2-CAP-${i}`));
  for (const f of clients) {
    f.account.available_usd_micros = 100000000; f.account.available_credits = 1000; f.account.max_concurrency = 1;
    f.job.budget.max_concurrency = 1; f.approval.max_concurrency = 1; f.controls.max_concurrency = 1;
    refreshCrossProofs(f);
  }
  const results = await Promise.allSettled(clients.map(f => act(f, 'reserve', {}, f.opts)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(db.rows.get(clients[0].accountPath).reservations.length, 1);
});
test('v2 legacy shared token cannot snapshot record preflight or reserve', async () => {
  for (const action of ['snapshot', 'record', 'preflight', 'reserve']) { const f = crossFixture(); const before = structuredClone(f.db.rows); await assert.rejects(act(f, action, {}, { ...f.opts, worker: undefined }), SpendRejected); assert.deepEqual(f.db.rows, before); }
});
test('authenticated worker identity cannot be spoofed in request labels or cross-job reads', async () => {
  for (const action of ['snapshot', 'record', 'preflight', 'reserve']) {
    const f = crossFixture(); const before = structuredClone(f.db.rows);
    await assert.rejects(act(f, action, { worker_id: f.worker.id }, { ...f.opts, worker: { ...f.worker, id: 'other-worker' } }), SpendRejected); assert.deepEqual(f.db.rows, before);
  }
});
test('v2 tokens cannot access legacy jobs and partial v2 cannot downgrade', async () => {
  const f = crossFixture(), legacy = fixture(); await assert.rejects(act(legacy, 'snapshot', {}, f.opts), SpendRejected);
  delete f.job.executor.binding_version; await assert.rejects(act(f, 'snapshot', {}, f.opts), SpendRejected);
});
test('worker fixed repository head consumer tenant account and credential scopes are enforced', async () => {
  for (const field of ['executor_repository', 'executor_source_sha', 'consumer', 'tenant_sha256', 'provider', 'account_id', 'credential_sha256']) {
    const f = crossFixture(), before = structuredClone(f.db.rows); await assert.rejects(act(f, 'reserve', {}, { ...f.opts, worker: { ...f.worker, [field]: 'foreign' } }), SpendRejected); assert.deepEqual(f.db.rows, before);
  }
});
test('cross-repo verifier must be configured trusted and independent of approval/reconciliation', async () => {
  for (const verifierKeys of [{}, { verifier: { subject: 'foreign-verifier', publicKey: verifierPublicKey } }, { verifier: { subject: 'synthetic-verifier', publicKey } }]) { const f = crossFixture(); await assert.rejects(act(f, 'snapshot', {}, { ...f.opts, verifierKeys }), SpendRejected); }
});
test('signed approval covers every executor binding before snapshot or record', async () => {
  for (const action of ['snapshot', 'record']) { const f = crossFixture(); f.job.executor.asset += '-tampered'; await assert.rejects(act(f, action, {}, f.opts), SpendRejected); }
});
test('deployment and control proofs need authentic signatures and exact digest refs', async () => {
  for (const prefix of ['Deployments', 'Controls']) for (const tamper of ['signature', 'verified', 'proof_receipt']) {
    const f = crossFixture(); const ref = prefix === 'Deployments' ? f.job.executor.deployment_ref : f.job.executor.controls_ref;
    const stored = f.db.rows.get(`assetFactorySpend${prefix}/${ref}`); delete stored[tamper]; await assert.rejects(act(f, 'snapshot', {}, f.opts), SpendRejected);
  }
});
test('even correctly signed expired future replayed or mismatched deployment proofs reject', async () => {
  const mutations = [f => { f.deployment.expires_at = '2026-10-07T16:29:59Z'; }, f => { f.controls.observed_at = '2026-10-07T16:30:01Z'; }, f => { f.deployment.binding.job_id = 'another-job'; }, f => { f.controls.deployment_id = 'another-deployment'; }, f => { f.deployment.binding.gateway_source_sha = 'e'.repeat(40); }, f => { f.controls.enforcement_source_sha = 'e'.repeat(40); }, f => { f.controls.binding.executor_source_sha = 'e'.repeat(40); }, f => { f.controls.verified = false; }, f => { f.deployment.trusted_readback = false; }];
  for (const change of mutations) { const f = crossFixture(); change(f); refreshCrossProofs(f); await assert.rejects(act(f, 'snapshot', {}, f.opts), SpendRejected); }
});
test('actual endpoint model input headers content size credential and head drift reject', async () => {
  for (const field of ['endpoint', 'model', 'source_input_sha256', 'semantic_input_sha256', 'semantic_headers_sha256', 'credential_sha256', 'content_type', 'request_size', 'request_sha256', 'executor_source_sha', 'gateway_source_sha', 'tenant_sha256', 'consumer']) { const f = crossFixture(), before = structuredClone(f.db.rows); await assert.rejects(act(f, 'reserve', { [field]: 'changed' }, f.opts), SpendRejected); assert.deepEqual(f.db.rows, before); }
});
test('cross-repository jobs still share one global account budget', async () => {
  const f = crossFixture(undefined, 'spatial-job'), g = crossFixture(f.db, 'jobs-job');
  const results = await Promise.allSettled([act(f, 'reserve', {}, f.opts), act(g, 'reserve', {}, g.opts)]); assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
});
test('cross-repo observations retain full holds and only independently signed charges settle', async () => {
  const f = crossFixture(), a = await act(f, 'reserve', {}, f.opts);
  await act(f, 'record', { attempt_id: a.attempt_id, status: 'succeeded', request_id: 'SYNTHETIC-STREAM-COMPLETE' }, f.opts);
  assert.equal(f.db.rows.get(f.jobPath).job.attempts[0].status, 'RECONCILIATION_REQUIRED'); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 2500000);
  await assert.rejects(act(f, 'reserve', {}, f.opts), SpendRejected);
  const settled = await act(f, 'reconcile', charge(f, a, 'SUCCEEDED'), { ...f.opts, worker: undefined }); assert.equal(settled.terminal, true);
});
test('protected token registry rejects ambiguous short reused and reconciliation tokens', () => {
  const f = crossFixture(); const registration = { ...f.worker, token: 'unique-synthetic-worker-token-'.repeat(2) }; delete registration.id;
  assert.equal(authenticateSpendWorker({ [f.worker.id]: registration }, registration.token, 'legacy', 'reconciler').id, f.worker.id);
  assert.equal(authenticateSpendWorker({ [f.worker.id]: registration }, 'wrong', 'legacy', 'reconciler'), undefined);
  for (const registry of [{ one: { ...registration, token: 'short' } }, { one: registration, two: registration }]) assert.throws(() => authenticateSpendWorker(registry, registration.token, 'legacy', 'reconciler'), SpendRejected);
  assert.throws(() => authenticateSpendWorker({ one: registration }, registration.token, registration.token, 'reconciler'), SpendRejected);
  assert.throws(() => authenticateSpendWorker({ one: registration }, registration.token, 'legacy', registration.token), SpendRejected);
});
test('actual HTTP route binds registry scope and denies legacy v2 spoofing before exposure', async () => {
  const f = crossFixture(), token = 'unique-synthetic-spatial-token-'.repeat(2), registration = { ...f.worker, token }; delete registration.id;
  const r = await route(f, { ASSET_FACTORY_SPEND_WORKER_TOKENS_JSON: JSON.stringify({ [f.worker.id]: registration }), ASSET_FACTORY_SPEND_VERIFIER_PUBLIC_KEYS: JSON.stringify(f.opts.verifierKeys) });
  assert.equal((await r.post({ ...f.input, action: 'snapshot', worker_id: f.worker.id })).status, 409);
  assert.equal((await r.post({ ...f.input, action: 'snapshot' }, token)).status, 200);
  assert.equal((await r.post({ ...f.input, action: 'reserve' }, token)).status, 200);
  const other = await route(f, { ASSET_FACTORY_SPEND_WORKER_TOKENS_JSON: JSON.stringify({ foreign: registration }), ASSET_FACTORY_SPEND_VERIFIER_PUBLIC_KEYS: JSON.stringify(f.opts.verifierKeys) });
  assert.equal((await other.post({ ...f.input, action: 'record', attempt_id: f.db.rows.get(f.jobPath).job.attempts[0].attempt_id, status: 'succeeded', worker_id: f.worker.id }, token)).status, 409);
});
test('actual gateway provenance rejects absent dirty untracked or misdeclared enforcement source', () => {
  const cwd = process.cwd(), root = mkdtempSync(join(tmpdir(), 'spend-gateway-source-'));
  const paths = ['assetfactory-studio/lib/server/productionSpend.ts', 'assetfactory-studio/app/api/worker/production-spend/route.ts'];
  const git = (...args) => { const r = spawnSync('git', ['-C', root, ...args], { encoding:'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    process.chdir(root); assert.throws(() => spendGatewaySourceSha('a'.repeat(40)), SpendRejected);
    git('init', '--quiet'); git('config', 'user.name', 'Synthetic fixture'); git('config', 'user.email', 'fixture@example.invalid');
    for (const path of paths) { mkdirSync(dirname(join(root, path)), { recursive:true }); writeFileSync(join(root, path), 'SYNTHETIC TRACKED SOURCE\n'); }
    git('add', '.'); git('commit', '--quiet', '-m', 'Synthetic source provenance'); const head = git('rev-parse', 'HEAD');
    assert.equal(spendGatewaySourceSha(head), head); assert.throws(() => spendGatewaySourceSha('a'.repeat(40)), SpendRejected);
    writeFileSync(join(root, paths[0]), 'SYNTHETIC DIRTY SOURCE\n'); assert.throws(() => spendGatewaySourceSha(head), SpendRejected);
    git('restore', '--', paths[0]); git('rm', '--cached', paths[0]); assert.throws(() => spendGatewaySourceSha(head), SpendRejected);
  } finally { process.chdir(cwd); rmSync(root, { recursive:true, force:true }); }
});
test('same-repository account credential header and source fingerprints are mandatory before all worker actions', async () => {
  for (const action of ['snapshot','record','preflight','reserve']) {
    for (const field of ['credential_sha256','semantic_headers_sha256','source_input_sha256', 'semantic_input_sha256','content_type']) {
      const f=fixture(), before=structuredClone(f.db.rows); await assert.rejects(act(f,action,{ [field]:'changed' }),SpendRejected); assert.deepEqual(f.db.rows,before);
      const absent=fixture(); delete absent.input[field]; await assert.rejects(act(absent,action),SpendRejected);
    }
    const f=fixture(); await assert.rejects(act(f,action,{ account_id:'another-account' }),SpendRejected);
  }
});
test('protected same-repository credential/account readback cannot be absent stale false or remapped', async () => {
  const changes=[f=>{delete f.account.credential_sha256},f=>{f.account.credential_binding_verified=false},f=>{f.account.credential_binding_receipt=''},f=>{f.account.credential_sha256=hash('OTHER-CREDENTIAL')},f=>{f.controls.credential_sha256=hash('OTHER-CREDENTIAL')},f=>{delete f.controls.semantic_headers_sha256},f=>{delete f.job.executor.content_type}];
  for (const change of changes) { const f=fixture(); change(f); const before=structuredClone(f.db.rows); await assert.rejects(act(f,'snapshot'),SpendRejected); await assert.rejects(act(f,'reserve'),SpendRejected); assert.deepEqual(f.db.rows,before); }
});
test('preflight derives account only once and reserve echoes the exact mandatory fingerprints', async () => {
  const f=fixture(); delete f.input.account_id; const p=await act(f,'preflight'); assert.equal(p.envelope.protected_controls.credential_sha256,f.job.executor.credential_sha256);
  await assert.rejects(act(f,'reserve'),SpendRejected); f.input.account_id=p.envelope.account.account_id;
  const a=await act(f,'reserve'); for(const field of ['account_id','credential_sha256','semantic_headers_sha256','source_input_sha256', 'semantic_input_sha256','content_type']) assert.equal(a[field],f.input[field]);
});
test('same cryptographic key cannot impersonate independent verifier through PEM formatting', async () => {
  const f=crossFixture(); await assert.rejects(act(f,'snapshot',{}, { ...f.opts,verifierKeys:{verifier:{subject:'synthetic-verifier',publicKey:'\n'+publicKey+'\n'}}}),SpendRejected);
});

test('protected pricing pins actual credentials semantic headers inputs content and fresh rates before every worker action', async () => {
  for (const make of [fixture, crossFixture]) for (const action of ['snapshot', 'record', 'preflight', 'reserve']) {
    for (const field of ['provider', 'account_id', 'model_version', 'request_sha256', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256', 'content_type', 'receipt', 'observed_at', 'expires_at']) {
      const f = make(), price = f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`);
      delete price[field]; const before = structuredClone(f.db.rows);
      await assert.rejects(act(f, action, {}, f.opts || options), SpendRejected); assert.deepEqual(f.db.rows, before);
    }
    for (const change of [p => { p.trusted_readback = false; }, p => { p.expires_at = '2026-10-07T16:29:59Z'; }, p => { p.observed_at = '2026-10-07T16:30:01Z'; }, p => { p.rates = { ...p.rates, usd_micros_per_unit: 1 }; }, p => { p.semantic_headers_sha256 = hash('ANOTHER-ACCOUNT-SELECTOR'); }]) {
      const f = make(); change(f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`)); const before = structuredClone(f.db.rows);
      await assert.rejects(act(f, action, {}, f.opts || options), SpendRejected); assert.deepEqual(f.db.rows, before);
    }
  }
});
test('preflight and non-authorizing snapshot expose the same exact protected pricing proof', async () => {
  for (const make of [fixture, crossFixture]) {
    const f = make(), price = f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`);
    const preflight = await act(f, 'preflight', {}, f.opts || options), snapshot = await act(f, 'snapshot', {}, f.opts || options);
    assert.deepEqual(preflight.envelope.protected_pricing, price); assert.deepEqual(snapshot.protected_pricing, price);
    assert.equal(snapshot.provider_call_authorized, false); assert.equal(snapshot.execution_performed, false);
  }
});


test('preflight serializes genuine approval and exposes the minimum verified authorization window', async () => {
  for (const make of [fixture, crossFixture]) for (const record of ['approval', 'authority', 'account', 'controls', 'pricing', 'rates', ...(make === crossFixture ? ['deployment'] : [])]) {
    const f = make(), end = new Date(NOW + 1000).toISOString();
    if (record === 'approval') f.approval.expires_at = end;
    else if (record === 'pricing') f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`).expires_at = end;
    else if (record === 'rates') { f.job.budget.rates.expires_at = end; f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`).rates.expires_at = end; }
    else f[record].expires_at = end;
    if (make === crossFixture) refreshCrossProofs(f);
    else f.db.rows.set(`assetFactorySpendApprovals/${f.job.approval_ref}`, signing({ ...f.approval, job_digest: jobDigest(f.job) }));
    f.input.job_digest = jobDigest(f.job);
    const preflight = JSON.parse(JSON.stringify(await act(f, 'preflight', {}, f.opts || options)));
    assert.equal(preflight.admission_expires_at, end, record);
    assert.equal(preflight.envelope.job.approval.status, 'APPROVED');
    const reservation = await act(f, 'reserve', {}, f.opts || options);
    assert.equal(reservation.reserved_at, new Date(NOW).toISOString());
    assert.equal(reservation.admission_expires_at, end, record);
    const stored = f.db.rows.get(f.jobPath).job.attempts[0];
    assert.equal(stored.reserved_at, reservation.reserved_at);
    assert.equal(stored.admission_expires_at, reservation.admission_expires_at);
    assert.equal(preflight.envelope.job.approval.status, 'APPROVED');
    assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 2500000);
  }
});
test('reservation expiry is also bounded by the server reservation time plus runtime', async () => {
  for (const make of [fixture, crossFixture]) {
    const f = make(), a = await act(f, 'reserve', {}, f.opts || options);
    assert.equal(Date.parse(a.admission_expires_at), NOW + 2000);
    assert.equal(Date.parse(a.reserved_at), NOW);
  }
});
test('deployment expiry during later authority reads prevents commit without any durable writes', async () => {
  const f = crossFixture(); f.deployment.expires_at = new Date(NOW + 1000).toISOString(); refreshCrossProofs(f);
  let clock = NOW; const original = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = fn => original(tx => fn({ ...tx, get: async ref => { const result = await tx.get(ref); if (ref.path.startsWith('assetFactorySpendAuthorities/')) clock = NOW + 1000; return result; } }));
  const before = structuredClone(f.db.rows);
  await assert.rejects(act(f, 'reserve', {}, { ...f.opts, now: () => clock }), SpendRejected);
  assert.deepEqual(f.db.rows, before);
});
test('expiry on the final reservation clock read cannot create an expired attempt or hold', async () => {
  const calibration = fixture(); let count = 0; await act(calibration, 'reserve', {}, { ...options, now: () => { count++; return NOW; } });
  const f = fixture(); f.approval.expires_at = new Date(NOW + 1000).toISOString();
  f.db.rows.set(`assetFactorySpendApprovals/${f.job.approval_ref}`, signing(f.approval));
  let current = 0; const before = structuredClone(f.db.rows);
  await assert.rejects(act(f, 'reserve', {}, { ...options, now: () => ++current === count ? NOW + 1000 : NOW }), SpendRejected);
  assert.deepEqual(f.db.rows, before);
});

// Actual Studio source, actual protected HTTP auth, and actual signed transaction.
// Only storage, keys and provider transport are synthetic; no live provider is contacted.
async function actualStudioGatewayFixture({ delayedReserve = false } = {}) {
  const sourceRoot = new URL('../assetfactory-studio/lib/server/', import.meta.url);
  const source = stripTypeScriptTypes(readFileSync(new URL('protectedProviderRequest.ts', sourceRoot), 'utf8'), { mode: 'strip' });
  let issuerDb;
  const module = new vm.SourceTextModule(source);
  await module.link(async specifier => {
    if (specifier === './firebaseAdmin') return new vm.SyntheticModule(['getAdminDb'], function () { this.setExport('getAdminDb', () => issuerDb); });
    const values = await import(specifier.startsWith('../') ? new URL(specifier, new URL('protectedProviderRequest.ts', sourceRoot)) : specifier);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); });
  });
  await module.evaluate();
  const protector = module.namespace, build = syntheticCleanBuild();
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  try {
  // The real gateway provenance checker must see its real tracked source as well.
  cpSync(new URL('productionSpend.ts', sourceRoot), join(build.directory, 'assetfactory-studio/lib/server/productionSpend.ts'));
  mkdirSync(join(build.directory, 'assetfactory-studio/app/api/worker/production-spend'), { recursive: true });
  cpSync(new URL('../assetfactory-studio/app/api/worker/production-spend/route.ts', import.meta.url), join(build.directory, 'assetfactory-studio/app/api/worker/production-spend/route.ts'));
  build.git('add', '.'); build.git('-c', 'user.name=Synthetic Fixture', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'Synthetic combined consumer and gateway source');
  const sourceSha = build.git('rev-parse', 'HEAD'); process.env.URAI_SOURCE_SHA = sourceSha;
  let now = originalNow(), calls = 0;
  Date.now = () => now;
  const endpoint = 'https://api.openai.com/v1/images/generations', model = 'SYNTHETIC-MODEL', lane = 'graphic';
  const input = { tenantId: 'SYNTHETIC-TENANT', jobId: 'SYNTHETIC-GENERATION', prompt: 'Synthetic input', type: 'graphic' };
  const init = { method: 'POST', headers: { authorization: 'Bearer SYNTHETIC-PROVIDER-ONLY', 'content-type': 'application/json' }, body: '{"prompt":"Synthetic input","model":"SYNTHETIC-MODEL"}' };
  const headers = new Headers(init.headers), credentials = Object.fromEntries([...headers.entries()].filter(([key]) => ['authorization', 'xi-api-key', 'x-api-key'].includes(key)));
  const semantic = Object.fromEntries([...headers.entries()].filter(([key]) => !Object.hasOwn(credentials, key)));
  const request = { semantic_input_sha256: protector.studioSemanticInputDigest(Buffer.from(init.body), headers.get('content-type')), request_sha256: protector.studioRequestDigest(endpoint, Buffer.from(init.body)), request_size: Buffer.byteLength(init.body), credential_sha256: protector.studioSourceInputDigest(credentials), semantic_headers_sha256: protector.studioSourceInputDigest(semantic), content_type: headers.get('content-type') }, f = fixture();
  const observed = new Date(now - 60_000).toISOString(), expires = new Date(now + 600_000).toISOString();
  f.job.provider = 'openai'; f.job.model_version = model; f.job.consumer = 'factory-studio';
  f.job.authority = { repository: 'LifeLoggerAI/asset-factory', sha: sourceSha }; f.authority.binding = f.job.authority;
  const executor = { source_sha: sourceSha, endpoint, request_sha256: request.request_sha256, request_size: String(request.request_size), asset: `${input.tenantId}/${input.jobId}/${lane}`, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, source_input_sha256: protector.studioSourceInputDigest(input), semantic_input_sha256: request.semantic_input_sha256, content_type: request.content_type };
  Object.assign(f.job.executor, executor);
  f.job.input_sha256 = [executor.source_input_sha256, executor.request_sha256]; f.job.reuse_review.input_sha256 = f.job.input_sha256;
  f.job.budget.max_runtime_seconds = 10;
  Object.assign(f.controls, { provider: f.job.provider, endpoint, request_sha256: executor.request_sha256, enforcement_source_sha: sourceSha, max_runtime_seconds: 10, credential_sha256: executor.credential_sha256, semantic_headers_sha256: executor.semantic_headers_sha256, source_input_sha256: executor.source_input_sha256, semantic_input_sha256: executor.semantic_input_sha256, artifact_hosts: f.job.executor.artifact_hosts });
  Object.assign(f.account, { provider: f.job.provider, credential_sha256: executor.credential_sha256 });
  f.accountPath = `assetFactorySpendAccounts/${hash(`${f.job.provider}\n${f.job.account_id}`)}`; f.db.rows.set(f.accountPath, f.account);
  const price = f.db.rows.get(`assetFactorySpendPricing/${f.job.pricing_ref}`);
  Object.assign(price, { provider: f.job.provider, model_version: model, request_sha256: executor.request_sha256, credential_sha256: executor.credential_sha256, semantic_headers_sha256: executor.semantic_headers_sha256, source_input_sha256: executor.source_input_sha256, semantic_input_sha256: executor.semantic_input_sha256, artifact_hosts: f.job.executor.artifact_hosts });
  for (const proof of [f.approval, f.authority, f.controls, f.account, price, f.job.budget.rates]) { proof.expires_at = expires; proof[proof === f.approval ? 'issued_at' : proof === f.job.budget.rates ? 'verified_at' : 'observed_at'] = observed; }
  f.approval.job_digest = jobDigest(f.job); f.db.rows.set(`assetFactorySpendApprovals/${f.job.approval_ref}`, signing(f.approval));
  process.env.FACTORY_STUDIO_SPEND_JOB_IDS_JSON = JSON.stringify({ [executor.request_sha256]: f.job.job_id });
  const gateway = process.env.ASSET_FORGE_SPEND_GATEWAY_URL, token = process.env.ASSET_FORGE_SPEND_WORKER_TOKEN, project = process.env.FIREBASE_PROJECT_ID;
  const fields = { job_id: f.job.job_id, provider: f.job.provider, model, asset: executor.asset, request_size: executor.request_size, endpoint, request_sha256: executor.request_sha256, executor_source_sha: sourceSha, credential_sha256: executor.credential_sha256, semantic_headers_sha256: executor.semantic_headers_sha256, source_input_sha256: executor.source_input_sha256, semantic_input_sha256: executor.semantic_input_sha256, content_type: executor.content_type };
  const issuer = { ...fields, executor_repository: 'LifeLoggerAI/asset-factory', consumer: 'factory-studio', tenant_id: input.tenantId, generation_job_id: input.jobId, lane, account_id: f.job.account_id, gateway_url: gateway, worker_token_sha256: hash(JSON.stringify({ authorization: `Bearer ${token}` })), trusted_readback: true, receipt: 'SYNTHETIC-NOT-ISSUER-PROOF', observed_at: observed, expires_at: expires };
  issuerDb = { projectId: project, collection(name) { assert.equal(name, 'assetFactoryStudioSpendBindings'); return { doc(id) { assert.equal(id, protector.studioIssuerBindingId(input, lane, executor.request_sha256)); return { async get() { return { exists: true, data: () => structuredClone(issuer) }; } }; } }; } };
  const http = await route(f, { URAI_SOURCE_SHA: sourceSha, ASSET_FACTORY_SPEND_WORKER_TOKEN: token, FIREBASE_PROJECT_ID: project, ASSET_FACTORY_FIREBASE_PROJECT_ID: project }, { now: () => now, projectId: project, verifySource: spendGatewaySourceSha });
  globalThis.fetch = async (url, options) => {
    if (String(url) === gateway) {
      const action = JSON.parse(options.body).action;
      const authorization = new Headers(options.headers).get('authorization'); assert.equal(authorization, `Bearer ${token}`);
      const result = await http.post(options.body, authorization.slice(7));
      if (delayedReserve && action === 'reserve') now += 10_001;
      return Response.json(result.data, { status: result.status });
    }
    assert.equal(String(url), endpoint); assert.equal(options.method, 'POST'); calls++;
    return Response.json({ id: 'SYNTHETIC-OUTPUT' });
  };
  const submit = () => protector.withProtectedStudioSession(input, async () => {
    const response = await protector.paidStudioFetch('openai', model, lane, endpoint, init);
    const output = JSON.parse((await protector.readStudioBytes(response, 65_536)).toString('utf8'));
    protector.observeStudioProviderTask(output.id); return output;
  });
  return { f, submit, calls: () => calls, restore() { globalThis.fetch = originalFetch; Date.now = originalNow; build.restore(); } };
  } catch (error) { globalThis.fetch = originalFetch; Date.now = originalNow; build.restore(); throw error; }
}
test('actual Studio consumer consumes the real authenticated gateway with signed approval and one account hold', async () => {
  const t = await actualStudioGatewayFixture();
  try {
    assert.equal((await t.submit()).id, 'SYNTHETIC-OUTPUT'); assert.equal(t.calls(), 1);
    const account = t.f.db.rows.get(t.f.accountPath), attempt = t.f.db.rows.get(t.f.jobPath).job.attempts[0];
    assert.equal(account.reservations.length, 1); assert.equal(attempt.status, 'RECONCILIATION_REQUIRED');
    assert.equal(attempt.charges_reconciled, false);
    await assert.rejects(t.submit()); assert.equal(t.calls(), 1);
  } finally { t.restore(); }
});
test('actual Studio HTTP reservation delayed beyond its window keeps the full hold and dispatches no provider POST', async () => {
  const t = await actualStudioGatewayFixture({ delayedReserve: true });
  try {
    await assert.rejects(t.submit(), /admission deadline|deadline/);
    assert.equal(t.calls(), 0); assert.equal(t.f.db.rows.get(t.f.accountPath).reservations.length, 1);
    const attempt = t.f.db.rows.get(t.f.jobPath).job.attempts[0];
    assert.equal(attempt.status, 'RECONCILIATION_REQUIRED'); assert.equal(attempt.charges_reconciled, false);
    assert.equal(t.f.db.rows.get(t.f.accountPath).reservations[0].usd_micros, t.f.job.budget.max_usd_micros);
  } finally { t.restore(); }
});

test('renamed source job and reencoded request cannot reopen a permanent semantic claim', async () => {
  for (const settled of [false, true]) {
    const first = fixture(); const a = await act(first, 'reserve');
    if (settled) await act(first, 'reconcile', charge(first, a, 'SUCCEEDED'));
    const other = fixture(first.db, 'renamed-successor');
    other.account.available_usd_micros = 10_000_000; first.db.rows.get(first.accountPath).available_usd_micros = 10_000_000;
    other.job.executor.semantic_input_sha256 = first.job.executor.semantic_input_sha256;
    other.input.semantic_input_sha256 = first.job.executor.semantic_input_sha256;
    other.controls.semantic_input_sha256 = first.job.executor.semantic_input_sha256;
    other.db.rows.get(`assetFactorySpendPricing/${other.job.pricing_ref}`).semantic_input_sha256 = first.job.executor.semantic_input_sha256;
    other.input.job_digest = jobDigest(other.job);
    other.db.rows.set(`assetFactorySpendApprovals/${other.job.approval_ref}`, signing({ ...other.approval, job_digest: other.input.job_digest }));
    const before = structuredClone(other.db.rows);
    await assert.rejects(act(other, 'reserve'), /semantic input already reserved/);
    assert.deepEqual(other.db.rows, before);
    assert.equal([...other.db.rows.keys()].filter(k => k.startsWith('assetFactorySpendInputClaims/')).length, 1);
  }
});
test('global task and charge consumption survives a separately signed foreign job receipt', async () => {
  const first = fixture(), a = await act(first, 'reserve'), receipt = charge(first, a, 'SUCCEEDED');
  const task = first.db.rows.get(`assetFactorySpendChargeReceipts/${receipt.receipt_sha256}`).task_id;
  await act(first, 'reconcile', receipt);
  const other = fixture(first.db, 'legitimate-distinct-input'), b = await act(other, 'reserve');
  const duplicate = charge(other, b, 'SUCCEEDED', 400000, 2, { task_id: task }), before = structuredClone(other.db.rows);
  await assert.rejects(act(other, 'reconcile', duplicate), /already consumed/); assert.deepEqual(other.db.rows, before);
  const fresh = charge(other, b, 'SUCCEEDED');
  other.db.rows.set(`assetFactorySpendChargeClaims/${fresh.receipt_sha256}`, { job_id: 'already-consumed' });
  const beforeCharge = structuredClone(other.db.rows);
  await assert.rejects(act(other, 'reconcile', fresh), /already consumed/); assert.deepEqual(other.db.rows, beforeCharge);
  assert.equal(other.db.rows.get(other.accountPath).reservations.find(r => r.job_id === other.job.job_id).usd_micros, 2500000);
});
test('protected writer history reset cannot reopen the original permanent semantic identity', async () => {
  const f = fixture(); await act(f, 'reserve');
  const reset = fixture(f.db, f.job.job_id), before = structuredClone(reset.db.rows);
  await assert.rejects(act(reset, 'reserve'), /semantic input already reserved/); assert.deepEqual(reset.db.rows, before);
});

/** Synthetic configuration regression: no real signer, charge, storage or provider. */
const mutableKeys = opts => ({ ...opts, approvalKeys: structuredClone(opts.approvalKeys), reconciliationKeys: structuredClone(opts.reconciliationKeys), verifierKeys: structuredClone(opts.verifierKeys || {}) });
const roleChanges = [
  ['approval key under another reconciliation subject', { reconciliationKeys: { another: { subject: 'another-charge-subject', publicKey } } }],
  ['approval PEM formatting does not create another key', { reconciliationKeys: { another: { subject: 'another-charge-subject', publicKey: '\n' + publicKey + '\n' } } }],
  ['same declared principal with distinct keys', { reconciliationKeys: { another: { subject: 'synthetic-approver', publicKey: chargePublicKey } } }],
  ['case alias does not create another declared principal', { reconciliationKeys: { another: { subject: 'SYNTHETIC-APPROVER', publicKey: chargePublicKey } } }],
  ['Unicode compatibility alias does not create another declared principal', { reconciliationKeys: { another: { subject: 'ｓｙｎｔｈｅｔｉｃ-ａｐｐｒｏｖｅｒ', publicKey: chargePublicKey } } }],
  ['verifier cannot reuse approval key', { verifierKeys: { another: { subject: 'another-verifier', publicKey } } }],
  ['verifier cannot reuse reconciliation key', { verifierKeys: { another: { subject: 'another-verifier', publicKey: chargePublicKey } } }],
  ['verifier cannot reuse approval principal with distinct key', { verifierKeys: { another: { subject: 'synthetic-approver', publicKey: verifierPublicKey } } }],
  ['verifier cannot reuse reconciliation principal with distinct key', { verifierKeys: { another: { subject: 'synthetic-reconciler', publicKey: verifierPublicKey } } }],
];
for (const [name, change] of roleChanges) test(name + ' is rejected before all transaction actions', async () => {
  for (const action of ['snapshot', 'preflight', 'reserve', 'record', 'reconcile']) {
    const f = fixture(), before = structuredClone(f.db.rows); let storage = 0;
    f.db.doc = () => { storage++; throw Error('Storage must never be accessed'); };
    f.db.runTransaction = () => { storage++; throw Error('Transaction must never start'); };
    await assert.rejects(act(f, action, {}, { ...options, ...change }), SpendRejected);
    assert.equal(storage, 0); assert.deepEqual(f.db.rows, before);
  }
});
test('an approval-key-signed zero charge cannot release a held reservation', async () => {
  const f = fixture(), a = await act(f, 'reserve'), args = charge(f, a, 'SUCCEEDED', 0, 0);
  const path = 'assetFactorySpendChargeReceipts/' + args.receipt_sha256, payload = f.db.rows.get(path);
  delete payload.signature; const forged = signing(payload), digest = hash(canonical(forged));
  f.db.rows.set('assetFactorySpendChargeReceipts/' + digest, forged);
  const before = structuredClone(f.db.rows), overlap = { ...options, reconciliationKeys: { synthetic: { subject: 'synthetic-reconciler', publicKey } } };
  await assert.rejects(act(f, 'reconcile', { ...args, receipt_sha256: digest }, overlap), SpendRejected);
  assert.deepEqual(f.db.rows, before); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 2500000);
});
for (const purpose of ['approvalKeys', 'reconciliationKeys', 'verifierKeys']) test('malformed configured ' + purpose + ' cannot read or mutate storage', async () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' });
  const values = [null, [], false, 'invalid', { malformed: null }, { malformed: { subject: 'role', publicKey: 'invalid pem' } }, { malformed: { subject: 'role', publicKey: rsa } }, { malformed: { subject: 'role', publicKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) } }, { malformed: { subject: 'role', publicKey, privateKey: 'SYNTHETIC_SECRET' } }, { malformed: { subject: ' role ', publicKey } }];
  for (const value of values) {
    const f = fixture(); let reads = 0; f.db.doc = () => { reads++; throw Error('Storage must never be accessed'); };
    await assert.rejects(act(f, 'snapshot', {}, { ...options, [purpose]: value }), error => error instanceof SpendRejected && !error.message.includes('SYNTHETIC_SECRET') && !error.cause);
    assert.equal(reads, 0);
  }
});
test('paid admission requires configured independent approval and charge registries', async () => {
  for (const role of ['approvalKeys', 'reconciliationKeys']) {
    const f = fixture(); let reads = 0; f.db.doc = () => { reads++; throw Error('Storage must never be accessed'); };
    for (const action of ['preflight', 'reserve']) await assert.rejects(act(f, action, {}, { ...options, [role]: {} }), SpendRejected);
    assert.equal(reads, 0);
  }
});
test('validated public-key snapshots are frozen and rotation aliases within one role remain valid', async () => {
  const opts = mutableKeys(options); opts.approvalKeys.alias = { subject: 'another-approval-subject', publicKey };
  const policy = spendSigningPolicy(opts);
  assert.ok(Object.isFrozen(policy)); assert.ok(Object.isFrozen(policy.approvalKeys)); assert.ok(Object.isFrozen(policy.approvalKeys.synthetic));
  opts.approvalKeys.synthetic.publicKey = chargePublicKey;
  assert.equal(policy.approvalKeys.synthetic.publicKey, publicKey);
  assert.equal(Object.getPrototypeOf(policy.approvalKeys), null);
  const f = fixture(); const reserved = await act(f, 'reserve', {}, { ...options, approvalKeys: { ...options.approvalKeys, alias: { subject: 'another-approval-subject', publicKey } } });
  assert.ok(reserved.attempt_id); assert.equal(f.db.rows.get(f.accountPath).reservations.length, 1);
});
for (const genuine of [false, true]) test('configuration mutation during reconciliation cannot replace the frozen charge authority: ' + genuine, async () => {
  const f = fixture(), a = await act(f, 'reserve'), opts = mutableKeys(options), args = charge(f, a, 'SUCCEEDED');
  if (!genuine) {
    const payload = f.db.rows.get('assetFactorySpendChargeReceipts/' + args.receipt_sha256); delete payload.signature;
    const forged = signing(payload); args.receipt_sha256 = hash(canonical(forged)); f.db.rows.set('assetFactorySpendChargeReceipts/' + args.receipt_sha256, forged);
  }
  const before = structuredClone(f.db.rows), original = f.db.runTransaction;
  f.db.runTransaction = callback => { opts.reconciliationKeys.synthetic.publicKey = publicKey; return original.call(f.db, callback); };
  if (genuine) {
    const result = await act(f, 'reconcile', args, opts); assert.equal(result.reconciled, true); assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 400000);
  } else { await assert.rejects(act(f, 'reconcile', args, opts), SpendRejected); assert.deepEqual(f.db.rows, before); }
});
const rotatedCharges = [
  ['original approval key', pair, 'new-charge-subject', {}],
  ['original approval principal', chargePair, 'synthetic-approver', {}],
  ['original verifier key', verifierPair, 'new-charge-subject', { verifier: { subject: 'original-verifier', publicKey: verifierPublicKey } }],
  ['original verifier principal', chargePair, 'original-verifier', { verifier: { subject: 'original-verifier', publicKey: verifierPublicKey } }],
];
for (const [name, signer, subject, verifierKeys] of rotatedCharges) test('registry rotation cannot convert ' + name + ' into an independent final charge', async () => {
  const f = fixture(), initial = { ...options, verifierKeys }, a = await act(f, 'reserve', {}, initial), args = charge(f, a, 'SUCCEEDED', 0, 0);
  const payload = f.db.rows.get('assetFactorySpendChargeReceipts/' + args.receipt_sha256); delete payload.signature; payload.reconciler = subject;
  const receipt = { ...payload, signature: sign(null, Buffer.from(canonical(payload)), signer.privateKey).toString('base64') }, digest = hash(canonical(receipt));
  f.db.rows.set('assetFactorySpendChargeReceipts/' + digest, receipt);
  const rotated = { ...options, approvalKeys: {}, verifierKeys: {}, reconciliationKeys: { synthetic: { subject, publicKey: signer.publicKey.export({ type: 'spki', format: 'pem' }) } } }, before = structuredClone(f.db.rows);
  spendSigningPolicy(rotated);
  await assert.rejects(act(f, 'reconcile', { ...args, receipt_sha256: digest }, rotated), SpendRejected);
  assert.deepEqual(f.db.rows, before); assert.equal(f.db.rows.get(f.accountPath).reservations[0].credits, 20);
});
test('expired grant and revoked approval registry still permit genuinely independent read-only charge recovery', async () => {
  const f = fixture(), a = await act(f, 'reserve'), args = charge(f, a, 'SUCCEEDED');
  const result = await act(f, 'reconcile', args, { ...options, now: () => NOW + 7200000, approvalKeys: {} });
  assert.equal(result.reconciled, true); assert.equal(result.provider_call_authorized, false); assert.equal(result.execution_performed, false);
  assert.equal(f.db.rows.get(f.accountPath).reservations[0].usd_micros, 400000);
  await assert.rejects(act(f, 'reserve', {}, { ...options, approvalKeys: {} }), SpendRejected);
});
for (const field of ['charge_excluded_signer_spki_sha256', 'charge_excluded_signer_subject_sha256']) test('missing or malformed original ' + field + ' never releases historical exposure', async () => {
  for (const value of [undefined, [], null, 'invalid', [1], ['invalid'], ['a'.repeat(64), 'a'.repeat(64)], Array(257).fill('a'.repeat(64))]) {
    const f = fixture(), a = await act(f, 'reserve'), args = charge(f, a, 'SUCCEEDED');
    f.db.rows.get(f.jobPath).job.attempts[0][field] = value;
    const before = structuredClone(f.db.rows); await assert.rejects(act(f, 'reconcile', args), SpendRejected); assert.deepEqual(f.db.rows, before);
  }
});
test('actual HTTP reserve rejects overlapping roles and unknown signer fields without transaction writes', async () => {
  for (const value of [{ subject: 'synthetic-reconciler', publicKey }, { subject: 'synthetic-reconciler', publicKey: chargePublicKey, privateKey: 'SYNTHETIC_SECRET' }]) {
    const f = fixture(), r = await route(f, { ASSET_FACTORY_SPEND_RECONCILER_PUBLIC_KEYS: JSON.stringify({ synthetic: value }) }), before = structuredClone(f.db.rows);
    const result = await r.post({ ...f.input, action: 'reserve' });
    assert.equal(result.status, 409); assert.equal(result.data.provider_call_authorized, false); assert.deepEqual(f.db.rows, before);
  }
});
test('actual HTTP distinct reconciliation token cannot make overlapping signing roles release the hold', async () => {
  const f = fixture(), a = await act(f, 'reserve'), args = charge(f, a, 'SUCCEEDED', 0, 0), payload = f.db.rows.get('assetFactorySpendChargeReceipts/' + args.receipt_sha256); delete payload.signature;
  const receipt = signing(payload), digest = hash(canonical(receipt)); f.db.rows.set('assetFactorySpendChargeReceipts/' + digest, receipt);
  const r = await route(f, { ASSET_FACTORY_SPEND_RECONCILER_PUBLIC_KEYS: JSON.stringify({ synthetic: { subject: 'synthetic-reconciler', publicKey } }) }), before = structuredClone(f.db.rows);
  const result = await r.post({ ...f.input, action: 'reconcile', ...args, receipt_sha256: digest }, r.env.ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN);
  assert.equal(result.status, 409); assert.equal(result.data.provider_call_authorized, false); assert.deepEqual(f.db.rows, before);
});
