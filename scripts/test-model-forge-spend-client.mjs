import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { canonical, freezeRequest, hash, jobDigest, ModelSpendClient, verifiedSourceSha } from '../model_forge/model-spend-client.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceSha = spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const endpoint = 'https://api.replicate.com/v1/models/tencent/hunyuan-3d-3.1/predictions';
const gatewayUrl = 'https://synthetic-gateway.invalid/api/worker/production-spend';
const model = 'tencent/hunyuan-3d-3.1'; const specHash = '2'.repeat(64);
const init = { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-test-only' }, body: '{"input":{"prompt":"synthetic"}}' };
for (const field of ['reserved_at', 'admission_expires_at']) test(`missing absolute ${field} keeps the reservation held without provider dispatch`, async () => {
  const f = await fixture({ alterReservation: result => delete result[field] });
  await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
  assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1);
});
test('expired preflight is denied without reservation', async () => {
  const f = await fixture({ alterPreflight: result => result.admission_expires_at = new Date(Date.now() - 1).toISOString() });
  await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
  assert.equal(f.state.holds, 0); assert.equal(f.state.providerCalls, 0);
});
test('reservation latency consumes approved runtime instead of restarting it', async () => {
  let clock = Date.now();
  const f = await fixture({ runtime: 1, now: () => clock, alterReservation: () => { clock += 1500; } });
  await assert.rejects(f.make().submit(endpoint, init, model), /deadline/);
  assert.equal(f.state.holds, 1); assert.equal(f.state.providerCalls, 0);
});
test('protected gateway origin drift is blocked before worker authentication transport', async () => {
  const f = await fixture({ env: { ASSET_FORGE_SPEND_GATEWAY_ORIGIN: 'https://another.example.test' } });
  await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
  assert.deepEqual(f.state.actions, []); assert.equal(f.state.providerCalls, 0);
});
function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

async function fixture(options = {}) {
  const prepared = await freezeRequest(endpoint, init, 'replicate');
  const now = (options.now || Date.now)();
  const binding = { content_type: prepared.content_type, credential_sha256: prepared.credential_sha256, semantic_headers_sha256: prepared.semantic_headers_sha256, source_input_sha256: specHash };
  const job = { job_id: 'synthetic-job', account_id: 'synthetic-account', provider: 'replicate', model_version: model, input_sha256: [specHash, prepared.request_sha256], executor: { source_sha: sourceSha, endpoint, request_sha256: prepared.request_sha256, request_size: prepared.request_size, asset: 'fixture', ...binding }, budget: { max_runtime_seconds: options.runtime || 60, max_usd_micros: 1000000, max_credits: 10, rates: { usd_micros_per_unit: 100000, credits_per_unit: 1, receipt: 'SYNTHETIC-NOT-AUTHORIZATION', verified_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3600000).toISOString() } }, attempts: [], approval: { synthetic: true } };
  const fresh = { observed_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3600000).toISOString() };
  job.authority = options.authorityBinding || { repository: 'LifeLoggerAI/asset-factory', sha: sourceSha };
  job.approval = { status: 'APPROVED', kind: 'EXPLICIT_BOUNDED_SPEND', job_digest: jobDigest(job), max_usd_micros: job.budget.max_usd_micros, max_credits: job.budget.max_credits, receipt: 'SYNTHETIC-NOT-AUTHORIZATION', approver: 'synthetic-fixture', issued_at: fresh.observed_at, expires_at: fresh.expires_at };
  const authority = { ...fresh, trusted_readback: true, binding: structuredClone(job.authority) };
  const account = { provider: 'replicate', account_id: job.account_id, balance_type: 'API', trusted_readback: true, credential_sha256: prepared.credential_sha256, credential_binding_verified: true, credential_binding_receipt: 'SYNTHETIC-NOT-AUTHORIZATION', ...fresh };
  const controls = { provider: 'replicate', account_id: job.account_id, endpoint, request_sha256: prepared.request_sha256, ...binding, ...fresh, trusted_readback: true, enforcement_source_sha: sourceSha, hard_stop_supported: true, cost_cap_enforced: true, auto_top_up: false, proof_receipt: 'SYNTHETIC-NOT-AUTHORIZATION', ...job.budget };
  const pricing = { provider: job.provider, account_id: job.account_id, model_version: model, request_sha256: prepared.request_sha256, ...binding, ...fresh, receipt: 'SYNTHETIC-NOT-AUTHORIZATION', trusted_readback: true, rates: structuredClone(job.budget.rates) };
  options.alterPricing?.(pricing);
  options.alterJob?.(job);
  options.alterAccount?.(account); options.alterControls?.(controls);
  // A changed synthetic job is approved at fixture setup, before negative proof mutations.
  // Preserve explicit approval mutations from the retained owner cases.
  job.approval.job_digest = jobDigest(job);
  options.alterApproval?.(job.approval); options.alterAuthority?.(authority);
  const proofExpiry = Math.min(...[job.approval, authority, account, controls, pricing, job.budget.rates].map(proof => Date.parse(proof.expires_at)).filter(Number.isFinite));
  const state = { providerCalls: 0, actions: [], holds: 0, reserved: false, bodies: [], gatewayInputs: [] };
  const env = { URAI_SOURCE_SHA: sourceSha, ASSET_FORGE_SPEND_GATEWAY_URL: gatewayUrl, ASSET_FORGE_SPEND_GATEWAY_ORIGIN: new URL(gatewayUrl).origin, ASSET_FORGE_SPEND_WORKER_TOKEN: 'synthetic-worker-token-with-more-than-32-characters', MODEL_FORGE_SPEND_JOB_IDS_JSON: JSON.stringify({ [prepared.request_sha256]: job.job_id }), ...options.env };
  const fetchImpl = async (url, request) => {
    assert.equal(request.redirect, 'error');
    if (url === gatewayUrl) {
      const input = JSON.parse(request.body); state.actions.push(input.action); state.gatewayInputs.push(input);
      if (input.action === 'preflight') { const result = options.preflight || { ok: true, provider_call_authorized: false, execution_performed: false, admission_expires_at: new Date(proofExpiry).toISOString(), envelope: { job: structuredClone(job), account, protected_controls: controls, protected_pricing: pricing, authority } }; options.alterPreflight?.(result); return response(result); }
      if (input.action === 'reserve') {
        assert.equal(input.request_sha256, prepared.request_sha256); assert.equal(input.request_size, prepared.request_size); assert.equal(input.executor_source_sha, sourceSha);
        assert.equal(input.job_digest, jobDigest(job));
        if (state.reserved) return response({ ok: false }, 409);
        state.reserved = true; state.holds++;
        if (options.reserveLoss) throw Error('synthetic lost reservation response');
        const reservation = { ok: true, provider_call_authorized: true, execution_performed: false, attempt_id: 'synthetic-attempt', job_digest: input.job_digest, executor_source_sha: sourceSha, account_id: job.account_id, ...binding, max_runtime_seconds: job.budget.max_runtime_seconds };
        const reservedAt = (options.now || Date.now)();
        reservation.reserved_at = new Date(reservedAt).toISOString();
        reservation.admission_expires_at = new Date(Math.min(proofExpiry, reservedAt + job.budget.max_runtime_seconds * 1000)).toISOString();
        options.onReserve?.();
        options.alterReservation?.(reservation);
        return response(options.reservation || reservation);
      }
      if (input.action === 'record') { options.advanceRecordClock?.(); options.afterRecord?.(); if (options.recordLoss) throw Error('synthetic lost outcome'); return response({ ok: true, provider_call_authorized: false, reconciliation_required: true }); }
      assert.fail('Unexpected action');
    }
    assert.equal(url, endpoint); state.providerCalls++; state.bodies.push(Buffer.from(request.body));
    if (options.providerLoss) throw Error('synthetic unknown provider outcome');
    options.advanceClock?.();
    return response({ id: 'synthetic-provider-task' }, options.providerStatus || 200);
  };
  const make = () => new ModelSpendClient({ provider: 'replicate', asset: 'fixture', sourceSpecSha256: specHash, env, fetchImpl, now: options.now || Date.now, monotonic: options.monotonic || (() => performance.now()) });
  return { state, make, prepared, env, job, account, controls, pricing, authority };
}

test('canonical digest agrees with pinned gateway unicode and integer serialization', () => {
  assert.equal(canonical({ name: '雪😀', n: 1, ok: true }), '{"n":1,"name":"\\u96ea\\ud83d\\ude00","ok":true}');
  assert.throws(() => canonical({ n: 0.1 }), /integers/); assert.throws(() => canonical({ 'bad-key': true }), /ambiguous/);
});
test('prepared exact POST bytes are bound including endpoint, size and content type', async () => {
  const prepared = await freezeRequest(endpoint, init, 'replicate');
  assert.equal(prepared.request_sha256, hash(Buffer.concat([Buffer.from(`POST\n${endpoint}\n`), Buffer.from(init.body)])));
  assert.equal(prepared.request_size, Buffer.byteLength(init.body)); assert.equal(prepared.content_type, 'application/json');
  assert.equal(prepared.credential_sha256, hash('{"authorization":"Bearer synthetic-test-only"}'));
  assert.equal(prepared.semantic_headers_sha256, hash('{"content-type":"application/json"}'));
});
test('frozen credential and semantic hashes use shared compact sorted JSON without leaking raw header values', async () => {
  const headers = { 'X-Project': 'synthetic-project', Accept: 'application/json', Authorization: 'Bearer synthetic-test-only', 'Content-Type': 'application/json', 'content-length': '999' };
  const request = await freezeRequest(endpoint, { ...init, headers }, 'replicate');
  assert.equal(request.headers.has('content-length'), false);
  assert.equal(request.credential_sha256, hash('{"authorization":"Bearer synthetic-test-only"}'));
  assert.equal(request.semantic_headers_sha256, hash('{"accept":"application/json","content-type":"application/json","x-project":"synthetic-project"}'));
  headers.Authorization = 'Bearer another-token';
  assert.equal(request.headers.get('authorization'), 'Bearer synthetic-test-only');
});
test('effective credential and semantic fingerprints agree with the shared IMAGE and Spatial vector', async () => {
  const request = await freezeRequest(endpoint, { ...init, headers: { Authorization: ' Bearer synthetic-account-A-key ', 'Content-Type': ' application/json ', Accept: 'application/json', 'OpenAI-Project': 'project-alpha', 'User-Agent': 'synthetic/1.0' } }, 'replicate');
  assert.equal(request.credential_sha256, '795c3ac1e639e6cab8e394a1c878c407684417a16dc0c2b282e7fbd35065e570');
  assert.equal(request.semantic_headers_sha256, '9cc4c991c3217deefd158b98a70d65ac5d82c397455acecf701970d29e0b4483');
  assert.equal(request.content_type, 'application/json');
});
test('multipart snapshots are repeatable and retain binary bytes', async () => {
  const form = () => { const f = new FormData(); f.append('prompt', 'synthetic'); f.append('images', new Blob([new Uint8Array([0, 1, 255, 13, 10])], { type: 'image/png' }), 'fixture.png'); return f; };
  const a = await freezeRequest('https://api.hyper3d.com/api/v2/rodin', { method: 'POST', headers: { authorization: 'Bearer synthetic-only' }, body: form() }, 'rodin');
  const b = await freezeRequest('https://api.hyper3d.com/api/v2/rodin', { method: 'POST', headers: { authorization: 'Bearer synthetic-only' }, body: form() }, 'rodin');
  assert.deepEqual(a.body, b.body); assert.equal(a.request_sha256, b.request_sha256); assert(a.body.includes(Buffer.from([0, 1, 255, 13, 10])));
  const parsed = await new Response(a.body, { headers: { 'content-type': a.content_type } }).formData();
  assert.equal(parsed.get('prompt'), 'synthetic'); assert.deepEqual(Buffer.from(await parsed.get('images').arrayBuffer()), Buffer.from([0, 1, 255, 13, 10]));
});
for (const endpointBad of ['http://api.replicate.com/v1/predictions', 'https://api.replicate.com.attacker.invalid/x', 'https://synthetic:secret@api.replicate.com/x', 'https://api.replicate.com/x#fragment']) {
  test(`invalid submission URL blocked: ${endpointBad}`, async () => assert.rejects(freezeRequest(endpointBad, init, 'replicate'), /MODEL_SPEND_BLOCKED/));
}
test('only an exact fresh atomic reservation opens the actual leaf', async () => {
  const f = await fixture(); const client = f.make(); const result = await client.submit(endpoint, init, model);
  assert.equal(result.payload.id, 'synthetic-provider-task'); assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1);
  assert.deepEqual(f.state.actions, ['preflight', 'reserve', 'record']); assert.deepEqual(f.state.bodies[0], f.prepared.body);
  assert.equal(client.records[0].reconciliation_required, true); assert.equal(client.records[0].reported_task_id, 'synthetic-provider-task');
  for (const input of f.state.gatewayInputs) {
    for (const field of ['credential_sha256', 'semantic_headers_sha256', 'content_type']) assert.equal(input[field], f.prepared[field]);
    assert.equal(input.source_input_sha256, specHash);
    assert.equal(input.account_id, input.action === 'preflight' ? undefined : f.job.account_id);
  }
});
test('actual credential drift keeps body identity but blocks before reserve or provider dispatch', async () => {
  const f = await fixture();
  const changed = { ...init, headers: { ...init.headers, authorization: 'Bearer synthetic-account-B' } };
  const actual = await freezeRequest(endpoint, changed, 'replicate');
  assert.equal(actual.request_sha256, f.prepared.request_sha256);
  assert.notEqual(actual.credential_sha256, f.prepared.credential_sha256);
  await assert.rejects(f.make().submit(endpoint, changed, model), /credential_sha256/);
  assert.equal(f.state.gatewayInputs[0].credential_sha256, actual.credential_sha256);
  assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
});
test('account/project routing header drift blocks despite unchanged body and credential', async () => {
  const f = await fixture();
  await assert.rejects(f.make().submit(endpoint, { ...init, headers: { ...init.headers, 'x-project': 'another-project' } }, model), /semantic_headers_sha256/);
  assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
});
test('missing actual bearer credential blocks before any protected admission request', async () => {
  const f = await fixture();
  await assert.rejects(f.make().submit(endpoint, { ...init, headers: { 'content-type': 'application/json' } }, model), /effective provider credential/);
  assert.equal(f.state.providerCalls, 0); assert.deepEqual(f.state.actions, []);
});
for (const [name, alterJob] of [
  ['source', job => job.executor.source_sha = '0'.repeat(40)],
  ['request', job => job.executor.request_sha256 = '0'.repeat(64)],
  ['model', job => job.model_version = 'another/model'],
  ['size', job => job.executor.request_size++],
  ['asset', job => job.executor.asset = 'another-asset'],
  ['content type', job => job.executor.content_type = 'application/octet-stream'],
  ['source input', job => job.input_sha256 = [job.executor.request_sha256]],
  ['request input', job => job.input_sha256 = [specHash]],
  ['mutable remote reference', job => job.executor.remote_reference_inputs = true],
  ['credential hash', job => job.executor.credential_sha256 = '0'.repeat(64)],
  ['semantic header hash', job => delete job.executor.semantic_headers_sha256],
  ['source input binding', job => delete job.executor.source_input_sha256],
]) {
  test(`changed protected ${name} blocks before reservation and provider`, async () => {
    const f = await fixture({ alterJob }); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
  });
}
for (const [name, options] of [
  ['different protected account credential', { alterAccount: account => account.credential_sha256 = '0'.repeat(64) }],
  ['unverified credential/account relationship', { alterAccount: account => account.credential_binding_verified = false }],
  ['missing credential/account proof receipt', { alterAccount: account => delete account.credential_binding_receipt }],
  ['expired protected account readback', { alterAccount: account => account.expires_at = '2000-01-01T00:00:00Z' }],
  ['foreign account proof', { alterAccount: account => account.account_id = 'foreign-account' }],
  ['different protected control credential', { alterControls: controls => controls.credential_sha256 = '0'.repeat(64) }],
  ['different effective-header control proof', { alterControls: controls => controls.semantic_headers_sha256 = '0'.repeat(64) }],
  ['missing protected source/input proof', { alterControls: controls => delete controls.source_input_sha256 }],
  ['expired control proof', { alterControls: controls => controls.expires_at = '2000-01-01T00:00:00Z' }],
  ['larger control runtime cap', { alterControls: controls => controls.max_runtime_seconds++ }],
  ['different pricing credential', { alterPricing: pricing => pricing.credential_sha256 = '0'.repeat(64) }],
  ['different pricing semantic headers', { alterPricing: pricing => pricing.semantic_headers_sha256 = '0'.repeat(64) }],
  ['missing pricing source/input', { alterPricing: pricing => delete pricing.source_input_sha256 }],
  ['foreign pricing account', { alterPricing: pricing => pricing.account_id = 'foreign-account' }],
  ['different pricing model', { alterPricing: pricing => pricing.model_version = 'foreign-model' }],
  ['untrusted pricing', { alterPricing: pricing => pricing.trusted_readback = false }],
  ['missing protected pricing proof receipt', { alterPricing: pricing => delete pricing.receipt }],
  ['expired protected pricing proof', { alterPricing: pricing => pricing.expires_at = '2000-01-01T00:00:00Z' }],
  ['future protected pricing proof', { alterPricing: pricing => pricing.observed_at = '2099-01-01T00:00:00Z' }],
  ['missing pricing receipt', { alterPricing: pricing => delete pricing.rates.receipt }],
  ['changed current prices', { alterPricing: pricing => pricing.rates.usd_micros_per_unit++ }],
  ['expired approved prices', { alterJob: job => job.budget.rates.expires_at = '2000-01-01T00:00:00Z', alterPricing: pricing => pricing.rates.expires_at = '2000-01-01T00:00:00Z' }],
]) {
  test(`${name} blocks before reserve/dispatch`, async () => {
    const f = await fixture(options);
    await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
    assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
  });
}
for (const field of ['account_id', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type']) {
  test(`missing or changed reservation ${field} cannot open the provider leaf`, async () => {
    for (const missing of [true, false]) {
      const f = await fixture({ alterReservation: reservation => missing ? delete reservation[field] : reservation[field] = 'different-binding' });
      await assert.rejects(f.make().submit(endpoint, init, model), /atomic reservation binding/);
      assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1);
    }
  });
}
test('preflight cannot claim provider authorization', async () => { const f = await fixture({ preflight: { ok: true, provider_call_authorized: true, execution_performed: false, envelope: {} } }); await assert.rejects(f.make().submit(endpoint, init, model), /non-authorizing/); assert.equal(f.state.providerCalls, 0); });
test('untrusted reservation never opens leaf', async () => { const f = await fixture({ reservation: { ok: true, provider_call_authorized: true, execution_performed: true } }); await assert.rejects(f.make().submit(endpoint, init, model), /atomic reservation/); assert.equal(f.state.providerCalls, 0); });
test('lost reservation response does not retry or submit', async () => { const f = await fixture({ reserveLoss: true }); await assert.rejects(f.make().submit(endpoint, init, model), /lost reservation/); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1); assert.deepEqual(f.state.actions, ['preflight', 'reserve']); });
test('paid HTTP 429 submits once and retains full unknown charge hold', async () => { const f = await fixture({ providerStatus: 429 }); const client = f.make(); await assert.rejects(client.submit(endpoint, init, model), /no automatic retry/); assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1); assert.equal(client.records[0].status, 'unknown-outcome'); });
test('lost provider and outcome responses never retry or release funds', async () => { const f = await fixture({ providerLoss: true, recordLoss: true }); const client = f.make(); await assert.rejects(client.submit(endpoint, init, model), /unknown provider/); assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1); assert.equal(client.records[0].outcome_delivery, 'unknown'); });
test('same session cannot submit again after success', async () => { const f = await fixture(); const client = f.make(); await client.submit(endpoint, init, model); await assert.rejects(client.submit(endpoint, init, model), /cannot resubmit/); assert.equal(f.state.providerCalls, 1); });
test('competing clients require server contention; one synthetic reservation wins', async () => { const f = await fixture(); const results = await Promise.allSettled(Array.from({ length: 12 }, () => f.make().submit(endpoint, init, model))); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1); });
test('approved deadline applies after submission to polling and downloads', async () => { let now = 1000; const f = await fixture({ now: () => now, runtime: 1 }); const client = f.make(); await client.submit(endpoint, init, model); now += 1001; assert.throws(() => client.remainingMs(120000), /deadline elapsed/); });
test('reservation timestamps are mandatory strictly parsed and cannot extend the admitted window', async () => {
  for (const field of ['reserved_at', 'admission_expires_at']) for (const value of [undefined, '2026-02-30T12:00:00Z', new Date(Date.now() + 7_200_000).toISOString()]) {
    const f = await fixture({ alterReservation: r => { r[field] = value; } });
    await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
    assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1);
  }
});
test('delayed reserve delivery preserves the pre-reserve runtime instead of restarting it', async () => {
  let now = Date.now(); const f = await fixture({ now: () => now, runtime: 1, alterReservation: () => { now += 1001; } });
  await assert.rejects(f.make().submit(endpoint, init, model), /deadline elapsed/);
  assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1);
});
test('expired signed bounded approval and missing absolute preflight interval reject before a hold', async () => {
  for (const options of [{ alterJob: j => { j.approval.expires_at = '2000-01-01T00:00:00Z'; } }, { preflight: { ok: true, provider_call_authorized: false, execution_performed: false, envelope: {} } }]) {
    const f = await fixture(options); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
    assert.equal(f.state.holds, 0); assert.equal(f.state.providerCalls, 0);
  }
});
test('protected issuer origin is mandatory and checked before transmitting worker authentication', async () => {
  for (const origin of ['', 'https://foreign.invalid', 'https://synthetic-gateway.invalid/other']) {
    const f = await fixture({ env: { ASSET_FORGE_SPEND_GATEWAY_ORIGIN: origin } });
    await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
    assert.deepEqual(f.state.actions, []); assert.equal(f.state.providerCalls, 0);
  }
});
test('provider and awaited observation cannot return output after the absolute deadline', async () => {
  for (const boundary of ['advanceClock', 'advanceRecordClock']) {
    let now = Date.now(); const f = await fixture({ now: () => now, runtime: 1, [boundary]: () => { now += 1001; } });
    await assert.rejects(f.make().submit(endpoint, init, model), /deadline elapsed/);
    assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1);
  }
});
test('missing job mapping, gateway HTTPS, worker token and wrong source all fail closed', async () => {
  for (const env of [{ MODEL_FORGE_SPEND_JOB_IDS_JSON: '{}' }, { ASSET_FORGE_SPEND_GATEWAY_URL: 'http://synthetic-gateway.invalid/api/worker/production-spend' }, { ASSET_FORGE_SPEND_WORKER_TOKEN: 'short' }, { URAI_SOURCE_SHA: '0'.repeat(40) }]) { const f = await fixture({ env }); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); }
});
test('actual source validator rejects missing declared identity', () => assert.throws(() => verifiedSourceSha({}), /source SHA/));
for (const disposition of ['valid', 'unreconciled', 'wrong task', 'wrong spec', 'missing receipt', 'worker reported success', 'credential drift', 'forged credential checkpoint', 'missing checkpoint binding', 'pricing drift']) {
  test(`Meshy continuation ${disposition} requires protected final settlement`, async () => {
    const previewEndpoint = 'https://api.meshy.ai/openapi/v2/text-to-3d'; const previewInit = { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-preview-only' }, body: '{"mode":"preview","prompt":"synthetic"}' };
    const request = await freezeRequest(previewEndpoint, previewInit, 'meshy');
    const binding = { content_type: request.content_type, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, source_input_sha256: specHash };
    const checkpoint = { schema_version: 1, provider: 'meshy', asset: 'fixture', model: 'meshy-7.1', source_spec_sha256: specHash, job_id: 'synthetic-preview', account_id: 'synthetic-preview-account', attempt_id: 'synthetic-attempt', preview_task_id: 'synthetic-task', request_sha256: request.request_sha256, executor_source_sha: sourceSha, ...binding, provider_call_authorized: false };
    const job = { job_id: checkpoint.job_id, account_id: checkpoint.account_id, provider: 'meshy', model_version: checkpoint.model, input_sha256: [specHash, request.request_sha256], executor: { source_sha: sourceSha, asset: 'fixture', endpoint: previewEndpoint, request_sha256: request.request_sha256, request_size: request.request_size, ...binding }, budget: { max_runtime_seconds: 60, max_usd_micros: 1000000, max_credits: 10, rates: { usd_micros_per_unit: 100000, credits_per_unit: 1, receipt: 'SYNTHETIC-NOT-AUTHORIZATION', verified_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() } }, attempts: [{ attempt_id: checkpoint.attempt_id, status: 'SUCCEEDED', charges_reconciled: true, task_id: checkpoint.preview_task_id, charge_receipt_sha256: 'a'.repeat(64) }] };
    const fresh = { observed_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() };
    const account = { provider: 'meshy', account_id: job.account_id, credential_sha256: request.credential_sha256, balance_type: 'API', trusted_readback: true, credential_binding_verified: true, credential_binding_receipt: 'SYNTHETIC-NOT-AUTHORIZATION', ...fresh };
    const controls = { provider: 'meshy', account_id: job.account_id, endpoint: previewEndpoint, request_sha256: request.request_sha256, ...binding, ...fresh, ...job.budget, trusted_readback: true, enforcement_source_sha: sourceSha, hard_stop_supported: true, cost_cap_enforced: true, auto_top_up: false, proof_receipt: 'SYNTHETIC-NOT-AUTHORIZATION' };
    const pricing = { provider: job.provider, account_id: job.account_id, model_version: job.model_version, request_sha256: request.request_sha256, ...binding, ...fresh, receipt: 'SYNTHETIC-NOT-AUTHORIZATION', trusted_readback: true, rates: structuredClone(job.budget.rates) };
    if (disposition === 'unreconciled') job.attempts[0].charges_reconciled = false;
    if (disposition === 'wrong task') checkpoint.preview_task_id = 'another-task';
    if (disposition === 'wrong spec') checkpoint.source_spec_sha256 = '0'.repeat(64);
    if (disposition === 'missing receipt') delete job.attempts[0].charge_receipt_sha256;
    if (disposition === 'worker reported success') job.attempts[0].status = 'RECONCILIATION_REQUIRED';
    if (disposition === 'credential drift' || disposition === 'forged credential checkpoint') previewInit.headers.authorization = 'Bearer different-synthetic-account';
    if (disposition === 'forged credential checkpoint') checkpoint.credential_sha256 = (await freezeRequest(previewEndpoint, previewInit, 'meshy')).credential_sha256;
    if (disposition === 'missing checkpoint binding') delete checkpoint.semantic_headers_sha256;
    if (disposition === 'pricing drift') pricing.credential_sha256 = '0'.repeat(64);
    let reads = 0;
    const client = new ModelSpendClient({ provider: 'meshy', asset: 'fixture', sourceSpecSha256: specHash, previewCheckpoint: checkpoint, env: { URAI_SOURCE_SHA: sourceSha, ASSET_FORGE_SPEND_GATEWAY_URL: gatewayUrl, ASSET_FORGE_SPEND_GATEWAY_ORIGIN: new URL(gatewayUrl).origin, ASSET_FORGE_SPEND_WORKER_TOKEN: 'synthetic-worker-token-more-than-32-characters' }, fetchImpl: async (url, input) => { reads++; assert.equal(url, gatewayUrl); const payload = JSON.parse(input.body); assert.equal(payload.action, 'snapshot'); assert.equal(payload.account_id, account.account_id); if (disposition !== 'forged credential checkpoint') assert.equal(payload.credential_sha256, binding.credential_sha256); return response({ ok: true, provider_call_authorized: false, execution_performed: false, job, account, protected_controls: controls, protected_pricing: pricing }); } });
    if (disposition === 'valid') assert.equal(await client.verifiedPreview(previewEndpoint, previewInit, 'meshy-7.1'), 'synthetic-task');
    else await assert.rejects(client.verifiedPreview(previewEndpoint, previewInit, 'meshy-7.1'), /MODEL_SPEND_BLOCKED/);
    assert.equal(reads, ['wrong spec', 'credential drift', 'missing checkpoint binding'].includes(disposition) ? 0 : 1);
  });
}
test('dirty, untracked and missing executor files reject in real isolated Git repositories', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-model-build-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'model_forge')); for (const file of ['forge.mjs', 'model-spend-client.mjs', 'triangle-budget.mjs', 'glb-container.mjs']) fs.copyFileSync(path.join(root, 'model_forge', file), path.join(dir, 'model_forge', file));
  const git = args => { const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git(['init', '-q']); git(['add', 'model_forge']); git(['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'synthetic source fixture']);
  const sha = git(['rev-parse', 'HEAD']); const check = () => spawnSync(process.execPath, ['--input-type=module', '-e', "import { verifiedSourceSha } from './model_forge/model-spend-client.mjs'; console.log(verifiedSourceSha());"], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, URAI_SOURCE_SHA: sha } });
  assert.equal(check().status, 0); fs.appendFileSync(path.join(dir, 'model_forge/forge.mjs'), '\n// dirty fixture'); assert.equal(check().status, 1); git(['checkout', '--', 'model_forge/forge.mjs']);
  for (const file of ['triangle-budget.mjs', 'glb-container.mjs']) {
    const relative = `model_forge/${file}`;
    fs.appendFileSync(path.join(dir, relative), '\n// changed imported geometry fixture'); assert.equal(check().status, 1); git(['checkout', '--', relative]);
    git(['rm', '--cached', '-q', relative]); assert.equal(check().status, 1); git(['reset', '-q', '--', relative]);
    fs.rmSync(path.join(dir, relative)); assert.equal(check().status, 1); git(['checkout', '--', relative]);
    assert.equal(check().status, 0);
  }
  git(['rm', '--cached', '-q', 'model_forge/forge.mjs']); assert.equal(check().status, 1); git(['reset', '-q', '--', 'model_forge/forge.mjs']); fs.rmSync(path.join(dir, 'model_forge/forge.mjs')); assert.equal(check().status, 1);
});
test('backward wall-clock during outcome delivery cannot extend the initial monotonic runtime', async () => {
  const originalPerformance = globalThis.performance; let monotonic = 100, wall = Date.now();
  globalThis.performance = { now: () => monotonic };
  try {
    const f = await fixture({ now: () => wall, runtime: 1, advanceRecordClock: () => { monotonic += 1_001; wall -= 1_000; } });
    await assert.rejects(f.make().submit(endpoint, init, model), /deadline elapsed/);
    assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1);
  } finally { globalThis.performance = originalPerformance; }
});

// Retained root successor scenarios on the current owner implementation.
test('delayed reserve cannot restart the approved runtime', async () => { let now = 1000; const f = await fixture({ now: () => now, runtime: 1, onReserve: () => { now += 1001; } }); const client = f.make(); await assert.rejects(client.submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1); assert.equal(client.records.length, 1); await assert.rejects(client.submit(endpoint, init, model), /cannot resubmit/); });
test('each independent protected authorization window can expire during reserve delivery without dispatch', async () => {
  for (const field of ['approval', 'authority', 'account', 'controls', 'pricing', 'rates']) {
    let now = 1000; const expires = new Date(now + 1000).toISOString();
    const option = field === 'rates' ? { alterJob: job => { job.budget.rates.expires_at = expires; }, alterPricing: price => { price.rates.expires_at = expires; } } : { [({ approval: 'alterApproval', authority: 'alterAuthority', account: 'alterAccount', controls: 'alterControls', pricing: 'alterPricing' })[field]]: proof => { proof.expires_at = expires; } };
    const f = await fixture({ ...option, now: () => now, onReserve: () => { now += 1001; } });
    await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/, field); assert.equal(f.state.providerCalls, 0, field); assert.equal(f.state.holds, 1, field);
  }
});
test('mandatory reservation times reject missing future expired or enlarged echoes with hold retained', async () => {
  for (const change of [a => { delete a.reserved_at; }, a => { delete a.admission_expires_at; }, a => { a.reserved_at = 'invalid'; }, a => { a.admission_expires_at = 'invalid'; }, a => { a.reserved_at = new Date(5000).toISOString(); }, a => { a.admission_expires_at = new Date(1000).toISOString(); }, a => { a.admission_expires_at = new Date(1000 + 61000).toISOString(); }]) {
    const f = await fixture({ now: () => 1000, alterReservation: change }); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1);
  }
});
test('actual source changes after reserve block adjacent paid dispatch and retain the attempt', async () => { let f; f = await fixture({ onReserve: () => { f.env.URAI_SOURCE_SHA = '0'.repeat(40); } }); const client = f.make(); await assert.rejects(client.submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 1); assert.equal(client.records.length, 1); });
test('expiry during provider response suppresses late output without retry or settlement', async () => { let now = 1000; const f = await fixture({ now: () => now, runtime: 1, advanceClock: () => { now += 1001; } }); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1); });
test('expiry during outcome delivery cannot release a successful late return', async () => { let now = 1000; const f = await fixture({ now: () => now, runtime: 1, afterRecord: () => { now += 1001; } }); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1); });
test('missing real approval or untrusted source authority blocks preflight before reservation', async () => { for (const option of [{ alterApproval: value => { delete value.expires_at; } }, { alterApproval: value => { value.status = 'DRAFT'; } }, { alterAuthority: value => { value.trusted_readback = false; } }, { alterAuthority: value => { value.binding = { ...value.binding, sha: '0'.repeat(40) }; } }]) { const f = await fixture(option); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0); } });

test('v1 preserves genuine specification authority distinct from actual executor build', async () => { const f = await fixture({ authorityBinding: { repository: 'synthetic/accepted-specification', sha: 'f'.repeat(40) } }); const result = await f.make().submit(endpoint, init, model); assert.equal(result.payload.id, 'synthetic-provider-task'); assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1); });

test('synchronous final source proof cannot exhaust the clock and then deliver output', async () => {
  let now = 1000, afterRecord = false, finalSourceRead = false;
  const f = await fixture({ now: () => now, runtime: 1, afterRecord: () => { afterRecord = true; } });
  Object.defineProperty(f.env, 'URAI_SOURCE_SHA', { configurable: true, get() {
    if (afterRecord && !finalSourceRead) { finalSourceRead = true; now += 1001; }
    return sourceSha;
  } });
  await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/);
  assert.equal(afterRecord, true); assert.equal(finalSourceRead, true);
  assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1);
  assert.equal(f.state.actions.at(-1), 'record');
});

test('clock rollback cannot reopen a reservation whose monotonic budget expired', async () => {
  let wall = Date.now(), monotonic = 1000;
  const f = await fixture({ runtime: 1, now: () => wall, monotonic: () => monotonic,
    onReserve: () => { wall += 500; },
    advanceClock: () => { wall -= 500; monotonic += 1001; } });
  await assert.rejects(f.make().submit(endpoint, init, model), /deadline/);
  // The reserve timestamps were valid and dispatch occurred once. Elapsed
  // monotonic time then denies the returned output despite wall-clock rollback.
  assert.equal(f.state.providerCalls, 1); assert.equal(f.state.holds, 1);
});

test('malformed effective provider headers block before admission without disclosing credential values', async () => {
  const secret = 'SYNTHETIC-provider-secret-do-not-print';
  for (const bad of [
    { authorization: `Bearer ${secret}\r\ninjected: value` },
    { authorization: `Bearer ${secret}\0` },
    { authorization: `Bearer ${secret}\u0100` },
    { [`invalid header ${secret}`]: 'value' }
  ]) {
    const f = await fixture();
    await assert.rejects(f.make().submit(endpoint, { ...init, headers: { ...init.headers, ...bad } }, model), error => {
      assert.match(error.message, /^MODEL_SPEND_BLOCKED: invalid effective provider headers$/);
      for (const visible of [String(error), error.stack, JSON.stringify(error)]) assert.equal(visible.includes(secret), false);
      assert.equal(Object.hasOwn(error, 'cause'), false); return true;
    });
    assert.deepEqual(f.state.actions, []); assert.deepEqual(f.state.gatewayInputs, []);
    assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
  }
});

test('failed header conversion drops secret-bearing exception details and causes', async () => {
  const secret = 'SYNTHETIC-header-conversion-secret';
  const f = await fixture(), headers = { 'content-type': 'application/json',
    get authorization() { throw new Error(secret, { cause: { secret } }); } };
  await assert.rejects(f.make().submit(endpoint, { ...init, headers }, model), error => {
    assert.equal(error.message, 'MODEL_SPEND_BLOCKED: invalid effective provider headers');
    assert.equal(String(error.stack).includes(secret), false);
    assert.equal(Object.hasOwn(error, 'cause'), false); return true;
  });
  assert.deepEqual(f.state.actions, []); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
});

test('malformed or unbounded worker tokens are rejected before authentication transport without disclosure', async () => {
  const secret = 'SYNTHETIC-worker-secret-do-not-print';
  for (const token of [secret.slice(0, 31), secret + '\r\ninjected: value', secret + '\0', secret + '\u0100', secret + '\tvalue', secret + ' value', secret.repeat(130)]) {
    const f = await fixture({ env: { ASSET_FORGE_SPEND_WORKER_TOKEN: token } });
    await assert.rejects(f.make().submit(endpoint, init, model), error => {
      assert.equal(error.message, 'MODEL_SPEND_BLOCKED: protected worker authentication required');
      for (const visible of [String(error), error.stack, JSON.stringify(error)]) {
        assert.equal(visible.includes(secret), false); assert.equal(visible.includes(token), false);
      }
      assert.equal(Object.hasOwn(error, 'cause'), false); return true;
    });
    assert.deepEqual(f.state.actions, []); assert.deepEqual(f.state.gatewayInputs, []);
    assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
  }
});
