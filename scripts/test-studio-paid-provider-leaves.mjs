// Actual TypeScript leaves, synthetic transports, real temporary Git checks, zero provider calls.
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { syntheticCleanBuild, syntheticStudioSpend } from './lib/studio-spend-test-fixture.mjs';

const sourceRoot = new URL('../assetfactory-studio/lib/server/', import.meta.url);
const modules = new Map();
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = stripTypeScriptTypes(readFileSync(new URL(`${name}.ts`, sourceRoot), 'utf8'), { mode: 'strip' });
  const module = new vm.SourceTextModule(source, { identifier: name }); modules.set(name, module);
  await module.link(async specifier => {
    if (specifier === './firebaseAdmin') return new vm.SyntheticModule(['getAdminDb'], function () { this.setExport('getAdminDb', () => globalThis.__ASSET_FACTORY_TEST_ISSUER_DB__ ?? null); });
    if (specifier.startsWith('./')) return load(specifier.slice(2));
    const exports = await import(specifier);
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); });
  });
  return module;
}
const protectedModule = await load('protectedProviderRequest'); await protectedModule.evaluate();
const runtimeModule = await load('assetProviderRuntime'); await runtimeModule.evaluate();
const videoModule = await load('assetVideoProviderRuntime'); await videoModule.evaluate();
const catalogModule = await load('assetTypeCatalog'); await catalogModule.evaluate();
const higgsModule = await load('higgsfieldClient'); await higgsModule.evaluate();
const protector = protectedModule.namespace, runtime = runtimeModule.namespace, video = videoModule.namespace, catalog = catalogModule.namespace, higgs = higgsModule.namespace;
const build = syntheticCleanBuild(); after(() => build.restore());
const priorEnv = { ...process.env }, originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; for (const key of Object.keys(process.env)) if (!(key in priorEnv)) delete process.env[key]; for (const [key, value] of Object.entries(priorEnv)) process.env[key] = value; });
const input = (type = 'graphic') => ({ jobId: `synthetic-${type}`, tenantId: 'synthetic-tenant', prompt: 'Synthetic café 😀, no private input', type });
const jsonHeaders = extra => ({ 'content-type': 'application/json', ...extra });
const genericModel = 'synthetic/model';
const artifactUrl = 'https://outputs.example.test/artifact';
function env(values = {}) {
  for (const key of Object.keys(process.env)) if (/^(ASSET_FACTORY_(MEDIA|VIDEO|GRAPHICS|AUDIO|OPENAI|FAL|REPLICATE|HIGGSFIELD)|OPENAI_API_KEY|ELEVENLABS_|STABILITY_API_KEY|REPLICATE_API_TOKEN|FAL_KEY|RUNWAY_API_KEY|HIGGSFIELD_API_KEY)/.test(key)) delete process.env[key];
  Object.assign(process.env, { ASSET_FACTORY_PROVIDER_TIMEOUT_MS: '5000', ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS: '5000', ASSET_FACTORY_VIDEO_PROVIDER_POLL_MS: '1', ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS: 'https://outputs.example.test' }, values);
}
function config(provider, type) {
  const request = input(type); let endpoint, model, lane = type, body, headers, mime = 'image/png';
  env({ ASSET_FACTORY_MEDIA_PROVIDER: provider, ASSET_FACTORY_VIDEO_PROVIDER: provider });
  if (provider === 'openai') {
    process.env.OPENAI_API_KEY = 'SYNTHETIC-openai';
    if (type === 'audio') { process.env.ASSET_FACTORY_OPENAI_VOICE = 'SYNTHETIC-explicit-voice'; model = 'gpt-4o-mini-tts'; lane = 'speech'; endpoint = 'https://api.openai.com/v1/audio/speech'; body = { model, voice: process.env.ASSET_FACTORY_OPENAI_VOICE, input: request.prompt, response_format: 'wav' }; mime = 'audio/wav'; }
    else { model = 'gpt-image-1'; endpoint = 'https://api.openai.com/v1/images/generations'; body = { model, prompt: request.prompt, size: '1024x1024', response_format: 'b64_json' }; }
    headers = jsonHeaders({ authorization: 'Bearer SYNTHETIC-openai' });
  } else if (provider === 'elevenlabs') {
    process.env.ELEVENLABS_API_KEY = 'SYNTHETIC-elevenlabs'; process.env.ELEVENLABS_VOICE_ID = 'SYNTHETIC-explicit-voice'; model = 'eleven_multilingual_v2'; lane = 'speech'; endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`; body = { text: request.prompt, model_id: model }; headers = jsonHeaders({ 'xi-api-key': 'SYNTHETIC-elevenlabs', accept: 'audio/mpeg' }); mime = 'audio/mpeg';
  } else if (provider === 'stability') {
    process.env.STABILITY_API_KEY = 'SYNTHETIC-stability'; model = 'stable-image-core'; endpoint = `https://api.stability.ai/v2beta/stable-image/generate/${model}`; const multipart = protector.studioMultipart({ prompt: request.prompt, output_format: 'png' }); body = multipart.body; headers = { authorization: 'Bearer SYNTHETIC-stability', accept: 'image/*', 'content-type': multipart.contentType };
  } else if (provider === 'replicate') {
    process.env.REPLICATE_API_TOKEN = 'SYNTHETIC-replicate'; model = genericModel; process.env[`ASSET_FACTORY_REPLICATE_${type === 'graphic' ? 'GRAPHICS' : type === 'model3d' ? 'MODEL3D' : type === 'video' ? 'VIDEO' : 'AUDIO'}_MODEL`] = model;
    endpoint = `https://api.replicate.com/v1/models/${model}/predictions`; body = { input: type === 'video' ? { prompt: request.prompt, aspect_ratio: '9:16', duration: 4, fps: 24 } : { prompt: request.prompt } }; headers = jsonHeaders({ authorization: 'Bearer SYNTHETIC-replicate', ...(type === 'video' ? { prefer: 'wait=60' } : {}) });
    if (type === 'audio') mime = 'audio/wav'; if (type === 'model3d') mime = 'model/gltf-binary';
  } else if (provider === 'fal' || provider === 'runway') {
    process.env[provider === 'fal' ? 'FAL_KEY' : 'RUNWAY_API_KEY'] = `SYNTHETIC-${provider}`; model = genericModel;
    if (type === 'video') { endpoint = `https://approved.example.test/${provider}/video`; process.env[`ASSET_FACTORY_${provider.toUpperCase()}_VIDEO_ENDPOINT`] = endpoint; process.env[`ASSET_FACTORY_${provider.toUpperCase()}_VIDEO_MODEL`] = model; body = { model, prompt: request.prompt, aspectRatio: '9:16', durationSeconds: 4, fps: 24, motionStrength: 0.75, referenceImageUrl: null, referenceVideoUrl: null }; headers = jsonHeaders({ authorization: `Bearer SYNTHETIC-${provider}` }); }
    else { endpoint = `https://fal.run/${model}`; process.env[`ASSET_FACTORY_FAL_${type === 'graphic' ? 'GRAPHICS' : type === 'model3d' ? 'MODEL3D' : 'AUDIO'}_MODEL`] = model; body = { prompt: request.prompt }; headers = jsonHeaders({ authorization: 'Key SYNTHETIC-fal' }); }
    if (type === 'audio') mime = 'audio/wav'; if (type === 'model3d') mime = 'model/gltf-binary';
  } else if (provider === 'higgsfield') {
    process.env.HIGGSFIELD_API_KEY_ID = 'SYNTHETIC-id'; process.env.HIGGSFIELD_API_KEY_SECRET = 'SYNTHETIC-secret';
    model = type === 'graphic' ? 'higgsfield-ai/soul/v2/standard' : 'bytedance/seedance-2.5/text-to-video'; endpoint = `https://api.higgsfield.ai/${model}`;
    body = type === 'graphic' ? { prompt: request.prompt } : { prompt: request.prompt, duration: 4, resolution: '720p', aspect_ratio: '16:9', output_format: 'mp4', generate_audio: true };
    headers = jsonHeaders({ authorization: 'Key SYNTHETIC-id:SYNTHETIC-secret', 'Idempotency-Key': higgs.higgsfieldIdempotencyKey(request.jobId, type === 'graphic' ? 'graphic' : 'text-to-video', model) });
  }
  if (type === 'video') mime = 'video/mp4';
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const fixture = syntheticStudioSpend(request, { endpoint, provider, model, lane, body: bytes, headers }, protector);
  const run = () => type === 'video' ? video.renderVideoWithConfiguredProvider(request) : runtime.renderWithConfiguredProvider(request, catalog.resolveAssetType(type));
  let posts = 0, gets = 0;
  const transport = async (url, init = {}) => {
    assert.equal(init.redirect, 'error');
    if (init.method === 'POST') { posts++; assert.equal(String(url), endpoint); assert.deepEqual(Buffer.from(init.body), bytes); assert.deepEqual([...new Headers(init.headers).entries()], [...new Headers(headers).entries()]);
      if (provider === 'openai' && type === 'graphic') return Response.json({ data: [{ b64_json: Buffer.from([1, 2, 3]).toString('base64') }] });
      if (provider === 'openai' || provider === 'elevenlabs' || provider === 'stability') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': mime } });
      if (provider === 'higgsfield') return Response.json({ request_id: 'SYNTHETIC-task', status: 'completed', [type === 'video' ? 'video' : 'image']: { url: artifactUrl } });
      if (provider === 'replicate') return Response.json({ id: 'SYNTHETIC-task', status: 'succeeded', output: artifactUrl });
      return Response.json({ id: 'SYNTHETIC-task', model, output: artifactUrl });
    }
    gets++; assert.equal(String(url), artifactUrl); return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': mime } });
  };
  globalThis.fetch = fixture.wrap(transport);
  return { request, endpoint, headers, bytes, fixture, run, transport, counts: () => ({ posts, gets }) };
}

for (const [provider, types] of [['openai', ['graphic', 'audio']], ['elevenlabs', ['audio']], ['stability', ['graphic']], ['replicate', ['graphic', 'model3d', 'audio', 'video']], ['fal', ['graphic', 'model3d', 'audio', 'video']], ['runway', ['video']], ['higgsfield', ['graphic', 'video']]]) for (const type of types) {
  test(`actual ${provider} ${type} leaf submits one exact protected request`, async () => {
    const c = config(provider, type); const result = await c.run(); assert.equal(result.assetBuffer.length, 3); assert.equal(c.counts().posts, 1); assert.deepEqual(c.fixture.calls, ['preflight', 'reserve', 'record']); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'succeeded'); assert.equal(c.fixture.observed[0].actual_usd_micros, undefined);
  });
}
test('configured credentials and boolean flags cannot submit without protected gateway/job/source authority', async () => {
  for (const key of ['ASSET_FORGE_SPEND_GATEWAY_URL', 'ASSET_FORGE_SPEND_WORKER_TOKEN', 'FACTORY_STUDIO_SPEND_JOB_IDS_JSON', 'URAI_SOURCE_SHA']) {
    const c = config('openai', 'graphic'), value = process.env[key]; delete process.env[key]; process.env.ASSET_FACTORY_PROVIDER_APPROVED = 'true';
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); process.env[key] = value;
  }
});
for (const [name, mutate] of [
  ['rights', e => { e.job.rights_reviewed = false; }], ['consumer', e => { e.job.consumer = 'other'; }], ['model', e => { e.job.model_version = 'other'; }], ['source', e => { e.job.executor.source_sha = 'f'.repeat(40); }], ['endpoint', e => { e.job.executor.endpoint += '/other'; }], ['source input', e => { e.job.executor.source_input_sha256 = 'f'.repeat(64); }], ['request', e => { e.job.executor.request_sha256 = 'f'.repeat(64); }], ['credential', e => { e.job.executor.credential_sha256 = 'f'.repeat(64); }], ['headers', e => { e.job.executor.semantic_headers_sha256 = 'f'.repeat(64); }], ['content type', e => { e.job.executor.content_type = 'text/plain'; }], ['input fixity', e => { e.job.input_sha256 = []; }], ['asset owner', e => { e.job.executor.asset = 'other-tenant/asset'; }]
]) test(`changed protected ${name} refuses actual provider request`, async () => { const c = config('openai', 'graphic'); c.fixture.mutatePreflight = mutate; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']); });
test('gateway failure and lost reserve responses never invoke a provider or clear the hold', async () => {
  for (const action of ['preflight', 'reserve']) { const c = config('openai', 'graphic'); c.fixture.failAction = action; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); }
  const c = config('openai', 'graphic'); c.fixture.loseReserveResponse = true; await assert.rejects(c.run()); assert.equal(c.fixture.held, true); c.fixture.loseReserveResponse = false; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0);
});
test('one uncertain provider call prevents requeued duplicate generation', async () => {
  const c = config('openai', 'graphic'); let posts = 0; globalThis.fetch = c.fixture.wrap(async () => { posts++; throw new Error('SYNTHETIC unknown provider outcome'); });
  await assert.rejects(c.run()); await assert.rejects(c.run()); assert.equal(posts, 1); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed');
});
test('concurrent Studio sessions share one protected job and only one can submit', async () => {
  const c = config('openai', 'graphic'); const results = await Promise.allSettled(Array.from({ length: 20 }, () => c.run()));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(c.counts().posts, 1); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed.length, 1);
});
test('a second paid submission in one admitted session cannot reach fetch', async () => {
  const c = config('openai', 'graphic'); await assert.rejects(protector.withProtectedStudioSession(c.request, async () => { const init = { method: 'POST', headers: c.headers, body: c.bytes }; await protector.paidStudioFetch('openai', 'gpt-image-1', 'graphic', c.endpoint, init); await protector.paidStudioFetch('openai', 'gpt-image-1', 'graphic', c.endpoint, init); })); assert.equal(c.counts().posts, 1); assert.equal(c.fixture.held, true);
});
test('caller mutation during preflight cannot replace admitted method, credential or semantic headers', async () => {
  const c = config('openai', 'graphic'), headers = { ...c.headers }, init = { method: 'POST', headers, body: c.bytes };
  c.fixture.mutatePreflight = () => { headers.authorization = 'Bearer SYNTHETIC-other-account'; headers['content-type'] = 'text/plain'; init.method = 'PUT'; };
  await protector.withProtectedStudioSession(c.request, () => protector.paidStudioFetch('openai', 'gpt-image-1', 'graphic', c.endpoint, init));
  assert.equal(c.counts().posts, 1); assert.equal(c.fixture.held, true); assert.deepEqual(c.fixture.calls, ['preflight', 'reserve', 'record']);
});
test('provider continuations reject IP literals and local routing names before fetch', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('private network must not be contacted'); };
  for (const host of ['localhost', 'sub.localhost', 'sub.localhost.', 'local', 'sub.local', 'sub.internal', '127.0.0.1', '2130706433', '10.0.0.1', '[::1]', '[::ffff:127.0.0.1]']) await assert.rejects(protector.readStudioProvider(`https://${host}/status`));
  assert.equal(calls, 0);
});
test('actual Git rejects old, dirty and untracked source before provider admission', async () => {
  const c = config('openai', 'graphic'), declared = process.env.URAI_SOURCE_SHA; process.env.URAI_SOURCE_SHA = 'f'.repeat(40); await assert.rejects(c.run()); process.env.URAI_SOURCE_SHA = declared;
  const file = path.join(build.directory, 'assetfactory-studio/lib/server/assetProviderRuntime.ts'), bytes = readFileSync(file); writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n// dirty synthetic source\n')])); await assert.rejects(c.run()); writeFileSync(file, bytes);
  build.git('rm', '--cached', '--', 'assetfactory-studio/lib/server/assetProviderRuntime.ts'); await assert.rejects(c.run()); build.git('add', 'assetfactory-studio/lib/server/assetProviderRuntime.ts');
  assert.equal(c.counts().posts, 0);
});
test('source changing between preflight and reserve is rejected locally', async () => {
  const c = config('openai', 'graphic'), file = path.join(build.directory, 'assetfactory-studio/lib/server/higgsfieldClient.ts'), bytes = readFileSync(file);
  c.fixture.mutatePreflight = () => writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n// synthetic dirty source\n')]));
  try { await assert.rejects(c.run()); assert.deepEqual(c.fixture.calls, ['preflight']); assert.equal(c.counts().posts, 0); } finally { writeFileSync(file, bytes); }
});
test('foreign credential-bearing poll URL is rejected before an outbound continuation', async () => {
  const c = config('replicate', 'video'); let posts = 0, foreign = 0;
  globalThis.fetch = c.fixture.wrap(async (url, init) => { if (init.method === 'POST') { posts++; return Response.json({ id: 'SYNTHETIC-task', status: 'starting', urls: { get: 'https://foreign.example.test/status' } }); } foreign++; throw new Error('foreign call should not occur'); });
  await assert.rejects(c.run()); assert.equal(posts, 1); assert.equal(foreign, 0); assert.equal(c.fixture.held, true);
});
test('Replicate status must stay canonical HTTPS and match the same task in both actual lanes', async () => {
  for (const type of ['graphic', 'video']) for (const get of ['http://api.replicate.com/v1/predictions/SYNTHETIC-task', 'https://api.replicate.com:8443/v1/predictions/SYNTHETIC-task', 'https://api.replicate.com/v1/predictions/other-task', 'https://api.replicate.com/v1/predictions/SYNTHETIC-task?redirect=https://foreign.example.test', 'https://api.replicate.com/v1/models/private/action']) {
    const c = config('replicate', type); let posts = 0, gets = 0;
    globalThis.fetch = c.fixture.wrap(async (url, init) => { if (init.method === 'POST') { posts++; return Response.json({ id: 'SYNTHETIC-task', status: 'starting', urls: { get } }); } gets++; throw new Error('must not leak provider credential'); });
    await assert.rejects(c.run()); assert.equal(posts, 1); assert.equal(gets, 0); assert.equal(c.fixture.held, true);
  }
});
test('same-origin status response cannot replace the admitted provider task', async () => {
  const c = config('replicate', 'video'); let posts = 0, gets = 0;
  globalThis.fetch = c.fixture.wrap(async (url, init) => { if (init.method === 'POST') { posts++; return Response.json({ id: 'SYNTHETIC-task', status: 'starting', urls: { get: 'https://api.replicate.com/v1/predictions/SYNTHETIC-task' } }); } gets++; return Response.json({ id: 'different-task', status: 'succeeded', output: artifactUrl }); });
  await assert.rejects(c.run()); assert.equal(posts, 1); assert.equal(gets, 1); assert.equal(c.fixture.held, true);
});
test('Higgsfield authenticated status cannot use a different same-origin task or path', async () => {
  const c = config('higgsfield', 'video'); let posts = 0, gets = 0;
  globalThis.fetch = c.fixture.wrap(async (url, init) => { if (init.method === 'POST') { posts++; return Response.json({ request_id: 'SYNTHETIC-task', status: 'queued', status_url: 'https://api.higgsfield.ai/requests/other-task/status' }); } gets++; throw new Error('must not send credential'); });
  await assert.rejects(c.run()); assert.equal(posts, 1); assert.equal(gets, 0); assert.equal(c.fixture.held, true);
});
test('unaccepted voice identity cannot fall through to a stock voice', async () => {
  for (const [provider, key] of [['openai', 'ASSET_FACTORY_OPENAI_VOICE'], ['elevenlabs', 'ELEVENLABS_VOICE_ID']]) { const c = config(provider, 'audio'); delete process.env[key]; await assert.rejects(c.run(), /explicitly approved/); assert.equal(c.counts().posts, 0); }
});
test('durable observation failure with a generated result stays blocked and holds funds', async () => {
  const c = config('openai', 'graphic'); c.fixture.failAction = 'record'; await assert.rejects(c.run()); assert.equal(c.counts().posts, 1); assert.equal(c.fixture.held, true); await assert.rejects(c.run()); assert.equal(c.counts().posts, 1);
});
test('deadline bounds all polling and never opens another paid submission', async () => {
  const c = config('replicate', 'video'); c.fixture.job.budget.max_runtime_seconds = 1; c.fixture.mutateReserve = r => { r.max_runtime_seconds = 1; }; let posts = 0;
  process.env.ASSET_FACTORY_VIDEO_PROVIDER_POLL_MS = '600';
  globalThis.fetch = c.fixture.wrap(async (url, init) => { if (init.method === 'POST') posts++; return Response.json({ id: 'SYNTHETIC-task', status: 'starting', urls: { get: 'https://api.replicate.com/v1/predictions/SYNTHETIC-task' } }); });
  await assert.rejects(c.run()); assert.equal(posts, 1); assert.equal(c.fixture.held, true);
});
test('reservation cannot expand the signed job runtime or mark execution already performed', async () => {
  for (const mutate of [r => { r.max_runtime_seconds = 31; }, r => { r.execution_performed = true; }, r => { r.provider_call_authorized = false; }, r => { r.job_digest = 'f'.repeat(64); }, r => { r.executor_source_sha = 'f'.repeat(40); }]) { const c = config('openai', 'graphic'); c.fixture.mutateReserve = mutate; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); }
});
test('protected preflight account and credential controls cannot contradict the actual provider key', async () => {
  for (const mutate of [e => { e.account.account_id = 'other'; }, e => { e.account.credential_binding_verified = false; }, e => { e.account.credential_binding_receipt = ''; }, e => { e.account.credential_sha256 = 'f'.repeat(64); }, e => { e.protected_controls.credential_sha256 = 'f'.repeat(64); }, e => { e.protected_controls.semantic_headers_sha256 = 'f'.repeat(64); }, e => { e.protected_controls.source_input_sha256 = 'f'.repeat(64); }, e => { e.protected_controls.content_type = 'text/plain'; }]) {
    const c = config('openai', 'graphic'); c.fixture.mutatePreflight = mutate; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']);
  }
});
test('reserved account and fingerprint echoes cannot admit a different account or request', async () => {
  for (const field of ['account_id', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type']) { const c = config('openai', 'graphic'); c.fixture.mutateReserve = r => { r[field] = 'SYNTHETIC-wrong-binding'; }; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); }
});
test('protected controls require exact source, request, signed caps and hard enforcement before dispatch', async () => {
  for (const [field, value] of [['enforcement_source_sha', 'f'.repeat(40)], ['endpoint', 'https://other.example.test'], ['request_sha256', 'f'.repeat(64)], ['proof_receipt', ''], ['hard_stop_supported', false], ['cost_cap_enforced', false], ['auto_top_up', true], ['max_usd_micros', 9_000_000], ['max_credits', 99], ['max_runtime_seconds', 31]]) {
    const c = config('openai', 'graphic'); c.fixture.mutatePreflight = e => { e.protected_controls[field] = value; };
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']);
  }
});
test('source authority, account and control observations reject stale, future and malformed timestamps', async () => {
  for (const target of ['authority', 'account', 'protected_controls']) for (const [field, value] of [['observed_at', new Date(Date.now() + 3_600_000).toISOString()], ['expires_at', new Date(Date.now() - 1_000).toISOString()], ['expires_at', '2026-02-30T12:00:00Z'], ['expires_at', '2026-12-01'], ['expires_at', '2026-12-01T12:00:00'], ['expires_at', undefined]]) {
    const c = config('openai', 'graphic'); c.fixture.mutatePreflight = e => { e[target][field] = value; };
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']);
  }
});
test('source authority, account or controls expiring during reserve cannot dispatch and retain the admitted hold', async () => {
  for (const target of ['authority', 'account', 'protected_controls']) {
    const originalNow = Date.now, started = originalNow(); Date.now = () => started;
    const c = config('openai', 'graphic');
    c.fixture.mutatePreflight = e => { e[target].expires_at = new Date(started + 1_000).toISOString(); };
    c.fixture.mutateReserve = () => { Date.now = () => started + 2_000; };
    try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed'); } finally { Date.now = originalNow; }
  }
});
test('source authority proof cannot change its trusted source binding', async () => {
  for (const mutate of [e => { e.authority.trusted_readback = false; }, e => { e.authority.binding.sha = 'f'.repeat(40); }, e => { e.authority.binding.repository = 'Other/repository'; }]) {
    const c = config('openai', 'graphic'); c.fixture.mutatePreflight = mutate; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']);
  }
});
test('a delayed reservation cannot restart the signed runtime at response receipt', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  const c = config('openai', 'graphic'); c.fixture.mutateReserve = () => { Date.now = () => started + 31_000; };
  try { await assert.rejects(c.run(), /deadline/); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); } finally { Date.now = originalNow; }
});
test('local provenance and proof checks cannot consume the runtime then reach the paid POST', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  const c = config('openai', 'graphic'); c.fixture.mutateReserve = () => { let reads = 0; Date.now = () => started + (++reads >= 5 ? 31_000 : 0); };
  try { await assert.rejects(c.run(), /deadline/); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); } finally { Date.now = originalNow; }
});
test('protected pricing requires its receipt, trusted identity and every actual transport fingerprint', async () => {
  const changes = [e => { delete e.protected_pricing; }, e => { e.protected_pricing = []; }, e => { e.protected_pricing.trusted_readback = false; }, e => { e.protected_pricing.receipt = ''; }, ...['provider', 'account_id', 'model_version', 'request_sha256', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type'].map(field => e => { e.protected_pricing[field] = 'SYNTHETIC-other-price'; })];
  for (const mutate of changes) { const c = config('openai', 'graphic'); c.fixture.mutatePreflight = mutate; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']); }
});
test('protected pricing rates cannot differ from the exact approved budget rates', async () => {
  for (const mutate of [e => { e.protected_pricing.rates.usd_micros_per_unit++; }, e => { e.protected_pricing.rates.credits_per_unit++; }, e => { e.protected_pricing.rates.receipt = ''; }, e => { e.protected_pricing.rates.receipt = 'SYNTHETIC-other-price'; }, e => { e.protected_pricing.rates = null; }, e => { e.job.budget.rates = null; }]) { const c = config('openai', 'graphic'); c.fixture.mutatePreflight = mutate; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']); }
});
test('pricing observation and approved rates both reject stale, future and malformed timestamps', async () => {
  for (const rates of [false, true]) for (const [field, value] of [[rates ? 'verified_at' : 'observed_at', new Date(Date.now() + 3_600_000).toISOString()], ['expires_at', new Date(Date.now() - 1_000).toISOString()], ['expires_at', '2026-02-30T12:00:00Z'], ['expires_at', '2026-12-01'], ['expires_at', '2026-12-01T12:00:00'], ['expires_at', '2026-12-01T24:00:00Z'], ['expires_at', undefined]]) {
    const c = config('openai', 'graphic'); c.fixture.mutatePreflight = e => { const target = rates ? e.protected_pricing.rates : e.protected_pricing; target[field] = value; if (rates) e.job.budget.rates = structuredClone(target); };
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']);
  }
});
test('pricing expiring while reserve is in flight cannot dispatch and retains the admitted hold', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  const c = config('openai', 'graphic'); c.fixture.mutatePreflight = e => { e.protected_pricing.expires_at = new Date(started + 1_000).toISOString(); };
  c.fixture.mutateReserve = () => { Date.now = () => started + 2_000; };
  try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); } finally { Date.now = originalNow; }
});
test('source changing after atomic reserve cannot reach provider fetch and retains the hold', async () => {
  const c = config('openai', 'graphic'), file = path.join(build.directory, 'assetfactory-studio/lib/server/higgsfieldClient.ts'), bytes = readFileSync(file);
  c.fixture.mutateReserve = () => writeFileSync(file, Buffer.concat([bytes, Buffer.from('\n// synthetic source change after reservation\n')]));
  try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); } finally { writeFileSync(file, bytes); }
});
test('original Higgsfield entry cannot submit without source input even with configured credentials', async () => {
  config('higgsfield', 'video'); let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('must not fetch'); }; await assert.rejects(higgs.runHiggsfieldGeneration('approved/model', {}, 'SYNTHETIC-key')); assert.equal(calls, 0);
});

test('protected issuer absence, lookup failure and untrusted project cannot send any worker token', async () => {
  for (const mutate of [c => { c.fixture.issuerExists = false; }, c => { c.fixture.failIssuer = true; }, c => { c.fixture.issuerProjectId = 'other-project'; }, c => { delete process.env.FIREBASE_PROJECT_ID; }, c => { process.env.FIRESTORE_EMULATOR_HOST = 'synthetic-emulator.invalid:8080'; }]) {
    const c = config('openai', 'graphic'), project = process.env.FIREBASE_PROJECT_ID, emulator = process.env.FIRESTORE_EMULATOR_HOST;
    mutate(c);
    try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, []); }
    finally { if (project === undefined) delete process.env.FIREBASE_PROJECT_ID; else process.env.FIREBASE_PROJECT_ID = project; if (emulator === undefined) delete process.env.FIRESTORE_EMULATOR_HOST; else process.env.FIRESTORE_EMULATOR_HOST = emulator; }
  }
});
test('protected Studio issuer binds exact tenant, job, lane, provider, source, account and wire fingerprints', async () => {
  for (const [field, value] of [['trusted_readback', false], ['receipt', ''], ...['executor_repository', 'consumer', 'tenant_id', 'generation_job_id', 'lane', 'job_id', 'provider', 'model', 'asset', 'request_size', 'endpoint', 'request_sha256', 'executor_source_sha', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type', 'worker_token_sha256', 'gateway_url'].map(field => [field, 'SYNTHETIC-drift'])]) {
    const c = config('openai', 'graphic'); c.fixture.issuer[field] = value;
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, []);
  }
  const c = config('openai', 'graphic'); c.fixture.issuer.account_id = 'SYNTHETIC-other-account';
  await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']);
});
test('environment gateway origin drift is rejected before a worker credential leaves the server', async () => {
  const c = config('openai', 'graphic'), original = process.env.ASSET_FORGE_SPEND_GATEWAY_URL;
  process.env.ASSET_FORGE_SPEND_GATEWAY_URL = 'https://foreign.example.test/api/worker/production-spend';
  try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, []); }
  finally { process.env.ASSET_FORGE_SPEND_GATEWAY_URL = original; }
});
test('later gateway configuration drift cannot move the pinned worker token or reserved observation', async () => {
  const c = config('openai', 'graphic'), endpoint = process.env.ASSET_FORGE_SPEND_GATEWAY_URL, token = process.env.ASSET_FORGE_SPEND_WORKER_TOKEN;
  c.fixture.mutatePreflight = () => { process.env.ASSET_FORGE_SPEND_GATEWAY_URL = 'https://foreign.example.test/api/worker/production-spend'; process.env.ASSET_FORGE_SPEND_WORKER_TOKEN = 'SYNTHETIC-other-worker-token-with-length'; };
  try { await c.run(); assert.equal(c.counts().posts, 1); assert.deepEqual(c.fixture.calls, ['preflight', 'reserve', 'record']); }
  finally { process.env.ASSET_FORGE_SPEND_GATEWAY_URL = endpoint; process.env.ASSET_FORGE_SPEND_WORKER_TOKEN = token; }
});
test('issuer proof rejects future, malformed or expired observations before gateway transport', async () => {
  for (const [field, value] of [['observed_at', new Date(Date.now() + 60_000).toISOString()], ['expires_at', new Date(Date.now() - 1_000).toISOString()], ['expires_at', '2026-02-30T12:00:00Z'], ['expires_at', undefined]]) {
    const c = config('openai', 'graphic'); c.fixture.issuer[field] = value;
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, []);
  }
});
test('serialized verified approval must remain explicit, bounded, signed and tied to the exact job', async () => {
  const mutations = [e => { delete e.job.approval; }, ...[['status', 'OTHER'], ['kind', 'OTHER'], ['job_digest', 'f'.repeat(64)], ['max_usd_micros', 9_000_000], ['max_credits', 99], ['receipt', ''], ['approver', ''], ['key_id', ''], ['signature', ''], ['issued_at', new Date(Date.now() + 60_000).toISOString()], ['expires_at', new Date(Date.now() - 1_000).toISOString()], ['expires_at', '2026-02-30T12:00:00Z']].map(([field, value]) => e => { e.job.approval[field] = value; })];
  for (const mutate of mutations) { const c = config('openai', 'graphic'); c.fixture.mutatePreflight = mutate; await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, ['preflight']); }
});
test('a genuine serialized approval expiring during reserve cannot dispatch and retains its hold', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  const c = config('openai', 'graphic'); c.fixture.mutatePreflight = e => { assert.equal(e.job.approval.status, 'APPROVED'); assert.equal(e.job.approval.job_digest, protector.protectedJobDigest(e.job)); e.job.approval.expires_at = new Date(started + 1_000).toISOString(); };
  c.fixture.mutateReserve = () => { Date.now = () => started + 2_000; };
  try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed'); }
  finally { Date.now = originalNow; }
});
test('preflight requires a complete absolute deadline no later than every exposed verified proof', async () => {
  for (const value of [undefined, '2026-12-01', '2026-02-30T12:00:00Z', new Date(Date.now() - 1_000).toISOString(), new Date(Date.now() + 7_200_000).toISOString()]) {
    const c = config('openai', 'graphic'); c.fixture.mutatePrepared = p => { p.admission_expires_at = value; };
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, false); assert.deepEqual(c.fixture.calls, ['preflight']);
  }
});
test('reservation requires server time and an unexpanded absolute proof/runtime deadline', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  try {
    for (const mutate of [r => { delete r.reserved_at; }, r => { delete r.admission_expires_at; }, r => { r.reserved_at = new Date(started + 1_000).toISOString(); }, r => { r.admission_expires_at = new Date(started - 1_000).toISOString(); }, r => { r.admission_expires_at = '2026-02-30T12:00:00Z'; }, r => { r.admission_expires_at = new Date(started + 31_000).toISOString(); }, r => { r.admission_expires_at = r.reserved_at; }]) {
      const c = config('openai', 'graphic'); c.fixture.mutateReserve = mutate;
      await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed');
    }
    const c = config('openai', 'graphic'); c.fixture.mutatePrepared = p => { p.admission_expires_at = new Date(started + 10_000).toISOString(); }; c.fixture.mutateReserve = r => { r.admission_expires_at = new Date(started + 20_000).toISOString(); };
    await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true);
  } finally { Date.now = originalNow; }
});
test('a shorter canonical deadline covers hidden deployment proof expiry during reservation', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  const c = config('openai', 'graphic'); c.fixture.mutatePrepared = p => { p.admission_expires_at = new Date(started + 1_000).toISOString(); }; c.fixture.mutateReserve = () => { Date.now = () => started + 2_000; };
  try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed'); }
  finally { Date.now = originalNow; }
});
test('protected issuer expiry during reserve cannot dispatch or release the reservation', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  const c = config('openai', 'graphic'); c.fixture.issuer.expires_at = new Date(started + 1_000).toISOString(); c.fixture.mutateReserve = () => { Date.now = () => started + 2_000; };
  try { await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); }
  finally { Date.now = originalNow; }
});

test('source drift while the provider responds blocks final delivery and retains the admitted hold', async () => {
  const c = config('openai', 'graphic'), file = path.join(build.directory, 'assetfactory-studio/lib/server/firebaseAdmin.ts'), original = readFileSync(file); let posts = 0;
  globalThis.fetch = c.fixture.wrap(async () => { posts++; writeFileSync(file, Buffer.concat([original, Buffer.from('\n// synthetic issuer SDK source drift during provider response\n')])); return Response.json({ data: [{ b64_json: Buffer.from([1, 2, 3]).toString('base64') }] }); });
  try { await assert.rejects(c.run(), /source/); assert.equal(posts, 1); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed'); }
  finally { writeFileSync(file, original); }
});
test('canonical expiry remains active during provider response and final decoding', async () => {
  const originalNow = Date.now, started = originalNow(); Date.now = () => started;
  const c = config('openai', 'graphic'); let posts = 0;
  c.fixture.mutatePrepared = p => { p.admission_expires_at = new Date(started + 1_000).toISOString(); };
  globalThis.fetch = c.fixture.wrap(async () => { posts++; Date.now = () => started + 2_000; return Response.json({ data: [{ b64_json: Buffer.from([1, 2, 3]).toString('base64') }] }); });
  try { await assert.rejects(c.run()); assert.equal(posts, 1); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed'); }
  finally { Date.now = originalNow; }
});

for (const field of ['reserved_at', 'admission_expires_at']) test(`actual Studio leaf rejects missing absolute ${field} with the hold retained`, async () => {
  const c = config('openai', 'graphic'); c.fixture.mutateReserve = result => delete result[field];
  await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true);
});
test('actual Studio leaf cannot forward worker token to a changed gateway origin', async () => {
  const c = config('openai', 'graphic'); process.env.ASSET_FORGE_SPEND_GATEWAY_ORIGIN = 'https://foreign.example.test';
  await assert.rejects(c.run(), /issuer origin/); assert.equal(c.counts().posts, 0); assert.deepEqual(c.fixture.calls, []);
  process.env.ASSET_FORGE_SPEND_GATEWAY_ORIGIN = new URL(process.env.ASSET_FORGE_SPEND_GATEWAY_URL).origin;
});
test('actual Studio leaf rejects a reserved proof that expires before its response returns', async () => {
  const c = config('openai', 'graphic'); c.fixture.mutateReserve = result => { result.reserved_at = new Date(Date.now() - 2000).toISOString(); result.admission_expires_at = new Date(Date.now() - 1000).toISOString(); };
  await assert.rejects(c.run()); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true);
});

test('monotonic elapsed runtime cannot be reset by a slowly advancing or rolled-back wall clock', async () => {
  const originalNow = Date.now, started = originalNow(), descriptor = Object.getOwnPropertyDescriptor(performance, 'now'); let monotonic = 1_000;
  Date.now = () => started; Object.defineProperty(performance, 'now', { configurable: true, value: () => monotonic });
  const c = config('openai', 'graphic'); c.fixture.mutateReserve = () => { monotonic = 32_000; Date.now = () => started + 1_000; };
  try { await assert.rejects(c.run(), /deadline/); assert.equal(c.counts().posts, 0); assert.equal(c.fixture.held, true); assert.equal(c.fixture.observed[0].status, 'failed'); }
  finally { Date.now = originalNow; if (descriptor) Object.defineProperty(performance, 'now', descriptor); else delete performance.now; }
});
