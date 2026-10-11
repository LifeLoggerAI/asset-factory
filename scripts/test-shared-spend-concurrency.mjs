// Actual canonical gateway transactions with synthetic keys/records only.
// No provider, Firestore/IAM, financial or release authority is exercised.
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { canonical, hash, jobDigest, spendAction, SpendRejected } from '../assetfactory-studio/lib/server/productionSpend.ts';

const NOW = Date.parse('2026-10-07T16:30:00Z');
const sourceSha = 'a'.repeat(40), observed_at = '2026-10-07T16:00:00Z', expires_at = '2026-10-07T18:00:00Z';
const approvalPair = generateKeyPairSync('ed25519'), chargePair = generateKeyPairSync('ed25519');
const keys = pair => pair.publicKey.export({ type: 'spki', format: 'pem' });
const signed = (record, pair) => ({ ...record, signature: sign(null, Buffer.from(canonical(record)), pair.privateKey).toString('base64') });
const options = { sourceSha, now: () => NOW, approvalKeys: { synthetic_approval: { subject: 'SYNTHETIC-NOT-APPROVAL', publicKey: keys(approvalPair) } }, reconciliationKeys: { synthetic_charge: { subject: 'SYNTHETIC-NOT-CHARGE', publicKey: keys(chargePair) } } };

/** Serializable shared account transaction with read-before-write and rollback. */
class Db {
  rows = new Map(); tail = Promise.resolve();
  doc(path) { return { path }; }
  runTransaction(fn) {
    const result = this.tail.then(async () => {
      const writes = new Map();
      const value = await fn({
        get: async ref => { assert.equal(writes.size, 0, 'all transactional reads precede writes'); return { exists: this.rows.has(ref.path), data: () => structuredClone(this.rows.get(ref.path)) }; },
        set: (ref, record) => writes.set(ref.path, structuredClone(record)),
      });
      for (const [path, record] of writes) this.rows.set(path, record);
      return value;
    });
    this.tail = result.catch(() => {}); return result;
  }
}
function fixture(db = new Db(), id = 'SYNTHETIC-IMAGE', consumer = 'IMAGE', concurrency = 1) {
  const rates = { usd_micros_per_unit: 1_000_000, credits_per_unit: 10, receipt: 'SYNTHETIC-NOT-PRICING', verified_at: observed_at, expires_at };
  const binding = { repository: 'synthetic/fixture', sha: sourceSha };
  const executor = { source_sha: sourceSha, controls_ref: hash(`controls:${id}`), request_sha256: hash(`request:${id}`), endpoint: 'https://example.invalid/render', asset: id, request_size: '64x64', credential_sha256: hash('SYNTHETIC-NOT-CREDENTIAL'), semantic_headers_sha256: hash('SYNTHETIC-HEADERS'), source_input_sha256: hash(`input:${id}`), semantic_input_sha256: hash(`semantic:${id}`), artifact_hosts: ['outputs.example.test'], content_type: 'application/json' };
  const inputs = [executor.source_input_sha256, executor.request_sha256];
  const job = { schema_version: 1, job_id: id, provider: 'custom', account_id: 'SYNTHETIC-SHARED-API', operation: 'render', model_version: 'SYNTHETIC-MODEL', owner_lane: 'synthetic', consumer, truth_class: 'GENERIC', rights_reviewed: true, authority: binding, input_sha256: inputs, reuse_review: { input_sha256: inputs, decision: 'MISSING_COMPONENT', receipt: 'SYNTHETIC-REUSE' }, acceptance: { stage: 'SPECIFIED', criteria: 'Synthetic fixture', verification: 'Synthetic test' }, expected_outputs: ['geometry', 'receipt'], budget: { currency: 'USD', max_usd_micros: 2_500_000, max_credits: 20, max_concurrency: concurrency, units: 1, max_retries: 1, max_runtime_seconds: 2, hard_stop_supported: true, auto_top_up: false, storage_egress_overhead_usd_micros: 100_000, rates }, executor, attempts: [], approval_ref: hash(`approval:${id}`), authority_ref: hash(`authority:${id}`), pricing_ref: hash(`price:${id}`) };
  const accountPath = `assetFactorySpendAccounts/${hash(`${job.provider}\n${job.account_id}`)}`, jobPath = `assetFactorySpendJobs/${hash(id)}`;
  const account = { provider: job.provider, account_id: job.account_id, credential_sha256: executor.credential_sha256, credential_binding_verified: true, credential_binding_receipt: 'SYNTHETIC-NOT-ACCOUNT-PROOF', balance_type: 'API', trusted_readback: true, frozen: false, available_usd_micros: 100_000_000, available_credits: 1_000, max_concurrency: concurrency, reservations: [], observed_at, expires_at };
  const approval = { status: 'APPROVED', kind: 'EXPLICIT_BOUNDED_SPEND', receipt: 'SYNTHETIC-NOT-AUTHORIZATION', approver: 'SYNTHETIC-NOT-APPROVAL', issued_at: observed_at, expires_at, job_digest: jobDigest(job), max_usd_micros: job.budget.max_usd_micros, max_credits: job.budget.max_credits, max_concurrency: concurrency, key_id: 'synthetic_approval' };
  const controls = { provider: job.provider, account_id: job.account_id, endpoint: executor.endpoint, request_sha256: executor.request_sha256, trusted_readback: true, hard_stop_supported: true, cost_cap_enforced: true, auto_top_up: false, max_runtime_seconds: job.budget.max_runtime_seconds, max_usd_micros: job.budget.max_usd_micros, max_credits: job.budget.max_credits, max_concurrency: concurrency, proof_receipt: 'SYNTHETIC-NOT-CONTROLS', enforcement_source_sha: sourceSha, observed_at, expires_at };
  const price = { provider: job.provider, account_id: job.account_id, model_version: job.model_version, request_sha256: executor.request_sha256, trusted_readback: true, receipt: 'SYNTHETIC-NOT-PRICE', observed_at, expires_at, rates };
  for (const field of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256', 'content_type']) controls[field] = price[field] = executor[field];
  db.rows.set(jobPath, { job });
  if (!db.rows.has(accountPath)) db.rows.set(accountPath, account);
  db.rows.set(`assetFactorySpendApprovals/${job.approval_ref}`, signed(approval, approvalPair));
  db.rows.set(`assetFactorySpendAuthorities/${job.authority_ref}`, { binding, trusted_readback: true, observed_at, expires_at });
  db.rows.set(`assetFactorySpendControls/${executor.controls_ref}`, controls);
  db.rows.set(`assetFactorySpendPricing/${job.pricing_ref}`, price);
  const input = { job_id: id, provider: job.provider, account_id: job.account_id, model: job.model_version, asset: executor.asset, request_size: executor.request_size, request_sha256: executor.request_sha256, endpoint: executor.endpoint, executor_source_sha: sourceSha, credential_sha256: executor.credential_sha256, semantic_headers_sha256: executor.semantic_headers_sha256, source_input_sha256: executor.source_input_sha256, semantic_input_sha256: executor.semantic_input_sha256, content_type: executor.content_type, job_digest: jobDigest(job) };
  const resign = () => { approval.job_digest = jobDigest(job); input.job_digest = approval.job_digest; db.rows.set(`assetFactorySpendApprovals/${job.approval_ref}`, signed(approval, approvalPair)); };
  return { db, job, account: db.rows.get(accountPath), approval, controls, input, jobPath, accountPath, resign };
}
const act = (f, action, extra = {}) => spendAction(f.db, action, { ...f.input, ...extra }, options);
const active = f => f.db.rows.get(f.accountPath).reservations.filter(r => r.settled !== true).length;

test('shared account admits only one of thirty parallel IMAGE Forge and Studio job reservations at signed cap one', async () => {
  const db = new Db(), consumers = ['IMAGE', 'model-forge', 'factory-studio'];
  const jobs = Array.from({ length: 30 }, (_, i) => fixture(db, `SYNTHETIC-${i}`, consumers[i % 3]));
  const results = await Promise.allSettled(jobs.map(f => act(f, 'reserve')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(active(jobs[0]), 1);
  assert.equal([...db.rows.values()].filter(row => row.job?.attempts?.length).length, 1);
});
test('cap two is one account-wide limit across all consumer lanes and terminal debit history', async () => {
  const db = new Db(), jobs = ['IMAGE', 'model-forge', 'factory-studio'].map((c, i) => fixture(db, `SYNTHETIC-CAP2-${i}`, c, 2));
  jobs[0].account.reservations.push({ job_id: 'SYNTHETIC-HISTORY', usd_micros: 1_000_000, credits: 1, settled: true });
  const results = await Promise.allSettled(jobs.map(f => act(f, 'reserve')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2); assert.equal(active(jobs[0]), 2);
});
test('unknown provider outcome consumes concurrency until independent final charge settlement', async () => {
  const f = fixture(), g = fixture(f.db, 'SYNTHETIC-FORGE', 'model-forge');
  const admitted = await act(f, 'reserve'); await act(f, 'record', { attempt_id: admitted.attempt_id, status: 'failed' });
  await assert.rejects(act(g, 'reserve'), /concurrency/); assert.equal(active(f), 1);
  const receipt = signed({ job_id: f.job.job_id, attempt_id: admitted.attempt_id, provider: f.job.provider, account_id: f.job.account_id, job_digest: jobDigest(f.job), status: 'SUCCEEDED', final: true, task_id: 'SYNTHETIC-TASK', actual_usd_micros: 400_000, actual_credits: 2, observed_at: new Date(NOW).toISOString(), reconciler: 'SYNTHETIC-NOT-CHARGE', key_id: 'synthetic_charge' }, chargePair);
  const digest = hash(canonical(receipt)); f.db.rows.set(`assetFactorySpendChargeReceipts/${digest}`, receipt);
  await act(f, 'reconcile', { attempt_id: admitted.attempt_id, receipt_sha256: digest });
  assert.equal(active(f), 0); const debit = f.db.rows.get(f.accountPath).reservations[0];
  assert.deepEqual(debit, { job_id: f.job.job_id, usd_micros: 400_000, credits: 2, settled: true });
  await act(g, 'reserve'); assert.equal(active(f), 1);
});
test('settled debit consumes both cash and credits even when it consumes no concurrency', async () => {
  for (const [field, value] of [['usd_micros', 99_000_000], ['credits', 999]]) {
    const f = fixture(); f.account.reservations.push({ job_id: 'SYNTHETIC-HISTORY', usd_micros: 0, credits: 0, settled: true, [field]: value });
    const before = structuredClone(f.db.rows); await assert.rejects(act(f, 'reserve'), /oversubscribed/); assert.deepEqual(f.db.rows, before);
  }
});
for (const [label, change] of [
  ['missing account cap', f => delete f.account.max_concurrency],
  ['zero account cap', f => f.account.max_concurrency = 0],
  ['overbounded account cap', f => f.account.max_concurrency = 21],
  ['string account cap', f => f.account.max_concurrency = '1'],
  ['boolean account cap', f => f.account.max_concurrency = true],
  ['fractional account cap', f => f.account.max_concurrency = 1.5],
  ['missing job cap', f => { delete f.job.budget.max_concurrency; f.resign(); }],
  ['signed job cap differs from account', f => { f.job.budget.max_concurrency = 2; f.approval.max_concurrency = 2; f.resign(); }],
  ['missing explicit approval cap', f => { delete f.approval.max_concurrency; f.resign(); }],
  ['genuinely signed wrong approval cap', f => { f.approval.max_concurrency = 2; f.resign(); }],
  ['missing current control cap', f => delete f.controls.max_concurrency],
  ['current control cap differs from account', f => f.controls.max_concurrency = 2],
  ['malformed frozen flag', f => f.account.frozen = 'false'],
  ['missing frozen flag', f => delete f.account.frozen],
  ['frozen account', f => f.account.frozen = true],
  ['malformed settled flag', f => f.account.reservations.push({ job_id: 'SYNTHETIC-OTHER', usd_micros: 0, credits: 0, settled: 'true' })],
  ['unknown reservation fields', f => f.account.reservations.push({ job_id: 'SYNTHETIC-OTHER', usd_micros: 0, credits: 0, active: false })],
  ['negative foreign debit', f => f.account.reservations.push({ job_id: 'SYNTHETIC-OTHER', usd_micros: -1, credits: 0, settled: true })],
  ['duplicate foreign identity', f => f.account.reservations.push(...Array.from({ length: 2 }, () => ({ job_id: 'SYNTHETIC-OTHER', usd_micros: 0, credits: 0 })))],
]) test(`${label} rejects before all reservation writes`, async () => {
  const f = fixture(); change(f); const before = structuredClone(f.db.rows);
  await assert.rejects(act(f, 'reserve'), SpendRejected); assert.deepEqual(f.db.rows, before);
});
test('preflight is non-authorizing and cannot hide a foreign unresolved cap hold', async () => {
  const f = fixture(); f.account.reservations.push({ job_id: 'SYNTHETIC-FORGE', usd_micros: 0, credits: 0 });
  const before = structuredClone(f.db.rows); await assert.rejects(act(f, 'preflight'), /concurrency/); assert.deepEqual(f.db.rows, before);
});
test('a canonical cap changed after preflight requires newly consistent approval and controls', async () => {
  const f = fixture(); const result = await act(f, 'preflight');
  assert.equal(result.provider_call_authorized, false); assert.equal(f.account.reservations.length, 0);
  f.account.max_concurrency = 2; const before = structuredClone(f.db.rows);
  await assert.rejects(act(f, 'reserve'), /concurrency/); assert.deepEqual(f.db.rows, before);
});
test('independent reconciliation rejects corrupted account accounting without coercion or hold release', async () => {
  const f = fixture(), admitted = await act(f, 'reserve');
  const receipt = signed({ job_id: f.job.job_id, attempt_id: admitted.attempt_id, provider: f.job.provider, account_id: f.job.account_id, job_digest: jobDigest(f.job), status: 'SUCCEEDED', final: true, task_id: 'SYNTHETIC-TASK', actual_usd_micros: 0, actual_credits: 0, observed_at: new Date(NOW).toISOString(), reconciler: 'SYNTHETIC-NOT-CHARGE', key_id: 'synthetic_charge' }, chargePair);
  const digest = hash(canonical(receipt)); f.db.rows.set(`assetFactorySpendChargeReceipts/${digest}`, receipt);
  for (const change of [a => a.frozen = 'true', a => a.max_concurrency = '1', a => a.reservations[0].settled = 'true', a => a.reservations[0].credits = '20']) {
    const original = structuredClone(f.db.rows.get(f.accountPath)); change(f.db.rows.get(f.accountPath));
    const before = structuredClone(f.db.rows); await assert.rejects(act(f, 'reconcile', { attempt_id: admitted.attempt_id, receipt_sha256: digest }), SpendRejected); assert.deepEqual(f.db.rows, before);
    f.db.rows.set(f.accountPath, original);
  }
});
