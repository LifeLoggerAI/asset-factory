import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { freezeRequest, ModelSpendClient } from '../model_forge/model-spend-client.mjs';
import { getJson, providerChecks, providerPreflight } from '../model_forge/provider-preflight.mjs';

// Synthetic responses exercise the actual producer. They are never provider,
// credential, account, price, budget, approval, or runtime acceptance evidence.
const source = fs.readFileSync(new URL('../model_forge/forge.mjs', import.meta.url), 'utf8');
function section(first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert.ok(start >= 0 && end > start, `missing actual producer section: ${first}`);
  return source.slice(start, end);
}
const actual = [
  section('function isPrivateIpv4(', '\nasync function assertPublicResolvedUrl'),
  section('function retryAfterMs(', '\nfunction firstHttpUrl'),
  section('async function generateTripo(', '\nasync function generateRodin'),
].join('\n');
const taskId = 'task_fixture-123';
const modelUrl = 'https://synthetic-artifact.invalid/model.glb';
const goodTask = (type = 'text_to_model', extra = {}) => ({ code: 0, data: { task_id: taskId, type, status: 'success', progress: 100, output: { model_url: modelUrl }, credits_consumed: 40.25, ...extra } });
function fixture({ model, polls = [goodTask()], created = { code: 0, data: { task_id: taskId } }, response, submitError, admissionErrorAt } = {}) {
  const paid = [], reads = [];
  let admissions = 0;
  const context = vm.createContext({ URL, Response, TextDecoder, Uint8Array, AbortSignal, Date,
    process: { env: { TRIPO_API_KEY: 'SYNTHETIC-NOT-A-CREDENTIAL', ...(model ? { URAI_TRIPO_MODEL: model } : {}) } },
    TRIPO_STABLE_MODEL: 'v3.1-20260211', fail: message => { throw Error(message); }, timeoutMs: () => 1000, sleep: async () => {},
    fetch: async (url, init) => { reads.push({ url, init }); if (response) return response(); const value = polls.shift(); assert.ok(value, 'unexpected metadata retry'); return new Response(JSON.stringify(value)); },
  });
  vm.runInContext(actual, context);
  const spend = { remainingMs: value => value, checkAdmission: () => { if (++admissions === admissionErrorAt) throw Error('SYNTHETIC admission revoked'); },
    submit: async (url, init, selectedModel) => { paid.push({ url, init, model: selectedModel }); if (submitError) throw submitError; return { payload: created }; },
  };
  const spec = { prompt: 'A synthetic model', target: { maxTriangles: 1000, pbr: true, textureResolution: '8k' }, generation: { seed: 17 } };
  return { paid, reads, spec, spend, run: overrides => context.generateTripo({ ...spec, ...overrides }, spend) };
}
for (const entry of [
  { operation: 'text-to-model', overrides: {}, expected: { prompt: 'A synthetic model' } },
  { operation: 'image-to-model', overrides: { referenceImages: ['https://synthetic-reference.invalid/front.png'] }, expected: { input: 'https://synthetic-reference.invalid/front.png' } },
  { operation: 'multiview-to-model', overrides: { referenceViews: { back: 'https://synthetic-reference.invalid/back.webp', front: 'https://synthetic-reference.invalid/front.png' } }, expected: { inputs: [{ front: 'https://synthetic-reference.invalid/front.png' }, { back: 'https://synthetic-reference.invalid/back.webp' }] } },
]) test(`actual Tripo V3 ${entry.operation} retains bounded model controls and protected submission`, async () => {
  const f = fixture({ polls: [goodTask(entry.operation.replaceAll('-', '_'))] });
  const result = await f.run(entry.overrides);
  assert.equal(f.paid.length, 1); assert.equal(f.reads.length, 1);
  const request = f.paid[0];
  assert.equal(request.url, `https://openapi.tripo3d.ai/v3/generation/${entry.operation}`);
  assert.equal(request.model, 'v3.1-20260211'); assert.equal(request.init.method, 'POST');
  assert.deepEqual(JSON.parse(request.init.body), { ...entry.expected, model: 'v3.1-20260211', texture: true, pbr: true, texture_quality: 'extreme', geometry_quality: 'detailed', face_limit: 1000, auto_size: true, model_seed: 17, texture_seed: 17 });
  assert.equal(f.reads[0].url, `https://openapi.tripo3d.ai/v3/tasks/${taskId}`);
  assert.equal(f.reads[0].init.headers.Authorization, 'Bearer SYNTHETIC-NOT-A-CREDENTIAL'); assert.equal(f.reads[0].init.redirect, 'error');
  assert.equal(result.url, modelUrl); assert.equal(result.creditsConsumed, 40.25); assert.equal(result.taskId, taskId);
  assert.equal('provider_call_authorized' in result, false); assert.equal('reconciliation_complete' in result, false);
});
test('retained compatible H model is honored without silently selecting another model or price', async () => {
  const f = fixture({ model: 'v3.0-20250812' }); await f.run({ generation: { seed: null } });
  const body = JSON.parse(f.paid[0].init.body); assert.equal(body.model, 'v3.0-20250812'); assert.equal('model_seed' in body, false);
});
for (const model of ['v2.5-20250123', 'unknown-v3']) test(`unadmitted Tripo model cannot dispatch a paid leaf: ${JSON.stringify(model)}`, async () => {
  const f = fixture({ model }); await assert.rejects(f.run(), /not admitted/); assert.equal(f.paid.length, 0); assert.equal(f.reads.length, 0);
});
for (const overrides of [
  { referenceViews: { front: 'https://synthetic-reference.invalid/front.png' } },
  { referenceViews: { back: 'https://synthetic-reference.invalid/back.png', left: 'https://synthetic-reference.invalid/left.png' } },
  { referenceViews: { front: 'https://synthetic-reference.invalid/front.png', top: 'https://synthetic-reference.invalid/top.png' } },
  { referenceImages: ['https://synthetic-reference.invalid/a.png', 'https://synthetic-reference.invalid/b.png'] },
  ...['http://synthetic-reference.invalid/a.png', 'https://127.0.0.1/a.png', 'https://localhost/a.png', 'https://u:p@synthetic-reference.invalid/a.png', 'https://synthetic-reference.invalid/a.png#secret', '/private/source.png'].map(ref => ({ referenceImages: [ref] })),
]) test(`invalid/unmaterialized Tripo reference fails before paid dispatch: ${JSON.stringify(overrides)}`, async () => {
  const f = fixture(); await assert.rejects(f.run(overrides), /Tripo|private\/local/); assert.equal(f.paid.length, 0); assert.equal(f.reads.length, 0);
});
for (const id of ['../foreign', 'id?token=foreign', '', {}, 'x'.repeat(129)]) test(`unsafe created Tripo task cannot receive authenticated polling: ${JSON.stringify(id)}`, async () => {
  const f = fixture({ created: { code: 0, data: { task_id: id } } }); await assert.rejects(f.run(), /valid task identity/); assert.equal(f.paid.length, 1); assert.equal(f.reads.length, 0);
});
for (const created of [{ data: { task_id: taskId } }, { code: 1, data: { task_id: taskId } }, [], null]) test(`Tripo create response needs official success envelope: ${JSON.stringify(created)}`, async () => {
  const f = fixture({ created }); await assert.rejects(f.run(), /provider operation failed/); assert.equal(f.reads.length, 0);
});
for (const change of [
  { task_id: 'other-task' }, { type: 'image_to_model' }, { status: 'unknown' }, { progress: -1 }, { progress: 101 }, { progress: 99.5 },
  ...[-1, '40.25', 0.001, Number.MAX_SAFE_INTEGER].map(credits_consumed => ({ credits_consumed })),
  { output: { pbr_model: modelUrl } }, { output: { model_url: 'http://synthetic-artifact.invalid/model.glb' } },
  { output: { model_url: 'https://localhost/model.glb' } }, { output: { model_url: 'https://u:p@synthetic-artifact.invalid/model.glb' } },
  { output: { model_url: `${modelUrl}#capability` } },
]) test(`Tripo V3 task mismatch or invalid publication remains failure: ${JSON.stringify(change)}`, async () => {
  const f = fixture({ polls: [goodTask('text_to_model', change)] }); await assert.rejects(f.run(), /Tripo|private\/local/); assert.equal(f.paid.length, 1); assert.equal(f.reads.length, 1);
});
for (const status of ['failed', 'cancelled', 'banned', 'expired']) test(`Tripo terminal ${status} does not publish or regenerate`, async () => {
  const f = fixture({ polls: [goodTask('text_to_model', { status })] }); await assert.rejects(f.run(), /Provider task failed/); assert.equal(f.paid.length, 1); assert.equal(f.reads.length, 1);
});
test('missing provider-reported credits stays unknown, never zero or reconciled', async () => {
  const payload = goodTask(); delete payload.data.credits_consumed;
  assert.equal((await fixture({ polls: [payload] }).run()).creditsConsumed, null);
});
test('queued/running Tripo task retains matching authenticated polling until coherent success', async () => {
  const f = fixture({ polls: [goodTask('text_to_model', { status: 'queued', progress: 0 }), goodTask('text_to_model', { status: 'running', progress: 25 }), goodTask()] });
  await f.run(); assert.equal(f.paid.length, 1); assert.equal(f.reads.length, 3);
});
test('paid Tripo submit is never retried following uncertain provider failure', async () => {
  const f = fixture({ submitError: Error('SYNTHETIC uncertain paid result') }); await assert.rejects(f.run(), /uncertain/); assert.equal(f.paid.length, 1); assert.equal(f.reads.length, 0);
});
test('auth/spend admission change during actual Tripo metadata wait refuses publication', async () => {
  const f = fixture({ admissionErrorAt: 3 }); await assert.rejects(f.run(), /admission revoked/); assert.equal(f.paid.length, 1);
});
for (const entry of [
  { name: 'oversized', response: () => new Response('x'.repeat(65537)), error: /byte bound/ },
  { name: 'invalid UTF-8', response: () => new Response(new Uint8Array([0xc3, 0x28])), error: /UTF-8/ },
  { name: 'foreign redirect', response: () => { throw Error('synthetic foreign redirect'); }, error: /redirect rejected/ },
]) test(`actual Tripo poll rejects ${entry.name} without repeating the paid call`, async () => {
  const f = fixture(entry); await assert.rejects(f.run(), entry.error); assert.equal(f.paid.length, 1); assert.equal(f.reads.length, 1);
});
test('V3 protected origin is canonical and old V2 origin cannot reuse protected admission', async () => {
  const init = { method: 'POST', headers: { Authorization: 'Bearer SYNTHETIC-NOT-A-CREDENTIAL', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'v3.1-20260211', prompt: 'synthetic' }) };
  await assert.rejects(freezeRequest('https://api.tripo3d.ai/v2/openapi/task', init, 'tripo'), /origin|endpoint/);
  const text = await freezeRequest('https://openapi.tripo3d.ai/v3/generation/text-to-model', init, 'tripo');
  const image = await freezeRequest('https://openapi.tripo3d.ai/v3/generation/image-to-model', { ...init, body: JSON.stringify({ model: 'v3.1-20260211', input: 'https://synthetic-reference.invalid/front.png' }) }, 'tripo');
  assert.notEqual(text.request_sha256, image.request_sha256); assert.notEqual(text.semantic_input_sha256, image.semantic_input_sha256);
  let gatewayCalls = 0;
  const sourceSha = spawnSync('git', ['-C', fileURLToPath(new URL('../', import.meta.url)), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const client = new ModelSpendClient({ provider: 'tripo', asset: 'fixture', sourceSpecSha256: 'a'.repeat(64), env: { URAI_SOURCE_SHA: sourceSha, MODEL_FORGE_SPEND_JOB_IDS_JSON: JSON.stringify({ ['b'.repeat(64)]: 'OLD-SYNTHETIC-JOB' }) }, fetchImpl: async () => { gatewayCalls++; throw Error('must not query'); } });
  await assert.rejects(client.submit('https://openapi.tripo3d.ai/v3/generation/text-to-model', init, 'v3.1-20260211'), /protected exact request job missing/); assert.equal(gatewayCalls, 0);
});
const tripoCheck = providerChecks.find(row => row.provider === 'tripo');
test('V3 account metadata requires balance and frozen credits without promoting metadata to authority', async () => {
  assert.equal(tripoCheck.url, 'https://openapi.tripo3d.ai/v3/account/balance');
  assert.deepEqual(tripoCheck.read({ code: 0, data: { balance: 100.25, frozen: 3.5 } }), { balance: 100.25, frozen: 3.5 });
  const receipt = await providerPreflight({ live: true, env: { TRIPO_API_KEY: 'SYNTHETIC-NOT-A-CREDENTIAL' }, readJson: async url => { assert.equal(url, tripoCheck.url); return { code: 0, data: { balance: 100.25, frozen: 3.5 } }; } });
  assert.equal(receipt.providers.find(row => row.provider === 'tripo').balanceChecked, true);
  assert.equal(receipt.provider_call_authorized, false); assert.equal(receipt.execution_performed, false); assert.equal(receipt.protected_account_binding_verified, false);
});
for (const payload of [{ balance: 1 }, { code: 0, data: { balance: 1 } }, { code: 0, data: { balance: -1, frozen: 0 } }, { code: 0, data: { balance: '1', frozen: 0 } }, { code: 0, data: { balance: 1, frozen: 0.001 } }, { code: 0, data: { balance: Infinity, frozen: 0 } }]) test(`invalid V3 account read cannot be marked reachable: ${JSON.stringify(payload)}`, async () => {
  const receipt = await providerPreflight({ live: true, env: { TRIPO_API_KEY: 'SYNTHETIC-NOT-A-CREDENTIAL' }, readJson: async () => payload });
  const row = receipt.providers.find(item => item.provider === 'tripo'); assert.equal(row.status, 'preflight-failed'); assert.equal(row.balanceChecked, false);
});
test('offline metadata preparation never reads provider or grants execution', async () => {
  let reads = 0; const receipt = await providerPreflight({ env: { TRIPO_API_KEY: 'SYNTHETIC-NOT-A-CREDENTIAL' }, readJson: async () => { reads++; } });
  assert.equal(reads, 0); assert.equal(receipt.provider_call_authorized, false); assert.equal(receipt.providers.find(row => row.provider === 'tripo').status, 'configured-not-queried');
});
test('preflight failures do not echo provider/credential capabilities into receipts', async () => {
  const receipt = await providerPreflight({ live: true, env: { TRIPO_API_KEY: 'SYNTHETIC-SECRET' }, readJson: async () => { throw Error('Authorization Bearer SYNTHETIC-SECRET capability'); } });
  assert.equal(JSON.stringify(receipt).includes('SYNTHETIC-SECRET'), false); assert.equal(receipt.providers.find(row => row.provider === 'tripo').error, 'Provider metadata read failed');
});
test('actual account GET is canonical, redirect-refusing, bounded, and non-caching', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; }); const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ code: 0, data: { balance: 1, frozen: 0 } })); };
  assert.equal((await getJson(tripoCheck.url, 'SYNTHETIC-NOT-A-CREDENTIAL')).code, 0);
  assert.equal(calls.length, 1); assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.redirect, 'error'); assert.equal(calls[0].init.cache, 'no-store'); assert.equal(calls[0].init.referrerPolicy, 'no-referrer');
  await assert.rejects(getJson('https://api.tripo3d.ai/v2/openapi/user/balance', 'SYNTHETIC-NOT-A-CREDENTIAL'), /endpoint/); assert.equal(calls.length, 1);
});
for (const entry of [
  { name: 'declared oversize', response: () => new Response('{}', { headers: { 'content-length': '65537' } }), error: /byte bound/ },
  { name: 'stream oversize', response: () => new Response('x'.repeat(65537)), error: /byte bound/ },
  { name: 'malformed UTF-8', response: () => new Response(new Uint8Array([0xc3, 0x28])), error: /UTF-8/ },
  { name: 'HTTP credential echo', response: () => new Response('{"secret":"SYNTHETIC-SECRET"}', { status: 401 }), error: /HTTP request failed/ },
  { name: 'non-object JSON', response: () => new Response('[]'), error: /JSON object/ },
]) test(`actual read-only account boundary rejects ${entry.name}`, async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; }); globalThis.fetch = async () => entry.response();
  await assert.rejects(getJson(tripoCheck.url, 'SYNTHETIC-NOT-A-CREDENTIAL'), entry.error);
});
