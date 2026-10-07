// Actual DNS/socket policy, synthetic transport. No external requests or credentials.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { publicArtifactAddress, retrievePublicArtifact } from '../model_forge/protected-artifact.mjs';

function fixture(options = {}) {
  const state = { lookups: 0, requests: 0, checks: 0, socketAddress: null };
  const transport = {
    hosts: ['outputs.example.test'], maxBytes: 8, checkAdmission() { state.checks++; options.check?.(state); },
    lookup: async (host, init) => { state.lookups++; assert.equal(host, 'outputs.example.test'); assert.equal(init.all, true); return options.addresses || [{ address: '1.1.1.1', family: 4 }]; },
    request: (url, init, callback) => {
      state.requests++; assert.equal(url.hostname, 'outputs.example.test'); assert.equal(url.protocol, 'https:'); assert.equal(init.agent, false);
      assert.equal(Object.keys(init.headers).some(key => /authorization|api.?key/i.test(key)), false);
      init.lookup(url.hostname, { all: false }, (error, address, family) => { assert.ifError(error); state.socketAddress = { address, family }; });
      const emitter = new EventEmitter(), response = Readable.from(options.chunks || [Buffer.from('abc')]);
      response.statusCode = options.status || 200; response.headers = options.headers || { 'content-type': 'model/gltf-binary' };
      queueMicrotask(() => callback(response)); return emitter;
    },
  };
  return { state, read: (url = 'https://outputs.example.test/artifact') => retrievePublicArtifact(url, transport) };
}
test('one DNS answer pins the socket while retaining the original HTTPS certificate host', async () => {
  const f = fixture(), result = await f.read(); assert.equal(result.buffer.toString(), 'abc');
  assert.equal(f.state.lookups, 1); assert.equal(f.state.requests, 1); assert.deepEqual(f.state.socketAddress, { address: '1.1.1.1', family: 4 });
  assert.equal(result.contentType, 'model/gltf-binary');
});
for (const url of ['http://outputs.example.test/a', 'https://foreign.example.test/a', 'https://user:pw@outputs.example.test/a', 'https://outputs.example.test:444/a', 'https://outputs.example.test/a#other']) test(`artifact origin blocked before DNS: ${url}`, async () => {
  const f = fixture(); await assert.rejects(f.read(url), /ARTIFACT_BLOCKED/); assert.equal(f.state.lookups, 0); assert.equal(f.state.requests, 0);
});
for (const address of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '2001:db8::1', '2001:2::1', '2001:0002::1', '3fff::1', '3fff:fff::1', '3fff:0001::1', '2002:7f00:1::1']) test(`all DNS addresses must be global public unicast: ${address}`, async () => {
  const family = address.includes(':') ? 6 : 4, f = fixture({ addresses: [{ address: '1.1.1.1', family: 4 }, { address, family }] });
  assert.equal(publicArtifactAddress(address, family), false); await assert.rejects(f.read(), /nonpublic/); assert.equal(f.state.requests, 0);
});
for (const status of [206, 301, 302, 307, 308, 404]) test(`artifact HTTP ${status} never follows a redirect or accepts a partial body`, async () => {
  const f = fixture({ status }); await assert.rejects(f.read(), /HTTP 200/); assert.equal(f.state.requests, 1);
});
test('declared, streamed, empty and stale artifacts all reject within one request', async () => {
  for (const options of [{ headers: { 'content-length': '9' } }, { chunks: [Buffer.from('123456789')] }, { chunks: [] }, { check: s => { if (s.checks >= 4) throw new Error('synthetic admission expired'); } }]) {
    const f = fixture(options); await assert.rejects(f.read()); assert.equal(f.state.requests, 1);
  }
});
test('DNS cannot outlive an already aborted protected admission or start a socket later', async () => {
  const controller = new AbortController(); let calls = 0;
  const reading = retrievePublicArtifact('https://outputs.example.test/a', { hosts: ['outputs.example.test'], timeoutMs: 1000, signal: controller.signal, checkAdmission() {}, lookup: () => new Promise(() => {}), request: () => { calls++; throw new Error('must not dispatch'); } });
  controller.abort(); await assert.rejects(reading, /DNS exceeded/); assert.equal(calls, 0);
});
