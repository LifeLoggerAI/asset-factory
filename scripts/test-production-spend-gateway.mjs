import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { authenticateSpend, canonical, hash, jobDigest, spendAction, spendRecord, SpendRejected } from '../assetfactory-studio/lib/server/productionSpend.ts';

const NOW = Date.parse('2026-10-07T16:30:00Z');
const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const signing = record => ({ ...record, signature: sign(null, Buffer.from(canonical(record)), pair.privateKey).toString('base64') });
const options = { sourceSha: 'a'.repeat(40), now: () => NOW, approvalKeys: { synthetic: { subject: 'synthetic-approver', publicKey } }, reconciliationKeys: { synthetic: { subject: 'synthetic-reconciler', publicKey } } };

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
  const job = { schema_version: 1, job_id: id, provider: 'custom', account_id: 'synthetic-api', operation: 'render', model_version: 'synthetic-model', owner_lane: 'synthetic', consumer: 'synthetic', truth_class: 'GENERIC', rights_reviewed: true, authority: binding, input_sha256: ['b'.repeat(64)], reuse_review: { input_sha256: ['b'.repeat(64)], decision: 'MISSING_COMPONENT', receipt: 'SYNTHETIC-REUSE' }, acceptance: { stage: 'SPECIFIED', criteria: 'Synthetic fixture', verification: 'Synthetic verifier' }, expected_outputs: ['geometry', 'receipt'], budget: { currency: 'USD', max_usd_micros: 2500000, max_credits: 20, units: 1, max_retries: 1, max_runtime_seconds: 2, hard_stop_supported: true, auto_top_up: false, storage_egress_overhead_usd_micros: 100000, rates }, attempts: [], approval_ref: hash(`approval:${id}`), authority_ref: hash('authority'), pricing_ref: hash('pricing'), executor: { source_sha: 'a'.repeat(40), controls_ref: hash('controls'), request_sha256: hash('synthetic request'), endpoint: 'https://example.invalid/render', asset: 'synthetic-image', request_size: '64x64' } };
  const authority = { binding, trusted_readback: true, observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z' };
  const account = { provider: job.provider, account_id: job.account_id, balance_type: 'API', trusted_readback: true, available_usd_micros: 3000000, available_credits: 30, observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z', reservations: [] };
  const approval = { status: 'APPROVED', kind: 'EXPLICIT_BOUNDED_SPEND', receipt: 'SYNTHETIC-NOT-AUTHORIZATION', approver: 'synthetic-approver', issued_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z', job_digest: jobDigest(job), max_usd_micros: job.budget.max_usd_micros, max_credits: job.budget.max_credits, key_id: 'synthetic' };
  const controls = { provider: job.provider, account_id: job.account_id, endpoint: job.executor.endpoint, request_sha256: job.executor.request_sha256, trusted_readback: true, hard_stop_supported: true, cost_cap_enforced: true, auto_top_up: false, max_runtime_seconds: 2, max_usd_micros: 2500000, max_credits: 20, proof_receipt: 'SYNTHETIC-CONTROL-PROOF', enforcement_source_sha: 'a'.repeat(40), observed_at: '2026-10-07T16:00:00Z', expires_at: '2026-10-07T18:00:00Z' };
  const jobPath = `assetFactorySpendJobs/${hash(id)}`, accountPath = `assetFactorySpendAccounts/${hash('custom\nsynthetic-api')}`;
  db.rows.set(jobPath, { job });
  if (!db.rows.has(accountPath)) db.rows.set(accountPath, account);
  db.rows.set(`assetFactorySpendApprovals/${job.approval_ref}`, signing(approval));
  db.rows.set(`assetFactorySpendAuthorities/${job.authority_ref}`, authority);
  db.rows.set(`assetFactorySpendPricing/${job.pricing_ref}`, { provider: job.provider, account_id: job.account_id, model_version: job.model_version, request_sha256: job.executor.request_sha256, trusted_readback: true, rates });
  db.rows.set(`assetFactorySpendControls/${job.executor.controls_ref}`, controls);
  const input = { executor_source_sha: 'a'.repeat(40), job_id: id, provider: job.provider, model: job.model_version, asset: job.executor.asset, request_size: job.executor.request_size, request_sha256: job.executor.request_sha256, endpoint: job.executor.endpoint, job_digest: jobDigest(job) };
  return { db, job, input, jobPath, accountPath, account, authority, approval, controls };
}
const act = (f, action, extra = {}, opts = options) => spendAction(f.db, action, { ...f.input, ...extra }, opts);
function charge(f, attempt, status, usd = 400000, credits = 2, change = {}) {
  const receipt = signing({ job_id: f.job.job_id, attempt_id: attempt.attempt_id, provider: f.job.provider, account_id: f.job.account_id, job_digest: jobDigest(f.job), status, final: true, task_id: `SYNTHETIC-TASK-${attempt.attempt_id}`, actual_usd_micros: usd, actual_credits: credits, corrective_action: 'Synthetic reviewed correction', observed_at: '2026-10-07T16:30:00Z', reconciler: 'synthetic-reconciler', key_id: 'synthetic', ...change });
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

async function route(f, envChange = {}) {
  const env = { ASSET_FACTORY_SPEND_WORKER_TOKEN: 'synthetic-worker-'.repeat(4), ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN: 'synthetic-reconciler-'.repeat(4), ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-dedicated', FIREBASE_PROJECT_ID: 'synthetic-dedicated', URAI_SOURCE_SHA: 'a'.repeat(40), ASSET_FACTORY_SPEND_APPROVER_PUBLIC_KEYS: JSON.stringify(options.approvalKeys), ASSET_FACTORY_SPEND_RECONCILER_PUBLIC_KEYS: JSON.stringify(options.reconciliationKeys), ...envChange };
  f.db.projectId = 'synthetic-dedicated'; let initializations = 0;
  const context = vm.createContext({ process: { env }, Buffer, Date: class extends Date { static now() { return NOW; } } });
  const next = { NextRequest: class {}, NextResponse: { json: (data, args = {}) => ({ data, status: args.status || 200 }) } };
  const sources = {
    'next/server': next,
    '@/lib/server/firebaseAdmin': { getAdminDb: () => { initializations++; return f.db; } },
    '@/lib/server/productionSpend': { authenticateSpend, spendAction, spendRecord, SpendRejected },
  };
  const source = stripTypeScriptTypes(readFileSync(new URL('../assetfactory-studio/app/api/worker/production-spend/route.ts', import.meta.url), 'utf8'), { mode: 'strip' });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async specifier => { const values = sources[specifier]; return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); });
  await module.evaluate();
  const post = async (body, token = env.ASSET_FACTORY_SPEND_WORKER_TOKEN) => module.namespace.POST({ headers: { get: name => name === 'authorization' ? `Bearer ${token}` : '0' }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
  return { post, env, initializations: () => initializations };
}
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
  assert.equal(result.status, 200); assert.equal(reads, 6); assert.equal(writes, 2);
  assert.equal(f.db.rows.get(f.jobPath).job.attempts.length, 1);
});
test('actual HTTP route blocks shared/mismatched store and missing exact deployment source', async () => {
  for (const change of [{ ASSET_FACTORY_FIREBASE_PROJECT_ID: '' }, { FIREBASE_PROJECT_ID: 'other' }, { ASSET_FACTORY_FIREBASE_PROJECT_ID: 'urai-4dc1d', FIREBASE_PROJECT_ID: 'urai-4dc1d' }, { URAI_SOURCE_SHA: '' }]) { const f = fixture(), r = await route(f, change); const result = await r.post({ ...f.input, action: 'reserve' }); assert.equal(result.status, 503); assert.equal(r.initializations(), 0); }
});
test('actual HTTP route preserves non-authorizing preflight and invokes protected reserve', async () => {
  const f = fixture(), r = await route(f); const result = await r.post({ ...f.input, action: 'preflight' }); assert.equal(result.status, 200); assert.equal(result.data.provider_call_authorized, false); const reserved = await r.post({ ...f.input, action: 'reserve' }); assert.equal(reserved.status, 200); assert.equal(reserved.data.execution_performed, false); assert.equal(f.db.rows.get(f.jobPath).job.attempts.length, 1);
});
test('actual HTTP reconciliation route requires a distinct independently authenticated actor', async () => {
  const f = fixture(), r = await route(f); const a = await act(f, 'reserve'); const fields = { ...f.input, action: 'reconcile', ...charge(f, a, 'SUCCEEDED') }; assert.equal((await r.post(fields)).status, 401); assert.equal((await r.post(fields, r.env.ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN)).status, 200);
  const same = await route(f, { ASSET_FACTORY_SPEND_RECONCILIATION_TOKEN: r.env.ASSET_FACTORY_SPEND_WORKER_TOKEN }); assert.equal((await same.post(fields)).status, 503);
});

