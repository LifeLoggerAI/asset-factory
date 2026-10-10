// Actual manual workflow leaf; synthetic guard/storage/transports, no real provider.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { retrievePublicArtifact } from '../model_forge/protected-artifact.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runProtectedReplicateSmoke } from './protected-replicate-model3d-smoke.mjs';
const API = 'https://api.replicate.com/v1/predictions', artifact = 'https://outputs.example.test/model.glb';
function glb(document = { asset: { version: '2.0' } }) {
  const content = Buffer.from(JSON.stringify(document)), padded = Buffer.alloc(Math.ceil(content.length / 4) * 4, 32); content.copy(padded);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(header.length + padded.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16); return Buffer.concat([header, padded]);
}
function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'urai-smoke-synthetic-'));
  const requestPath = path.join(directory, 'request.json'), outputPath = path.join(directory, 'output.glb'), statusPath = path.join(directory, 'status.json');
  fs.writeFileSync(requestPath, '{"version":"SYNTHETIC","input":{"prompt":"synthetic"}}');
  const calls = []; let expired = false, source = 'a'.repeat(40);
  const check = () => { if (expired) throw Error('SYNTHETIC admission deadline expired'); };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init }); assert.equal(init.redirect, 'error');
    if (url.endsWith('/cancel')) { assert.equal(init.method, 'POST'); return Response.json({ status: 'canceled' }); }
    if (url === API) {
      assert.equal(init.method, 'POST');
      if (options.lostSubmit) throw Error('SYNTHETIC uncertain charge');
      return Response.json({ id: 'SYNTHETIC_TASK', status: options.poll ? 'processing' : 'succeeded', urls: { get: options.badStatus || `${API}/SYNTHETIC_TASK` }, output: artifact });
    }
    if (url === `${API}/SYNTHETIC_TASK`) return Response.json({ id: 'SYNTHETIC_TASK', status: 'succeeded', output: artifact });
    assert.equal(url, artifact); assert.equal(init.method, 'GET');
    if (options.expireArtifact) expired = true;
    if (options.changeSource) source = 'b'.repeat(40);
    return new Response(options.artifactGlb ?? glb());
  };
  const spend = { artifactHosts: ['outputs.example.test'], records: [{ attempt_id: 'SYNTHETIC_ATTEMPT', reconciliation_required: true }], checkAdmission: check, remainingMs: value => { check(); return value; }, async submit(endpoint, init) { check(); return { payload: await (await fetchImpl(endpoint, { ...init, redirect: 'error' })).json() }; } };
  const retrieveArtifact = (url, settings) => retrievePublicArtifact(url, { ...settings, lookup: async () => [{ address: '1.1.1.1', family: 4 }], request: (target, options, callback) => {
    assert.equal(options.agent, false); const request = new EventEmitter();
    options.lookup(target.hostname, { all: false }, (error, address) => { assert.ifError(error); assert.equal(address, '1.1.1.1'); });
    Promise.resolve(fetchImpl(target.toString(), { method: 'GET', redirect: 'error', headers: options.headers, signal: options.signal })).then(async web => {
      const response = Readable.from([Buffer.from(await web.arrayBuffer())]); response.statusCode = web.status; response.headers = Object.fromEntries(web.headers); callback(response);
    }).catch(error => request.emit('error', error)); return request;
  } });
  const run = () => runProtectedReplicateSmoke({ requestPath, outputPath, statusPath, env: { MODEL_VERSION: 'SYNTHETIC-MODEL', REPLICATE_API_TOKEN: 'SYNTHETIC-KEY' }, fetchImpl, retrieveArtifact, sleep: async () => { if (options.expirePoll) expired = true; }, spendFactory: () => spend, sourceVerifier: () => source });
  return { run, calls, outputPath, statusPath, restore: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
test('actual manual smoke retains one protected create, exact task reads and an unreconciled output receipt', async () => {
  const t = fixture({ poll: true }); try {
    const result = await t.run(); assert.equal(result.charges_reconciled, false); assert.ok(fs.existsSync(t.outputPath));
    assert.deepEqual(t.calls.map(c => c.init.method), ['POST', 'GET', 'GET']); assert.equal(t.calls.filter(c => c.url === API).length, 1);
    const receipt = JSON.parse(fs.readFileSync(t.statusPath)); assert.equal(receipt.charges_reconciled, false); assert.equal(receipt.actual_spend_usd, null);
  } finally { t.restore(); }
});
for (const options of [{ expirePoll: true, poll: true }, { expireArtifact: true }, { changeSource: true }, { badStatus: 'https://attacker.invalid/task' }]) {
  test('actual smoke rejects expired/source-drift/foreign-task output and only cancels its exact created task', async () => {
    const t = fixture(options); try {
      await assert.rejects(t.run()); assert.equal(fs.existsSync(t.outputPath), false);
      assert.equal(t.calls.filter(c => c.url === API).length, 1);
      assert.equal(t.calls.at(-1).url, `${API}/SYNTHETIC_TASK/cancel`);
      assert.equal(t.calls.at(-1).init.method, 'POST');
    } finally { t.restore(); }
  });
}
test('a lost create response cannot trigger retry or cancellation of an unknown task', async () => {
  const t = fixture({ lostSubmit: true }); try { await assert.rejects(t.run(), /uncertain/); assert.equal(t.calls.length, 1); assert.equal(fs.existsSync(t.outputPath), false); } finally { t.restore(); }
});
for (const [kind, document] of [
  ['geometry sidecar', { asset: { version: '2.0' }, buffers: [{ byteLength: 36, uri: 'missing.bin' }] }],
  ['texture sidecar', { asset: { version: '2.0' }, images: [{ uri: 'missing.png' }] }],
  ['texture without bytes', { asset: { version: '2.0' }, images: [{}] }],
]) {
  test(`actual protected smoke refuses ${kind} without persisting an incomplete GLB`, async () => {
    const t=fixture({artifactGlb:glb(document)});
    try {
      await assert.rejects(t.run(),/embedded|image bufferView/i);
      assert.equal(fs.existsSync(t.outputPath),false);
      assert.equal(fs.existsSync(t.outputPath+'.pending'),false);
      assert.equal(fs.existsSync(t.statusPath),false);
      assert.equal(t.calls.filter(c=>c.url===API).length,1);
      assert.equal(t.calls.filter(c=>c.init.method==='GET').length,1);
      assert.equal(t.calls.at(-1).url,`${API}/SYNTHETIC_TASK/cancel`);
    } finally {t.restore();}
  });
}
test('the actual default client cannot turn a provider credential or manual marker into admission', async () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'urai-smoke-no-authority-')); try {
    const requestPath = path.join(directory, 'request.json'); fs.writeFileSync(requestPath, '{"input":{"prompt":"synthetic"}}'); let calls = 0;
    await assert.rejects(runProtectedReplicateSmoke({ requestPath, outputPath: path.join(directory, 'out.glb'), statusPath: path.join(directory, 'status.json'), env: { MODEL_VERSION: 'SYNTHETIC', REPLICATE_API_TOKEN: 'SYNTHETIC', URAI_MODEL_FORGE_SPEND_AUTHORIZED: '1' }, fetchImpl: async () => { calls++; throw Error('Provider transport must never run'); }, sourceVerifier: () => 'a'.repeat(40) }), /MODEL_SPEND_BLOCKED/);
    assert.equal(calls, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
