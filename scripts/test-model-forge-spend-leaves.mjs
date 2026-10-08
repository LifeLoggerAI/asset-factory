import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = fs.readFileSync(path.join(root, 'model_forge/forge.mjs'), 'utf8');
function section(first, last) { return source.slice(source.indexOf(first), source.indexOf(last, source.indexOf(first))); }
const requestSource = section('async function requestJson(', '\nfunction assertTripoOk');
const generators = section('async function generateMeshy(', '\nfunction dryRunReceipt');
const responseGlobals = { Response, TextDecoder, Uint8Array };
const failure = message => { throw new Error(message); };

function replicateFixture({ getUrl = 'https://api.replicate.com/v1/predictions/synthetic-task', taskId = 'synthetic-task', polls, redirect = false, initialStatus = 'processing' } = {}) {
  const calls = [];
  const pollResults = [...(polls ?? [{ id: taskId, status: 'succeeded', output: 'https://synthetic-artifact.invalid/model.glb' }])];
  const context = vm.createContext({ ...responseGlobals,
    process: { env: { REPLICATE_API_TOKEN: 'synthetic-poll-secret' } }, URL, AbortSignal,
    fail: failure, timeoutMs: () => 1000, sleep: async () => {}, retryAfterMs: () => 0,
    assertPublicHttpUrl: value => value,
    firstHttpUrl: value => typeof value === 'string' ? value : null,
    fetch: async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.redirect, 'error', 'credential-bearing polling may never follow redirects');
      if (redirect) throw new TypeError('synthetic redirect rejected by fetch redirect:error');
      const payload = pollResults.shift();
      assert.ok(payload, 'unexpected additional polling request');
      return new Response(JSON.stringify(payload));
    },
  });
  vm.runInContext(requestSource + '\n' + section('async function pollJson(', '\nfunction firstHttpUrl') + '\n' + section('function replicateOfficialModel()', '\nasync function generate(provider'), context);
  const spec = { prompt: 'synthetic', target: { maxTriangles: 100, pbr: true } };
  const spend = { remainingMs: () => 1000, submit: async () => ({ payload: { id: taskId, urls: { get: getUrl }, status: initialStatus, output: 'https://synthetic-artifact.invalid/model.glb' } }) };
  return { calls, generate: () => context.generateReplicate(spec, spend) };
}

for (const getUrl of [
  'http://collector.example/receive-token',
  'https://collector.example/receive-token',
  'http://api.replicate.com/v1/predictions/synthetic-task',
  'https://api.replicate.com.collector.example/v1/predictions/synthetic-task',
  'https://api.replicate.com@collector.example/v1/predictions/synthetic-task',
  'https://user:password@api.replicate.com/v1/predictions/synthetic-task',
  'https://api.replicate.com:444/v1/predictions/synthetic-task',
  'https://api.replicate.com:443/v1/predictions/synthetic-task',
  'https://api.replicate.com/v1/predictions/other-task',
  'https://api.replicate.com/v1/predictions/other-task/../synthetic-task',
  'https://api.replicate.com/v1/predictions/%73ynthetic-task',
  'https://api.replicate.com/v1/predictions/synthetic-task?redirect=https://collector.example',
  'https://api.replicate.com/v1/predictions/synthetic-task#collector',
  '//api.replicate.com/v1/predictions/synthetic-task',
  null,
]) {
  test(`actual Replicate leaf rejects untrusted prediction URL before token-bearing GET: ${String(getUrl)}`, async () => {
    const f = replicateFixture({ getUrl });
    await assert.rejects(f.generate(), /prediction polling URL/);
    assert.equal(f.calls.length, 0);
  });
}

for (const taskId of ['../task', 'task?redirect=foreign', '', {}, 'x'.repeat(129)]) {
  test(`actual Replicate leaf rejects an unsafe prediction ID: ${JSON.stringify(taskId)}`, async () => {
    const f = replicateFixture({ taskId });
    await assert.rejects(f.generate(), /invalid prediction identity/);
    assert.equal(f.calls.length, 0);
  });
}

test('actual Replicate polling retains authenticated canonical GETs and accepts matching completed task', async () => {
  const f = replicateFixture({ polls: [
    { id: 'synthetic-task', status: 'processing', urls: { get: 'https://api.replicate.com/v1/predictions/synthetic-task' } },
    { id: 'synthetic-task', status: 'succeeded', output: 'https://synthetic-artifact.invalid/model.glb' },
  ] });
  assert.equal((await f.generate()).taskId, 'synthetic-task');
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(call => call.url === 'https://api.replicate.com/v1/predictions/synthetic-task'));
  assert.ok(f.calls.every(call => call.init.headers.Authorization === 'Bearer synthetic-poll-secret'));
});

test('actual Replicate polling refuses redirects and never forwards its token to a redirect target', async () => {
  const f = replicateFixture({ redirect: true });
  await assert.rejects(f.generate(), /redirect rejected/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://api.replicate.com/v1/predictions/synthetic-task');
});

test('actual Replicate polling rejects changed task identity and untrusted returned polling metadata', async () => {
  for (const payload of [
    { id: 'other-task', status: 'succeeded', output: 'https://synthetic-artifact.invalid/model.glb' },
    { id: 'synthetic-task', status: 'processing', urls: { get: 'https://collector.example/receive-token' } },
  ]) {
    const f = replicateFixture({ polls: [payload] });
    await assert.rejects(f.generate(), /prediction identity|prediction polling URL/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, 'https://api.replicate.com/v1/predictions/synthetic-task');
  }
});

test('already completed Replicate create responses still require coherent trusted prediction metadata', async () => {
  const f = replicateFixture({ getUrl: 'https://collector.example/receive-token', initialStatus: 'succeeded' });
  await assert.rejects(f.generate(), /prediction polling URL/);
  assert.equal(f.calls.length, 0);
});

test('actual requestJson refuses every billable POST without protected client', async () => {
  let fetchCalls = 0; const context = vm.createContext({ ...responseGlobals, fail: failure, fetch: async () => { fetchCalls++; } });
  vm.runInContext(requestSource, context);
  await assert.rejects(context.requestJson('https://api.replicate.com/v1/predictions', { method: 'POST', body: '{}' }), /protected Model Forge spend client/);
  assert.equal(fetchCalls, 0);
});
test('actual requestJson never repeats billable POST even with maxRateLimitRetries=4', async () => {
  let calls = 0; const context = vm.createContext({ ...responseGlobals, fail: failure }); vm.runInContext(requestSource, context);
  await assert.rejects(context.requestJson('https://api.replicate.com/v1/predictions', { method: 'POST', body: '{}' }, 4, { submit: async () => { calls++; throw Error('synthetic HTTP 429'); } }, 'synthetic/model'), /429/);
  assert.equal(calls, 1);
});
test('actual read-only POST exception is limited to existing Rodin status/download', async () => {
  let calls = 0; const context = vm.createContext({ ...responseGlobals, fail: failure, AbortSignal, timeoutMs: () => 1000, sleep: async () => {}, fetch: async () => { calls++; return new Response('{}'); } }); vm.runInContext(requestSource, context);
  await assert.rejects(context.requestJson('https://api.hyper3d.com/api/v2/rodin', { method: 'POST' }, 4, null, null, true), /Unrecognized read-only/);
  for (const lane of ['status', 'download']) await context.requestJson(`https://api.hyper3d.com/api/v2/${lane}`, { method: 'POST' }, 4, null, null, true);
  assert.equal(calls, 2);
});
test('existing GET rate-limit handling remains read-only', async () => {
  let calls = 0; const context = vm.createContext({ ...responseGlobals, fail: failure, AbortSignal, timeoutMs: () => 1000, sleep: async () => {}, retryAfterMs: () => 0, fetch: async () => { calls++; return new Response('{}', { status: calls > 1 ? 200 : 429 }); } }); vm.runInContext(requestSource, context);
  await context.requestJson('https://api.replicate.com/v1/predictions/synthetic-task'); assert.equal(calls, 2);
});

test('all actual Model Forge adapters delegate each billable leaf with exact model', async () => {
  const calls = []; let readOnly = 0;
  const context = vm.createContext({ ...responseGlobals, process: { env: {} }, fail: failure, FormData, Blob, path, URL, fs: { existsSync: () => false }, TRIPO_STABLE_MODEL: 'v3.1-20260211', timeoutMs: () => 1000, sleep: async () => {}, AbortSignal,
    pollJson: async url => url.includes('tripo') ? { code: 0, data: { status: 'success', output: { model: 'https://synthetic-artifact.invalid/model.glb' } } } : { status: 'SUCCEEDED', model_urls: { glb: 'https://synthetic-artifact.invalid/model.glb' } },
    fetch: async url => { readOnly++; return new Response(JSON.stringify(url.endsWith('/status') ? { jobs: [{ status: 'Done' }] } : { list: [{ name: 'candidate.glb', url: 'https://synthetic-artifact.invalid/model.glb' }] })); },
    firstHttpUrl: value => typeof value === 'string' ? value : Object.values(value || {}).find(v => typeof v === 'string' && v.startsWith('https://')),
    assertPublicHttpUrl: value => value,
    assertTripoOk: payload => payload,
  });
  vm.runInContext(requestSource + '\n' + generators, context);
  const spec = { id: 'fixture', prompt: 'synthetic only', target: { maxTriangles: 100, pbr: true, textureResolution: '4k' }, generation: { seed: null } };
  const client = { remainingMs: () => 1000, savePreviewCheckpoint: () => {}, submit: async (url, init, model) => { calls.push({ url, init, model }); const payload = url.includes('meshy') ? { result: 'synthetic-meshy-task' } : url.includes('tripo') ? { code: 0, data: { task_id: 'synthetic-tripo-task' } } : url.includes('hyper3d') ? { uuid: 'synthetic-rodin-task', jobs: { subscription_key: 'synthetic-key' } } : { id: 'synthetic-replicate-task', urls: { get: 'https://api.replicate.com/v1/predictions/synthetic-replicate-task' }, status: 'succeeded', output: 'https://synthetic-artifact.invalid/model.glb' }; return { payload }; } };
  for (const provider of ['meshy', 'tripo', 'rodin', 'replicate']) assert.equal((await context.generate(provider, spec, client)).url, 'https://synthetic-artifact.invalid/model.glb');
  assert.equal(calls.length, 5); assert.equal(readOnly, 2);
  assert.deepEqual(calls.map(c => c.model), ['meshy-7.1', 'meshy-7.1', 'v3.1-20260211', 'Gen-2.5-Medium', 'tencent/hunyuan-3d-3.1']);
  assert(calls.every(c => c.init.method === 'POST'));
});

test('actual Meshy resume delegates only refinement after authenticated preview readback', async () => {
  let paid = 0, verified = 0;
  const context = vm.createContext({ ...responseGlobals, process: { env: {} }, fs: { existsSync: () => false }, fail: failure, encodeURIComponent,
    pollJson: async () => ({ status: 'SUCCEEDED', model_urls: { glb: 'https://synthetic-artifact.invalid/model.glb' } }), firstHttpUrl: value => value,
  }); vm.runInContext(requestSource + '\n' + generators, context);
  const client = { previewCheckpoint: { synthetic: true }, verifiedPreview: async () => { verified++; return 'settled-preview'; }, submit: async (_url, request) => { paid++; const body = JSON.parse(request.body); assert.equal(body.mode, 'refine'); assert.equal(body.preview_task_id, 'settled-preview'); return { payload: { result: 'refined-task' } }; } };
  const spec = { prompt: 'synthetic', target: { pbr: true, textureResolution: '4k' }, generation: { seed: null } };
  assert.equal((await context.generateMeshy(spec, client)).url, 'https://synthetic-artifact.invalid/model.glb'); assert.equal(verified, 1); assert.equal(paid, 1);
});

for (const mode of ['provider loss', 'download loss', 'structural rejection', 'remote reference']) {
  test(`actual candidate loop cannot authorize regeneration after ${mode}`, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-model-retry-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const specPath = path.join(dir, 'spec.json'); const spec = { id: 'fixture', prompt: 'synthetic', providers: ['replicate'], generation: { maxProviderAttempts: 3 }, target: { maxTriangles: 100 } };
    if (mode === 'remote reference') spec.referenceImages = ['https://synthetic-reference.invalid/mutable.png'];
    fs.writeFileSync(specPath, JSON.stringify(spec)); let generationCalls = 0, output;
    const context = vm.createContext({ ...responseGlobals, fs, path, crypto, Date, structuredClone, process: { argv: ['node', 'forge', '--spec', specPath], env: { REPLICATE_API_TOKEN: 'synthetic-key' }, exitCode: 0 }, console: { log: text => output = JSON.parse(text) },
      parseArgs: () => ({ spec: specPath, providers: [], dryRun: false, out: path.join(dir, 'runs') }), validateSpec: value => value, SUPPORTED_PROVIDERS: new Set(['replicate']), spendAllowed: () => true, requiredEnv: () => 'REPLICATE_API_TOKEN', fail: failure,
      ModelSpendClient: class { records = [{ attempt_id: 'synthetic-reservation', reconciliation_required: true }]; remainingMs() { return 1000; } },
      generate: async () => { generationCalls++; if (mode === 'provider loss') throw Error('synthetic unknown remote task'); return { url: 'https://synthetic-artifact.invalid/file', taskId: 'synthetic-task', model: 'synthetic/model' }; },
      downloadFile: async (_url, filename) => { if (mode === 'download loss') throw Error('synthetic download failure'); fs.writeFileSync(filename, 'synthetic'); return { bytes: 9, sha256: 'f'.repeat(64) }; },
      structuralCandidateReport: () => { throw Error('synthetic rejected geometry'); },
    });
    vm.runInContext(section('function safeFailureMessage(', '\nfunction parseArgs') + '\n' + section('async function main()', '\nmain().catch'), context); await context.main();
    assert.equal(generationCalls, mode === 'remote reference' ? 0 : 1); assert.equal(output.providers[0].attempts.length, 1); assert.equal(output.providers[0].status, 'failed'); assert.equal(context.process.exitCode, 1);
  });
}
