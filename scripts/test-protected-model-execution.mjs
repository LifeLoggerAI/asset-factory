import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireProtectedExecution, recoverProtectedExecution, classifyRequest, COLLECTIONS, digest, wireInputDigest, canonicalAccountId, loadProtectedExecution } from '../model_forge/protected-execution.mjs';
import { createWirePlan } from '../model_forge/create-wire-plan.mjs';

const stamp = 1_000;
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const kinds = ['BOUNDED_MODEL_FORGE_SPEND', 'API_BALANCE', 'PROVIDER_CHARGE', 'PROVIDER_CONTROLS'];
const signers = Object.fromEntries(kinds.map((kind) => {
  const pair = crypto.generateKeyPairSync('ed25519');
  return [kind, { ...pair, keyId: kind.toLowerCase() }];
}));
const issuerKeys = Object.fromEntries(Object.entries(signers).map(([kind, signer]) => [signer.keyId, { kinds: [kind], publicKey: signer.publicKey.export({ type: 'spki', format: 'pem' }) }]));
function signed(payload) {
  const signer = signers[payload.kind];
  return { keyId: signer.keyId, payload, signature: crypto.sign(null, Buffer.from(canonical(payload)), signer.privateKey).toString('base64url') };
}
const clone = (v) => structuredClone(v);

// Fake persistence serializes and can re-run real transaction callbacks without applying
// abandoned writes. These tests exercise the shipped executor; they are not Firestore/IAM proof.
class TransactionDb {
  rows = new Map();
  queue = Promise.resolve();
  retries = 0;
  collection(name) { return { doc: (id) => ({ key: `${name}/${id}` }) }; }
  put(collection, id, value) { this.rows.set(`${collection}/${id}`, clone(value)); }
  get(collection, id) { return clone(this.rows.get(`${collection}/${id}`)); }
  values(collection) { return [...this.rows.entries()].filter(([k]) => k.startsWith(`${collection}/`)).map(([, v]) => clone(v)); }
  async runTransaction(callback) {
    const prior = this.queue;
    let release;
    this.queue = new Promise((resolve) => { release = resolve; });
    await prior;
    try {
      const run = async () => {
        const writes = new Map();
        let wrote = false;
        const transaction = {
          get: async (ref) => { assert.equal(wrote, false, 'Firestore reads must precede writes'); const value = this.rows.get(ref.key); return { exists: value !== undefined, data: () => clone(value) }; },
          set: (ref, value) => { wrote = true; writes.set(ref.key, clone(value)); },
        };
        const result = await callback(transaction);
        return { writes, result };
      };
      if (this.retries > 0) { this.retries--; await run(); }
      const { writes, result } = await run();
      for (const [key, value] of writes) this.rows.set(key, value);
      return result;
    } finally { release(); }
  }
}

const fixtureBodies = new WeakMap();
function fixture(options = {}) {
  const db = options.db ?? new TransactionDb();
  let clock = stamp;
  let fetches = 0;
  const request = {
    schemaVersion: 1, projectId: 'synthetic-dedicated-project', provider: 'replicate', model: 'test/model',
    sourceAuthority: { repository: 'LifeLoggerAI/asset-factory', sha: '1'.repeat(40) },
    executorDigest: 'a'.repeat(64), assetId: options.assetId ?? 'asset-one',
    credentialFingerprint: crypto.createHash('sha256').update('synthetic-test-only').digest('hex'),
    maxAttempts: 1, maxRuntimeMs: 2_000, maxCreateCalls: options.maxCreateCalls ?? 1,
    wirePlan: Array.from({ length: options.maxCreateCalls ?? 1 }, () => ({ url: 'https://api.replicate.com/v1/models/test/model/predictions', bodyType: 'JSON', body: { input: options.input ?? 'one' } })),
  };
  request.inputDigest = wireInputDigest(request.wirePlan);
  const balance = {
    schemaVersion: 1, kind: 'API_BALANCE', accountId: 'account-test', provider: request.provider,
    projectId: request.projectId, issuedAtMs: stamp, expiresAtMs: 20_000, balanceType: 'API',
    credentialFingerprint: request.credentialFingerprint,
    providerReceipt: 'fictional-balance-for-software-test-only', availableUsdMicros: options.availableUsd ?? 1_000,
    availableCredits: options.availableCredits ?? 100, maxConcurrency: options.concurrency ?? 2,
  };
  const grantId = options.grantId ?? 'grant-one';
  const grant = {
    schemaVersion: 1, kind: 'BOUNDED_MODEL_FORGE_SPEND', grantId,
    accountId: balance.accountId, provider: request.provider, projectId: request.projectId,
    issuedAtMs: stamp, expiresAtMs: 15_000, requestDigest: digest(request), executorDigest: request.executorDigest,
    balanceDigest: digest(balance), maxUsdMicros: options.capUsd ?? 500, maxCredits: options.capCredits ?? 10,
    maxCreateCalls: request.maxCreateCalls, maxRuntimeMs: 2_000, priceMode: 'FIXED_PRICE_CAPPED',
    priceReceipt: 'fictional-pricing', rightsReviewed: true, rightsReceipt: 'fictional-rights',
    reuseDecision: 'MISSING_COMPONENT', reuseReceipt: 'fictional-reuse', acceptanceReceipt: 'fictional-acceptance',
    expectedOutputs: ['candidate.glb', 'provenance.json'], ownerLane: 'software-test', consumer: 'synthetic-consumer', approver: 'synthetic-authority',
    artifactHosts: ['fictional-artifacts.invalid'],
  };
  const controls = {
    schemaVersion: 1, kind: 'PROVIDER_CONTROLS', accountId: grant.accountId, provider: request.provider, projectId: request.projectId,
    requestDigest: digest(request), executorDigest: request.executorDigest, sourceSha: request.sourceAuthority.sha,
    issuedAtMs: stamp, expiresAtMs: 20_000, maxUsdMicros: grant.maxUsdMicros, maxCredits: grant.maxCredits, maxRuntimeMs: grant.maxRuntimeMs,
    hardStopSupported: true, costCapEnforced: true, autoTopUp: false, providerProofReceipt: 'synthetic-software-test-only-not-real-provider-proof',
  };
  grant.controlsDigest = digest(controls);
  const accountId = canonicalAccountId(request.provider, balance.accountId);
  db.put(COLLECTIONS.balances, accountId, signed(balance));
  if (!db.get(COLLECTIONS.accounts, accountId)) db.put(COLLECTIONS.accounts, accountId, {
    provider: request.provider, account_id: balance.accountId, balance_type: 'API', trusted_readback: true,
    observed_at: new Date(balance.issuedAtMs).toISOString(), expires_at: new Date(balance.expiresAtMs).toISOString(),
    available_usd_micros: balance.availableUsdMicros, available_credits: balance.availableCredits, frozen: false, reservations: [],
  });
  db.put(COLLECTIONS.approvals, grantId, signed(grant));
  db.put(COLLECTIONS.controls, digest(request), signed(controls));
  const fetchImpl = options.fetchImpl ?? (async () => { fetches++; return Response.json({ id: options.taskId ?? 'task-test' }); });
  const acquire = async () => {
    const execution = await acquireProtectedExecution({ db, request, grantId, issuerKeys, now: () => clock, fetchImpl });
    fixtureBodies.set(execution, JSON.stringify(request.wirePlan[0].body));
    return execution;
  };
  const addReceipt = (execution, overrides = {}) => {
    const taskId = overrides.taskId ?? options.taskId ?? 'task-test';
    const receipt = {
      schemaVersion: 1, kind: 'PROVIDER_CHARGE', accountId: grant.accountId, provider: request.provider,
      projectId: request.projectId, grantId, requestDigest: execution.requestDigest, taskId,
      issuedAtMs: stamp, expiresAtMs: 20_000, billedFinal: true, status: 'SUCCEEDED',
      actualUsdMicros: 120, actualCredits: 2, providerReceipt: 'fictional-final-charge', ...overrides,
    };
    db.put(COLLECTIONS.receipts, digest({ accountId: grant.accountId, provider: request.provider, taskId }), signed(receipt));
  };
  return { db, request, grant, grantId, balance, controls, accountId, acquire, addReceipt, calls: () => fetches, now: (v) => { clock = v; } };
}

const create = (run) => run.requestJson('https://api.replicate.com/v1/models/test/model/predictions', { method: 'POST', headers: { Authorization: 'Bearer synthetic-test-only' }, body: fixtureBodies.get(run) ?? '{}' });
const claim = (f) => f.db.values(COLLECTIONS.claims)[0];
const ledger = (f) => f.db.get(COLLECTIONS.ledgers, f.accountId);
const shared = (f) => f.db.get(COLLECTIONS.accounts, f.accountId);

test('an environment spend bit and offline pass cannot authorize or contact a provider', async () => {
  await assert.rejects(loadProtectedExecution({}, { URAI_MODEL_FORGE_SPEND_AUTHORIZED: '1' }), /remains disabled/);
});

for (const invalid of ['missing', 'wrong-purpose', 'no-hard-stop', 'no-cost-cap', 'auto-top-up', 'wrong-build', 'over-cap', 'expired', 'no-proof']) {
  test(`authentic bounded approval without ${invalid} native control admission cannot reserve or dispatch`, async () => {
    const f = fixture(); const controls = { ...f.controls };
    if (invalid === 'no-hard-stop') controls.hardStopSupported = false;
    if (invalid === 'no-cost-cap') controls.costCapEnforced = false;
    if (invalid === 'auto-top-up') controls.autoTopUp = true;
    if (invalid === 'wrong-build') controls.sourceSha = '2'.repeat(40);
    if (invalid === 'over-cap') controls.maxCredits++;
    if (invalid === 'expired') controls.expiresAtMs = stamp;
    if (invalid === 'no-proof') controls.providerProofReceipt = '';
    f.grant.controlsDigest = digest(controls);
    f.db.put(COLLECTIONS.approvals, f.grantId, signed(f.grant));
    const record = signed(controls);
    if (invalid === 'wrong-purpose') record.keyId = signers.BOUNDED_MODEL_FORGE_SPEND.keyId;
    f.db.put(COLLECTIONS.controls, digest(f.request), invalid === 'missing' ? null : record);
    await assert.rejects(f.acquire());
    assert.equal(f.calls(), 0); assert.equal(f.db.values(COLLECTIONS.claims).length, 0);
  });
}

test('remote control revocation is rechecked before dispatch without releasing the held cap', async () => {
  const f = fixture(); const run = await f.acquire();
  f.db.put(COLLECTIONS.controls, digest(f.request), signed({ ...f.controls, costCapEnforced: false }));
  await assert.rejects(create(run)); assert.equal(f.calls(), 0); assert.equal(ledger(f).reservedUsdMicros, 500);
  await run.stop();
});

test('shorter authenticated native runtime also shortens the actual local execution deadline', async () => {
  const f = fixture(); const controls = { ...f.controls, maxRuntimeMs: 1_000 };
  f.grant.controlsDigest = digest(controls);
  f.db.put(COLLECTIONS.approvals, f.grantId, signed(f.grant));
  f.db.put(COLLECTIONS.controls, digest(f.request), signed(controls));
  const run = await f.acquire(); assert.equal(run.deadlineMs, stamp + 1_000);
  f.now(stamp + 1_001); await assert.rejects(create(run), /deadline reached/);
  assert.equal(f.calls(), 0); assert.equal(ledger(f).reservedUsdMicros, 500); await run.stop();
});

for (const mutation of ['signature', 'request', 'future', 'expired', 'purpose', 'unknown-key', 'unreviewed', 'float-budget', 'missing-pricing', 'balance']) {
  test(`reject ${mutation} before any reservation or provider call`, async () => {
    const f = fixture();
    const record = signed(f.grant);
    if (mutation === 'signature') record.signature = 'x'.repeat(86);
    if (mutation === 'request') f.request.model = 'test/changed';
    if (mutation === 'future') { record.payload.issuedAtMs = stamp + 1; Object.assign(record, signed(record.payload)); }
    if (mutation === 'expired') { record.payload.expiresAtMs = stamp; Object.assign(record, signed(record.payload)); }
    if (mutation === 'purpose') record.keyId = signers.API_BALANCE.keyId;
    if (mutation === 'unknown-key') record.keyId = 'untrusted-key';
    if (mutation === 'unreviewed') { record.payload.rightsReviewed = false; Object.assign(record, signed(record.payload)); }
    if (mutation === 'float-budget') { record.payload.maxUsdMicros = 0.2; Object.assign(record, signed(record.payload)); }
    if (mutation === 'missing-pricing') { delete record.payload.priceReceipt; Object.assign(record, signed(record.payload)); }
    if (mutation === 'balance') f.db.put(COLLECTIONS.balances, f.accountId, signed({ ...f.balance, availableUsdMicros: 999 }));
    f.db.put(COLLECTIONS.approvals, f.grantId, record);
    await assert.rejects(f.acquire());
    assert.equal(f.calls(), 0);
    assert.equal(f.db.values(COLLECTIONS.claims).length, 0);
  });
}

test('twenty simultaneous duplicate claims produce exactly one reservation and one provider create', async () => {
  const f = fixture();
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => f.acquire()));
  const admitted = results.filter((v) => v.status === 'fulfilled');
  assert.equal(admitted.length, 1);
  await create(admitted[0].value);
  assert.equal(f.calls(), 1);
  assert.equal(ledger(f).activeJobs, 1);
  assert.equal(ledger(f).reservedUsdMicros, 500);
  await admitted[0].value.stop();
  await assert.rejects(f.acquire(), /already claimed/);
});

test('transaction callback retries do not double reserve or dispatch', async () => {
  const f = fixture(); f.db.retries = 1;
  const run = await f.acquire(); f.db.retries = 1;
  await create(run);
  assert.equal(f.calls(), 1);
  assert.equal(ledger(f).reservedUsdMicros, 500);
  assert.equal(claim(f).operations.length, 1);
  await run.stop();
});

test('shared account rejects concurrent over-budget inputs atomically', async () => {
  const a = fixture({ capUsd: 600 });
  const b = fixture({ db: a.db, input: 'two', grantId: 'grant-two', capUsd: 600 });
  const results = await Promise.allSettled([a.acquire(), b.acquire()]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(ledger(a).reservedUsdMicros, 600);
  for (const r of results) if (r.status === 'fulfilled') await r.value.stop();
});

test('shared credits are reserved independently from USD', async () => {
  const a = fixture({ capUsd: 10, capCredits: 60 });
  const b = fixture({ db: a.db, input: 'two', grantId: 'grant-two', capUsd: 10, capCredits: 60 });
  const run = await a.acquire();
  await assert.rejects(b.acquire(), /budget exhausted/);
  assert.equal(ledger(a).reservedCredits, 60);
  await run.stop();
});

test('canonical account key matches the existing image gateway provider/account namespace', () => {
  assert.equal(canonicalAccountId('replicate', 'account-test'), crypto.createHash('sha256').update('replicate\naccount-test').digest('hex'));
});

test('other image-consumer holds constrain Forge cash and credits on the same canonical account', async () => {
  for (const reservation of [{ job_id: 'existing-image-job', usd_micros: 501, credits: 0 }, { job_id: 'existing-image-job', usd_micros: 0, credits: 91 }]) {
    const f = fixture();
    f.db.put(COLLECTIONS.accounts, f.accountId, { ...shared(f), reservations: [reservation] });
    await assert.rejects(f.acquire(), /shared available budget exhausted/);
    assert.equal(f.calls(), 0); assert.equal(f.db.values(COLLECTIONS.claims).length, 0);
  }
});

test('a Forge reservation is visible to another consumer and its final actual debit remains held', async () => {
  const f = fixture();
  f.db.put(COLLECTIONS.accounts, f.accountId, { ...shared(f), reservations: [{ job_id: 'existing-image-job', usd_micros: 100, credits: 1, settled: true }] });
  const run = await f.acquire(); await create(run);
  assert.equal(shared(f).reservations.reduce((sum, row) => sum + row.usd_micros, 0), 600);
  f.addReceipt(run); await run.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' });
  assert.equal(shared(f).reservations.reduce((sum, row) => sum + row.usd_micros, 0), 220);
  assert.equal(shared(f).reservations.filter((row) => row.settled).length, 2);
  await run.stop();
});

test('shared account freeze, malformed reservations and changed API snapshot reject before dispatch', async () => {
  for (const mutation of [{ frozen: 'false' }, { frozen: true }, { reservations: [{ job_id: 'bad', usd_micros: 1.1, credits: 0 }] }, { available_usd_micros: 999 }]) {
    const f = fixture(); f.db.put(COLLECTIONS.accounts, f.accountId, { ...shared(f), ...mutation });
    await assert.rejects(f.acquire()); assert.equal(f.calls(), 0);
  }
  const f = fixture(); const run = await f.acquire();
  f.db.put(COLLECTIONS.accounts, f.accountId, { ...shared(f), reservations: [] });
  await assert.rejects(create(run), /changed or disappeared/); assert.equal(f.calls(), 0); await run.stop();
});

test('unreconciled work continues to consume shared concurrency and budget', async () => {
  const a = fixture({ concurrency: 1 });
  const b = fixture({ db: a.db, input: 'two', grantId: 'grant-two', concurrency: 1 });
  const run = await a.acquire(); await create(run); await run.stop();
  await assert.rejects(b.acquire(), /concurrency exhausted/);
  assert.equal(claim(a).state, 'UNRECONCILED');
  assert.equal(ledger(a).activeJobs, 1);
});

test('concurrent creates in one admitted job cannot bypass the dispatch cap', async () => {
  const f = fixture(); const run = await f.acquire();
  const results = await Promise.allSettled([create(run), create(run), create(run)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.calls(), 1); assert.equal(claim(f).operations.length, 1);
  await run.stop();
});

for (const failure of ['429', 'timeout', 'missing-task', 'invalid-json', 'oversize-json']) {
  test(`ambiguous ${failure} performs one HTTP create, blocks retry and retains full exposure`, async () => {
    let calls = 0;
    const f = fixture({ fetchImpl: async () => {
      calls++;
      if (failure === '429') return Response.json({}, { status: 429 });
      if (failure === 'timeout') throw new Error('synthetic timeout after dispatch');
      if (failure === 'missing-task') return Response.json({ status: 'unknown' });
      if (failure === 'invalid-json') return new Response('{');
      return new Response('x'.repeat(1024 * 1024 + 1));
    } });
    const run = await f.acquire();
    await assert.rejects(create(run)); await assert.rejects(create(run));
    assert.equal(calls, 1); assert.equal(ledger(f).reservedUsdMicros, 500);
    await run.stop(); await assert.rejects(f.acquire(), /already claimed/);
  });
}

test('hard deadline stops dispatch/read/sleep and never frees ambiguous funds', async () => {
  const f = fixture(); const run = await f.acquire(); f.now(run.deadlineMs);
  await assert.rejects(create(run), /deadline reached/);
  await assert.rejects(run.requestJson('https://api.replicate.com/v1/predictions/task-test'));
  await assert.rejects(run.sleep(1));
  assert.equal(f.calls(), 0); await run.stop(); assert.equal(ledger(f).reservedUsdMicros, 500);
});

test('live AbortSignal terminates a stalled dispatch at the overall deadline', async () => {
  const f = fixture({ fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const run = await f.acquire();
  const keepAlive = setInterval(() => {}, 100);
  try { await assert.rejects(create(run), /hard deadline/); } finally { clearInterval(keepAlive); await run.stop(); }
  assert.equal(claim(f).operations.length, 1); assert.equal(ledger(f).reservedUsdMicros, 500);
});

test('changed approval is revalidated immediately before charged dispatch', async () => {
  const f = fixture(); const run = await f.acquire();
  f.db.put(COLLECTIONS.approvals, f.grantId, signed({ ...f.grant, approver: 'changed-authority' }));
  await assert.rejects(create(run), /changed after reservation/); assert.equal(f.calls(), 0); await run.stop();
});

test('unknown, non-HTTPS, credential-bearing and off-provider endpoints cannot receive credentials', async () => {
  const f = fixture(); const run = await f.acquire();
  for (const url of ['https://evil.invalid/v1/predictions', 'http://api.replicate.com/v1/predictions', 'https://secret@api.replicate.com/v1/predictions', 'https://api.replicate.com:444/v1/predictions', 'https://api.replicate.com/v1/predictions?override=1']) await assert.rejects(run.requestJson(url, { method: 'POST' }));
  assert.equal(f.calls(), 0); await run.stop();
});

test('status/download POSTs do not masquerade as charged Rodin creates', () => {
  assert.equal(classifyRequest('rodin', 'https://api.hyper3d.com/api/v2/status', 'POST'), 'READ');
  assert.equal(classifyRequest('rodin', 'https://api.hyper3d.com/api/v2/rodin', 'POST'), 'CREATE');
});

for (const invalid of ['missing', 'nonfinal', 'wrong-account', 'wrong-task', 'wrong-outcome', 'float', 'negative', 'unsigned', 'wrong-purpose']) {
  test(`reject ${invalid} charge receipt without releasing reservation`, async () => {
    const f = fixture(); const run = await f.acquire(); await create(run);
    let overrides = {};
    if (invalid === 'nonfinal') overrides.billedFinal = false;
    if (invalid === 'wrong-account') overrides.accountId = 'other-account';
    if (invalid === 'wrong-task') overrides.taskId = 'wrong-task';
    if (invalid === 'wrong-outcome') overrides.status = 'FAILED';
    if (invalid === 'float') overrides.actualUsdMicros = 1.5;
    if (invalid === 'negative') overrides.actualCredits = -1;
    if (invalid !== 'missing') f.addReceipt(run, overrides);
    if (['unsigned', 'wrong-purpose'].includes(invalid)) {
      const id = digest({ accountId: f.grant.accountId, provider: f.request.provider, taskId: 'task-test' });
      const record = f.db.get(COLLECTIONS.receipts, id);
      if (invalid === 'unsigned') record.signature = 'x'.repeat(86);
      else record.keyId = signers.BOUNDED_MODEL_FORGE_SPEND.keyId;
      f.db.put(COLLECTIONS.receipts, id, record);
    }
    await assert.rejects(run.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' }));
    assert.equal(ledger(f).reservedUsdMicros, 500); assert.equal(ledger(f).spentUsdMicros, 0); await run.stop();
  });
}

test('exact final signed charge reconciles actual spend, releases unused funds and prevents replay', async () => {
  const f = fixture(); const run = await f.acquire(); await create(run); f.addReceipt(run);
  const result = await run.reconcile({ status: 'SUCCEEDED', taskId: 'task-test', artifact: { sha256: 'b'.repeat(64) } });
  assert.deepEqual(result, { state: 'SUCCEEDED', actualUsdMicros: 120, actualCredits: 2, chargeReconciled: true, reservationReleased: true });
  assert.equal(ledger(f).reservedUsdMicros, 0); assert.equal(ledger(f).spentUsdMicros, 120); assert.equal(ledger(f).activeJobs, 0);
  await assert.rejects(run.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' }));
  await run.stop(); await assert.rejects(f.acquire(), /already claimed/);
});

test('known terminal failure can release unused reservation only after final native charge receipt', async () => {
  const f = fixture(); const run = await f.acquire(); await create(run); f.addReceipt(run, { status: 'FAILED', actualUsdMicros: 30 });
  await run.reconcile({ status: 'FAILED', taskId: 'task-test' }); await run.stop();
  assert.equal(ledger(f).reservedUsdMicros, 0); assert.equal(ledger(f).spentUsdMicros, 30);
  await assert.rejects(f.acquire(), /already claimed/);
});

test('actual charge breach quarantines the account and retains exposure instead of silently normalizing', async () => {
  const f = fixture(); const run = await f.acquire(); await create(run); f.addReceipt(run, { actualUsdMicros: 501 });
  const result = await run.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' });
  assert.equal(result.state, 'QUARANTINED'); assert.equal(result.reservationReleased, false);
  assert.equal(ledger(f).frozen, true); assert.equal(ledger(f).reservedUsdMicros, 500); await run.stop();
});

test('two-stage create requires acknowledgement and final charge evidence for both operations', async () => {
  let id = 0;
  const f = fixture({ maxCreateCalls: 2, fetchImpl: async () => Response.json({ id: `task-${++id}` }) });
  const run = await f.acquire(); await create(run); await create(run); await assert.rejects(create(run));
  f.addReceipt(run, { taskId: 'task-2' });
  await assert.rejects(run.reconcile({ status: 'SUCCEEDED', taskId: 'task-2' }));
  f.addReceipt(run, { taskId: 'task-1' });
  await run.reconcile({ status: 'SUCCEEDED', taskId: 'task-2' });
  assert.equal(ledger(f).spentUsdMicros, 240); assert.equal(ledger(f).activeJobs, 0); await run.stop();
});

test('second grant identifier cannot bypass permanent input claim', async () => {
  const a = fixture(); const run = await a.acquire(); await create(run); await run.stop();
  const b = fixture({ db: a.db, grantId: 'grant-two' });
  await assert.rejects(b.acquire(), /already claimed/);
});

test('two genuine bounded grants for renamed assets still dispatch the same provider inputs only once', async () => {
  const a = fixture({ assetId: 'original-asset-label' });
  const b = fixture({ db: a.db, grantId: 'grant-renamed', assetId: 'renamed-asset-label' });
  assert.notEqual(a.grant.requestDigest, b.grant.requestDigest);
  assert.equal(a.request.inputDigest, b.request.inputDigest);
  const admitted = await Promise.allSettled([a.acquire(), b.acquire()]);
  assert.equal(admitted.filter((v) => v.status === 'fulfilled').length, 1);
  const run = admitted.find((v) => v.status === 'fulfilled').value;
  await create(run);
  assert.equal(a.calls() + b.calls(), 1);
  assert.equal(a.db.values(COLLECTIONS.claims).length, 1);
  assert.equal(ledger(a).reservedUsdMicros, 500);
  await run.stop();
});

test('even a signed metadata-only input digest cannot reset a permanent wire-input claim', async () => {
  const a = fixture(); const run = await a.acquire(); await create(run); await run.stop();
  const b = fixture({ db: a.db, grantId: 'grant-renamed', assetId: 'another-label' });
  b.request.inputDigest = digest({ assetId: b.request.assetId });
  b.grant.requestDigest = digest(b.request);
  b.db.put(COLLECTIONS.approvals, b.grantId, signed(b.grant));
  await assert.rejects(b.acquire(), /normalized actual provider wire inputs/);
  assert.equal(a.calls(), 1); assert.equal(b.calls(), 0);
});

test('consumed provider receipt cannot be assigned to another paid attempt', async () => {
  const a = fixture(); const runA = await a.acquire(); await create(runA); a.addReceipt(runA); await runA.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' }); await runA.stop();
  const b = fixture({ db: a.db, input: 'two', grantId: 'grant-two' });
  const runB = await b.acquire(); await create(runB); b.addReceipt(runB);
  await assert.rejects(runB.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' }), /already consumed/);
  assert.equal(ledger(b).reservedUsdMicros, 500); await runB.stop();
});

test('actual CLI rejects flag-only execution and dry-run stays unauthorized with synthetic credentials', (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-protected-cli-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const spec = path.join(cwd, 'spec.json');
  fs.writeFileSync(spec, JSON.stringify({ id: 'synthetic-input', prompt: 'software-test-only', providers: ['replicate'], generation: { maxProviderAttempts: 1 } }));
  const forge = new URL('../model_forge/forge.mjs', import.meta.url).pathname;
  const env = { PATH: process.env.PATH, URAI_MODEL_FORGE_SPEND_AUTHORIZED: '1', REPLICATE_API_TOKEN: 'synthetic-test-only' };
  const result = spawnSync(process.execPath, [forge, '--spec', spec], { cwd, env, encoding: 'utf8', timeout: 5_000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /environment spend bit is insufficient/);
  const dry = spawnSync(process.execPath, [forge, '--spec', spec, '--dry-run'], { cwd, env, encoding: 'utf8', timeout: 5_000 });
  assert.equal(dry.status, 0, dry.stderr); const receipt = JSON.parse(dry.stdout);
  assert.equal(receipt.spendAuthorized, false); assert.equal(receipt.providerCallAuthorized, false); assert.equal(receipt.executionPerformed, false);
  assert.equal(fs.existsSync(path.join(cwd, 'model_forge/runs')), false);
});

for (const mismatch of ['model-endpoint', 'body', 'method-getter', 'header-getter', 'different-credential', 'mutable-request-accessor']) {
  test(`actual dispatch rejects ${mismatch} with zero provider calls`, async () => {
    const f = fixture();
    if (mismatch === 'mutable-request-accessor') {
      Object.defineProperty(f.request, 'model', { get: () => 'test/model', enumerable: true });
      await assert.rejects(f.acquire(), /accessors/); return;
    }
    const run = await f.acquire();
    let url = 'https://api.replicate.com/v1/models/test/model/predictions';
    const init = { method: 'POST', body: JSON.stringify(f.request.wirePlan[0].body), headers: { Authorization: 'Bearer synthetic-test-only' } };
    if (mismatch === 'model-endpoint') url = 'https://api.replicate.com/v1/models/other/expensive-model/predictions';
    if (mismatch === 'body') init.body = '{"input":{"unapproved_expensive_option":true}}';
    if (mismatch === 'method-getter') Object.defineProperty(init, 'method', { get: (() => { let calls = 0; return () => ++calls === 1 ? 'GET' : 'POST'; })() });
    if (mismatch === 'header-getter') Object.defineProperty(init.headers, 'Authorization', { get: () => 'Bearer other-account' });
    if (mismatch === 'different-credential') init.headers.Authorization = 'Bearer different-account-token';
    await assert.rejects(run.requestJson(url, init));
    assert.equal(f.calls(), 0); assert.equal(claim(f).operations.length, 0); await run.stop();
  });
}

test('malformed freeze/counter fields fail closed during acquisition and reconciliation', async () => {
  const f = fixture(); const run = await f.acquire(); await create(run); f.addReceipt(run);
  for (const [name, value] of [['frozen', 'false'], ['activeJobs', '1'], ['reservedUsdMicros', 500.5]]) {
    const original = ledger(f);
    f.db.put(COLLECTIONS.ledgers, f.accountId, { ...original, [name]: value });
    await assert.rejects(run.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' }));
    const b = fixture({ db: f.db, input: 'two', grantId: 'grant-two' });
    await assert.rejects(b.acquire());
    f.db.put(COLLECTIONS.ledgers, f.accountId, original);
  }
  await run.stop();
});

test('expired acknowledged work recovers after process restart using original snapshots and zero dispatch', async () => {
  const f = fixture(); const run = await f.acquire(); await create(run); await run.stop(); f.now(16_000); f.addReceipt(run);
  const recovery = await recoverProtectedExecution({ db: f.db, claimId: run.claimId, issuerKeys, now: () => 16_000 });
  await assert.rejects(create(recovery), /read-only/); await assert.rejects(recovery.sleep(1), /read-only/);
  const result = await recovery.reconcile({ status: 'SUCCEEDED', taskId: 'task-test' });
  assert.equal(result.chargeReconciled, true); assert.equal(f.calls(), 1); assert.equal(ledger(f).activeJobs, 0); await recovery.stop();
});

test('read-only recovery cannot seize a still-live context or recycle an ambiguous create', async () => {
  const f = fixture({ fetchImpl: async () => { throw new Error('synthetic transport ambiguity'); } });
  const run = await f.acquire(); await assert.rejects(create(run));
  await assert.rejects(recoverProtectedExecution({ db: f.db, claimId: run.claimId, issuerKeys, now: () => stamp }), /live execution/);
  await run.stop();
  const recovery = await recoverProtectedExecution({ db: f.db, claimId: run.claimId, issuerKeys, now: () => 16_000 });
  await assert.rejects(recovery.reconcile({ status: 'FAILED', taskId: null }), /unknown dispatched task/);
  assert.equal(ledger(f).reservedUsdMicros, 500); await recovery.stop();
});

test('expired reservation with a proved zero dispatch history safely releases unused funds', async () => {
  const f = fixture(); const run = await f.acquire(); await run.stop();
  const recovery = await recoverProtectedExecution({ db: f.db, claimId: run.claimId, issuerKeys, now: () => 16_000 });
  const result = await recovery.reconcile({ status: 'FAILED', taskId: null });
  assert.equal(result.providerCallsExecuted, 0); assert.equal(result.reservationReleased, true);
  assert.equal(ledger(f).reservedUsdMicros, 0); assert.equal(ledger(f).spentUsdMicros, 0); assert.equal(f.calls(), 0); await recovery.stop();
});

test('artifact requests require exact signed host admission within the active deadline', async () => {
  const f = fixture(); const run = await f.acquire();
  assert.doesNotThrow(() => run.assertArtifactUrl('https://fictional-artifacts.invalid/a.glb?signature=synthetic'));
  for (const url of ['https://other.invalid/a.glb', 'http://fictional-artifacts.invalid/a.glb', 'https://secret@fictional-artifacts.invalid/a.glb']) assert.throws(() => run.assertArtifactUrl(url));
  f.now(run.deadlineMs); assert.throws(() => run.assertArtifactUrl('https://fictional-artifacts.invalid/a.glb')); await run.stop();
});

test('signed multipart plan binds actual frozen file bytes/name/type before paid dispatch', async () => {
  const f = fixture();
  const spec = { prompt: 'fictional-test', target: { pbr: true, maxTriangles: 100, textureResolution: '4k' }, generation: { seed: null }, referenceImages: ['fixture.png'], verifiedLocalReferences: new Map([['fixture.png', Buffer.from('synthetic-image-bytes')]]) };
  f.request.provider = 'rodin'; f.request.model = 'Gen-2.5-Medium'; f.request.wirePlan = createWirePlan(spec, 'rodin', f.request.model);
  f.request.inputDigest = wireInputDigest(f.request.wirePlan);
  const balance = { ...f.balance, provider: 'rodin' };
  const controls = { ...f.controls, provider: 'rodin', requestDigest: digest(f.request) };
  const grant = { ...f.grant, provider: 'rodin', requestDigest: digest(f.request), balanceDigest: digest(balance), controlsDigest: digest(controls) };
  const accountId = canonicalAccountId('rodin', balance.accountId);
  f.db.put(COLLECTIONS.balances, accountId, signed(balance));
  f.db.put(COLLECTIONS.accounts, accountId, { ...shared(f), provider: 'rodin' });
  f.db.put(COLLECTIONS.approvals, f.grantId, signed(grant));
  f.db.put(COLLECTIONS.controls, digest(f.request), signed(controls));
  const run = await f.acquire();
  const form = new FormData();
  for (const [key, value] of f.request.wirePlan[0].body) {
    if (typeof value === 'string') form.append(key, value);
    else form.append(key, new Blob([Buffer.from('changed-image-bytes')], { type: value.type }), value.name);
  }
  await assert.rejects(run.requestJson('https://api.hyper3d.com/api/v2/rodin', { method: 'POST', headers: { Authorization: 'Bearer synthetic-test-only' }, body: form }), /wire contract/);
  assert.equal(f.calls(), 0); assert.equal(claim(f).operations.length, 0); await run.stop();
});
