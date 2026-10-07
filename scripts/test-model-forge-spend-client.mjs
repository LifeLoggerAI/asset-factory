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
function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

async function fixture(options = {}) {
  const prepared = await freezeRequest(endpoint, init, 'replicate');
  const job = { job_id: 'synthetic-job', provider: 'replicate', model_version: model, input_sha256: [specHash, prepared.request_sha256], executor: { source_sha: sourceSha, endpoint, request_sha256: prepared.request_sha256, request_size: prepared.request_size, asset: 'fixture', content_type: prepared.content_type }, budget: { max_runtime_seconds: 60 }, attempts: [], approval: { synthetic: true } };
  options.alterJob?.(job);
  const state = { providerCalls: 0, actions: [], holds: 0, reserved: false, bodies: [] };
  const env = { URAI_SOURCE_SHA: sourceSha, ASSET_FORGE_SPEND_GATEWAY_URL: gatewayUrl, ASSET_FORGE_SPEND_WORKER_TOKEN: 'synthetic-worker-token-with-more-than-32-characters', MODEL_FORGE_SPEND_JOB_IDS_JSON: JSON.stringify({ [prepared.request_sha256]: job.job_id }), ...options.env };
  const fetchImpl = async (url, request) => {
    assert.equal(request.redirect, 'error');
    if (url === gatewayUrl) {
      const input = JSON.parse(request.body); state.actions.push(input.action);
      if (input.action === 'preflight') return response(options.preflight || { ok: true, provider_call_authorized: false, execution_performed: false, envelope: { job: structuredClone(job), account: {}, authority: {} } });
      if (input.action === 'reserve') {
        assert.equal(input.request_sha256, prepared.request_sha256); assert.equal(input.request_size, prepared.request_size); assert.equal(input.executor_source_sha, sourceSha);
        assert.equal(input.job_digest, jobDigest(job));
        if (state.reserved) return response({ ok: false }, 409);
        state.reserved = true; state.holds++;
        if (options.reserveLoss) throw Error('synthetic lost reservation response');
        return response(options.reservation || { ok: true, provider_call_authorized: true, execution_performed: false, attempt_id: 'synthetic-attempt', job_digest: input.job_digest, executor_source_sha: sourceSha, max_runtime_seconds: options.runtime || 60 });
      }
      if (input.action === 'record') { if (options.recordLoss) throw Error('synthetic lost outcome'); return response({ ok: true, provider_call_authorized: false, reconciliation_required: true }); }
      assert.fail('Unexpected action');
    }
    assert.equal(url, endpoint); state.providerCalls++; state.bodies.push(Buffer.from(request.body));
    if (options.providerLoss) throw Error('synthetic unknown provider outcome');
    options.advanceClock?.();
    return response({ id: 'synthetic-provider-task' }, options.providerStatus || 200);
  };
  const make = () => new ModelSpendClient({ provider: 'replicate', asset: 'fixture', sourceSpecSha256: specHash, env, fetchImpl, now: options.now || Date.now });
  return { state, make, prepared, env, job };
}

test('canonical digest agrees with pinned gateway unicode and integer serialization', () => {
  assert.equal(canonical({ name: '雪😀', n: 1, ok: true }), '{"n":1,"name":"\\u96ea\\ud83d\\ude00","ok":true}');
  assert.throws(() => canonical({ n: 0.1 }), /integers/); assert.throws(() => canonical({ 'bad-key': true }), /ambiguous/);
});
test('prepared exact POST bytes are bound including endpoint, size and content type', async () => {
  const prepared = await freezeRequest(endpoint, init, 'replicate');
  assert.equal(prepared.request_sha256, hash(Buffer.concat([Buffer.from(`POST\n${endpoint}\n`), Buffer.from(init.body)])));
  assert.equal(prepared.request_size, Buffer.byteLength(init.body)); assert.equal(prepared.content_type, 'application/json');
});
test('multipart snapshots are repeatable and retain binary bytes', async () => {
  const form = () => { const f = new FormData(); f.append('prompt', 'synthetic'); f.append('images', new Blob([new Uint8Array([0, 1, 255, 13, 10])], { type: 'image/png' }), 'fixture.png'); return f; };
  const a = await freezeRequest('https://api.hyper3d.com/api/v2/rodin', { method: 'POST', body: form() }, 'rodin');
  const b = await freezeRequest('https://api.hyper3d.com/api/v2/rodin', { method: 'POST', body: form() }, 'rodin');
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
]) {
  test(`changed protected ${name} blocks before reservation and provider`, async () => {
    const f = await fixture({ alterJob }); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); assert.equal(f.state.holds, 0);
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
test('missing job mapping, gateway HTTPS, worker token and wrong source all fail closed', async () => {
  for (const env of [{ MODEL_FORGE_SPEND_JOB_IDS_JSON: '{}' }, { ASSET_FORGE_SPEND_GATEWAY_URL: 'http://synthetic-gateway.invalid/api/worker/production-spend' }, { ASSET_FORGE_SPEND_WORKER_TOKEN: 'short' }, { URAI_SOURCE_SHA: '0'.repeat(40) }]) { const f = await fixture({ env }); await assert.rejects(f.make().submit(endpoint, init, model), /MODEL_SPEND_BLOCKED/); assert.equal(f.state.providerCalls, 0); }
});
test('actual source validator rejects missing declared identity', () => assert.throws(() => verifiedSourceSha({}), /source SHA/));
for (const disposition of ['valid', 'unreconciled', 'wrong task', 'wrong spec', 'missing receipt', 'worker reported success']) {
  test(`Meshy continuation ${disposition} requires protected final settlement`, async () => {
    const previewEndpoint = 'https://api.meshy.ai/openapi/v2/text-to-3d'; const previewInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"mode":"preview","prompt":"synthetic"}' };
    const request = await freezeRequest(previewEndpoint, previewInit, 'meshy');
    const checkpoint = { schema_version: 1, provider: 'meshy', asset: 'fixture', model: 'meshy-7.1', source_spec_sha256: specHash, job_id: 'synthetic-preview', attempt_id: 'synthetic-attempt', preview_task_id: 'synthetic-task', request_sha256: request.request_sha256, provider_call_authorized: false };
    const job = { job_id: checkpoint.job_id, provider: 'meshy', model_version: checkpoint.model, input_sha256: [specHash, request.request_sha256], executor: { asset: 'fixture', endpoint: previewEndpoint, request_sha256: request.request_sha256, request_size: request.request_size, content_type: request.content_type }, attempts: [{ attempt_id: checkpoint.attempt_id, status: 'SUCCEEDED', charges_reconciled: true, task_id: checkpoint.preview_task_id, charge_receipt_sha256: 'a'.repeat(64) }] };
    if (disposition === 'unreconciled') job.attempts[0].charges_reconciled = false;
    if (disposition === 'wrong task') checkpoint.preview_task_id = 'another-task';
    if (disposition === 'wrong spec') checkpoint.source_spec_sha256 = '0'.repeat(64);
    if (disposition === 'missing receipt') delete job.attempts[0].charge_receipt_sha256;
    if (disposition === 'worker reported success') job.attempts[0].status = 'RECONCILIATION_REQUIRED';
    let reads = 0;
    const client = new ModelSpendClient({ provider: 'meshy', asset: 'fixture', sourceSpecSha256: specHash, previewCheckpoint: checkpoint, env: { URAI_SOURCE_SHA: sourceSha, ASSET_FORGE_SPEND_GATEWAY_URL: gatewayUrl, ASSET_FORGE_SPEND_WORKER_TOKEN: 'synthetic-worker-token-more-than-32-characters' }, fetchImpl: async (url, input) => { reads++; assert.equal(url, gatewayUrl); assert.equal(JSON.parse(input.body).action, 'snapshot'); return response({ ok: true, provider_call_authorized: false, execution_performed: false, job }); } });
    if (disposition === 'valid') assert.equal(await client.verifiedPreview(previewEndpoint, previewInit, 'meshy-7.1'), 'synthetic-task');
    else await assert.rejects(client.verifiedPreview(previewEndpoint, previewInit, 'meshy-7.1'), /MODEL_SPEND_BLOCKED/);
    assert.equal(reads, disposition === 'wrong spec' ? 0 : 1);
  });
}
test('dirty, untracked and missing executor files reject in real isolated Git repositories', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-model-build-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'model_forge')); for (const file of ['forge.mjs', 'model-spend-client.mjs']) fs.copyFileSync(path.join(root, 'model_forge', file), path.join(dir, 'model_forge', file));
  const git = args => { const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  git(['init', '-q']); git(['add', 'model_forge']); git(['-c', 'user.name=Synthetic Test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'synthetic source fixture']);
  const sha = git(['rev-parse', 'HEAD']); const check = () => spawnSync(process.execPath, ['--input-type=module', '-e', "import { verifiedSourceSha } from './model_forge/model-spend-client.mjs'; console.log(verifiedSourceSha());"], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, URAI_SOURCE_SHA: sha } });
  assert.equal(check().status, 0); fs.appendFileSync(path.join(dir, 'model_forge/forge.mjs'), '\n// dirty fixture'); assert.equal(check().status, 1); git(['checkout', '--', 'model_forge/forge.mjs']);
  git(['rm', '--cached', '-q', 'model_forge/forge.mjs']); assert.equal(check().status, 1); git(['reset', '-q', '--', 'model_forge/forge.mjs']); fs.rmSync(path.join(dir, 'model_forge/forge.mjs')); assert.equal(check().status, 1);
});
