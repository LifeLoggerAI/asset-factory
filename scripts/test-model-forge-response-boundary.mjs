import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = fs.readFileSync(path.join(root, 'model_forge/forge.mjs'), 'utf8');
const section = (first, last) => source.slice(source.indexOf(first), source.indexOf(last, source.indexOf(first)));
const actual = section('async function requestJson(', '\nfunction assertTripoOk');
const syntheticURL = 'https://api.replicate.com/v1/predictions/synthetic?private=synthetic-secret';
const fail = message => { throw Error(message); };
function fixture(fetcher, { timeout = 1000, spend = null, retry = 0, sleep = async () => {} } = {}) {
  const calls = [];
  const context = vm.createContext({
    AbortSignal, TextDecoder, Uint8Array, fail, sleep, timeoutMs: () => timeout,
    retryAfterMs: response => Number(response.headers.get('retry-after') || 0),
    fetch: async (url, init) => { calls.push({ url, init }); return fetcher(url, init, calls.length); },
  });
  vm.runInContext(actual, context);
  return { calls, request: (init = {}, retries = retry, override = spend, readOnly = false) => context.requestJson(syntheticURL, init, retries, override, 'synthetic/model', readOnly) };
}
function stream(chunks, { pending = false, headers = {}, status = 200 } = {}) {
  let cancelled = 0, pulls = 0;
  const body = new ReadableStream({
    pull(controller) {
      pulls++;
      if (chunks.length) controller.enqueue(chunks.shift());
      else if (!pending) controller.close();
    },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 });
  return { response: new Response(body, { status, headers }), cancelled: () => cancelled, pulls: () => pulls, body };
}
const bytes = value => new TextEncoder().encode(value);

test('actual Forge read-only request accepts streamed object JSON and never invokes response.text()', async () => {
  const f = fixture(() => { const response = new Response('{"status":"succeeded","output":null}'); response.text = () => { throw Error('unbounded text reader forbidden'); }; return response; });
  assert.equal((await f.request()).payload.status, 'succeeded');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].init.redirect, 'error');
});
test('actual Forge allows empty object and bodyless HEAD without accepting a missing GET body', async () => {
  const f = fixture((_url, init) => init.method === 'HEAD' ? new Response(null) : new Response(''));
  assert.equal(Object.keys((await f.request()).payload).length, 0);
  assert.equal(Object.keys((await f.request({ method: 'HEAD' })).payload).length, 0);
  await assert.rejects(fixture(() => new Response(null)).request(), /no readable body/);
});
for (const declaration of ['65537', '999999999999999999999', '-1', 'NaN', '01']) {
  test('actual Forge rejects invalid or oversized declared metadata length ' + declaration, async () => {
    const s = stream([bytes('{}')], { headers: { 'content-length': declaration } });
    await assert.rejects(fixture(() => s.response).request(), /byte bound/);
    assert.equal(s.cancelled(), 1); assert.equal(s.pulls(), 0); assert.equal(s.body.locked, false);
  });
}
for (const headers of [{}, { 'content-length': '2' }]) {
  test('actual Forge counts bytes and cancels oversized chunked response regardless of declaration ' + JSON.stringify(headers), async () => {
    const s = stream([bytes('{"value":"'), new Uint8Array(65536), bytes('"}')], { headers });
    await assert.rejects(fixture(() => s.response).request(), /byte bound/);
    assert.equal(s.cancelled(), 1); assert.equal(s.pulls(), 2); assert.equal(s.body.locked, false);
  });
}
test('actual Forge accepts the exact 65536-byte metadata bound and releases the reader', async () => {
  const s = stream([bytes(JSON.stringify({ x: 'a'.repeat(65528) }))]);
  assert.equal((await fixture(() => s.response).request()).payload.x.length, 65528);
  assert.equal(s.body.locked, false); assert.equal(s.cancelled(), 0);
});
for (const payload of ['secret-not-json', 'null', '[]', '"secret"', '42', 'true', '{"n":1e999}']) {
  test('actual Forge rejects non-object or malformed/unsafe JSON without retaining raw input ' + payload.slice(0, 12), async () => {
    try { await fixture(() => new Response(payload)).request(); assert.fail('must reject'); }
    catch (error) { assert.match(error.message, /JSON|object|non-finite/); assert.equal(error.message.includes('secret'), false); }
  });
}
test('actual Forge rejects invalid UTF-8 bytes', async () => {
  const s = stream([new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125])]);
  await assert.rejects(fixture(() => s.response).request(), /valid UTF-8/);
  assert.equal(s.cancelled(), 1); assert.equal(s.body.locked, false);
});
test('actual Forge rejects non-byte chunks and releases the reader', async () => {
  const s = stream(['synthetic-private-text']);
  await assert.rejects(fixture(() => s.response).request(), /byte stream/);
  assert.equal(s.cancelled(), 1); assert.equal(s.body.locked, false);
});
for (const payload of [{ x: JSON.parse('['.repeat(65) + '0' + ']'.repeat(65)) }, { x: Array(4096).fill(null) }]) {
  test('actual Forge bounds JSON depth/node work before consumer traversal', async () => {
    await assert.rejects(fixture(() => new Response(JSON.stringify(payload))).request(), /structural bounds/);
  });
}
test('actual Forge redacts private URL, provider body, logs, and token from HTTP errors', async () => {
  const f = fixture(() => new Response('{"error":"synthetic-secret","logs":"synthetic-private"}', { status: 403 }));
  await assert.rejects(f.request(), error => error.message === 'Provider metadata HTTP request failed');
  assert.equal(f.calls.length, 1);
});
for (const fetcher of [() => { throw Error('synthetic-secret signed URL'); }, async () => { throw Error('synthetic-secret auth token'); }]) {
  test('actual Forge redacts sync and async transport failures while preserving redirect:error', async () => {
    const f = fixture(fetcher);
    await assert.rejects(f.request(), error => error.message === 'Provider metadata transport failed or redirect rejected');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].init.redirect, 'error');
  });
}
test('actual Forge metadata timeout covers a stalled fetch', async t => {
  const keepAlive = setInterval(() => {}, 100); t.after(() => clearInterval(keepAlive));
  const f = fixture(() => new Promise(() => {}), { timeout: 25 });
  await assert.rejects(f.request(), /deadline exceeded/); assert.equal(f.calls.length, 1);
});
test('actual Forge metadata timeout covers stalled body after headers and cancels/releases its reader', async t => {
  const keepAlive = setInterval(() => {}, 100); t.after(() => clearInterval(keepAlive));
  const s = stream([bytes('{"secret":"')], { pending: true });
  const f = fixture(() => s.response, { timeout: 25 });
  await assert.rejects(f.request(), /deadline exceeded/);
  assert.equal(s.cancelled(), 1); assert.equal(s.body.locked, false); assert.equal(f.calls.length, 1);
});
test('actual Forge metadata timeout does not await a hanging cancellation', async t => {
  const keepAlive = setInterval(() => {}, 100); t.after(() => clearInterval(keepAlive));
  let cancelled = 0, released = 0;
  const f = fixture(() => ({ status: 200, ok: true, headers: new Headers(), body: { getReader: () => ({
    read: () => new Promise(() => {}),
    cancel: () => { cancelled++; return new Promise(() => {}); },
    releaseLock: () => { released++; },
  }) } }), { timeout: 25 });
  await assert.rejects(f.request(), /deadline exceeded/);
  assert.equal(cancelled, 1); assert.equal(released, 1);
});
test('actual Forge rechecks revoked admission after fetch before retaining body data', async () => {
  let admitted = true;
  const s = stream([bytes('{"private":"synthetic-secret"}')]);
  const spend = { remainingMs: value => value, checkAdmission: () => { if (!admitted) throw Error('synthetic revoked admission'); } };
  const f = fixture(() => { admitted = false; return s.response; }, { spend });
  await assert.rejects(f.request(), /revoked admission/);
  assert.equal(s.pulls(), 0); assert.equal(f.calls.length, 1);
});
test('actual Forge revocation during body read cancels/releases and cannot deliver a result', async () => {
  let admitted = true, pulls = 0, cancelled = 0;
  const body = new ReadableStream({ pull(c) { pulls++; admitted = false; c.enqueue(bytes('{"ok":true}')); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  const spend = { remainingMs: value => value, checkAdmission: () => { if (!admitted) throw Error('synthetic revoked admission'); } };
  await assert.rejects(fixture(() => new Response(body), { spend }).request(), /revoked admission/);
  assert.equal(pulls, 1); assert.equal(cancelled, 1); assert.equal(body.locked, false);
});
for (const count of [-1, 5, 1.5, Infinity, NaN]) {
  test('actual Forge rejects an invalid read-only retry count ' + count + ' before fetch', async () => {
    const f = fixture(() => new Response('{}'));
    await assert.rejects(f.request({}, count), /bounded to 0-4/); assert.equal(f.calls.length, 0);
  });
}
for (const delay of ['30001', 'Infinity', '-1', 'NaN']) {
  test('actual Forge refuses an unbounded or invalid retry delay ' + delay, async () => {
    let sleepCalls = 0; const f = fixture(() => new Response('{}', { status: 429, headers: { 'retry-after': delay } }), { retry: 4, sleep: async () => { sleepCalls++; } });
    await assert.rejects(f.request(), /retry exceeds/);
    assert.equal(f.calls.length, 1); assert.equal(sleepCalls, 0);
  });
}
test('actual Forge never sleeps beyond its existing admission deadline', async () => {
  const f = fixture(() => new Response('{}', { status: 429, headers: { 'retry-after': '999' } }), { timeout: 20, retry: 4 });
  await assert.rejects(f.request(), /retry exceeds/); assert.equal(f.calls.length, 1);
});
test('actual Forge bounded GET retry preserves read-only behavior and no more than five requests', async () => {
  let paid = 0; const f = fixture(() => new Response('{}', { status: 429 }), { retry: 4, spend: { checkAdmission() {}, remainingMs: n => n, submit() { paid++; } } });
  await assert.rejects(f.request(), /HTTP request failed/); assert.equal(f.calls.length, 5); assert.equal(paid, 0);
});
test('actual Forge keeps billable POST on the canonical executor exactly once without local metadata fallback', async () => {
  let paid = 0;
  const f = fixture(() => { assert.fail('local fetch forbidden'); });
  const result = await f.request({ method: 'POST', body: '{}' }, 4, { submit: async (_url, _init, model) => { paid++; assert.equal(model, 'synthetic/model'); return { payload: { id: 'synthetic' } }; } });
  assert.equal(result.payload.id, 'synthetic'); assert.equal(paid, 1); assert.equal(f.calls.length, 0);
});
test('actual Forge failure summary drops every provider supplied identity/log/error/model field', () => {
  const context = vm.createContext({});
  vm.runInContext(section('function providerFailureSummary(', '\nasync function pollJson'), context);
  const result = context.providerFailureSummary({ status: 'failed', id: 'synthetic-secret', error: 'synthetic-secret', logs: 'synthetic-secret', metrics: { key: 'synthetic-secret' }, model: 'synthetic-secret', version: 'synthetic-secret' });
  assert.equal(result, '{"status":"failed"}');
  assert.equal(context.providerFailureSummary({ status: 'synthetic-secret' }), '{"status":"failed"}');
});
test('actual Forge persistent/CLI failure policy retains fixed rejection authority and drops arbitrary error content', () => {
  const context = vm.createContext({});
  vm.runInContext(section('function safeFailureMessage(', '\nfunction parseArgs'), context);
  for (const value of ['synthetic-secret', Error('synthetic-secret'), { message: 'synthetic-secret' }]) assert.equal(context.safeFailureMessage(value).includes('synthetic-secret'), false);
  assert.equal(vm.runInContext("safeFailureMessage(new Error('MODEL_SPEND_BLOCKED: immutable executor source SHA required'))", context), 'MODEL_SPEND_BLOCKED: immutable executor source SHA required');
  assert.match(source, /error: safeFailureMessage\(error\)/);
  assert.match(source, /URAI_MODEL_FORGE_ERROR=\$\{safeFailureMessage\(error\)\}/);
});
