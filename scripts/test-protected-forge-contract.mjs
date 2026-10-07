import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createWirePlan } from '../model_forge/create-wire-plan.mjs';
import { classifyRequest, wireInputDigest } from '../model_forge/protected-execution.mjs';

const source = fs.readFileSync(new URL('../model_forge/forge.mjs', import.meta.url), 'utf8');
function actualFunction(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `actual function ${name} exists`);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/\n(?:async )?function \w+\(/);
  return next >= 0 ? tail.slice(0, next + 1) : tail.slice(0, tail.indexOf('\nmain().catch'));
}
const spec = () => ({ id: 'fictional-asset', prompt: 'fictional-source-only', target: { pbr: true, maxTriangles: 100, textureResolution: '4k' }, generation: { seed: null, maxProviderAttempts: 1 } });

for (const provider of ['meshy', 'tripo', 'rodin', 'replicate']) {
  test(`actual ${provider} adapter creates exactly the independently approved wire plan`, async () => {
    const model = { meshy: 'meshy-7.1', tripo: 'v3.1-20260211', rodin: 'Gen-2.5-Medium', replicate: 'tencent/hunyuan-3d-3.1' }[provider];
    const input = spec(); const plan = createWirePlan(input, provider, model); let creates = 0;
    const context = vm.createContext({ URL, Buffer, FormData, Blob, fs, path, process: { env: {} }, TRIPO_STABLE_MODEL: 'v3.1-20260211', fail: (reason) => { throw new Error(reason); }, timeoutMs: () => 60_000, sleep: async () => {}, assertPublicHttpUrl: (v) => v,
      firstHttpUrl: (v) => typeof v === 'string' ? v : null,
      requestJson: async (url, init) => {
        if (classifyRequest(provider, url, init?.method ?? 'GET') === 'CREATE') {
          const expected = structuredClone(plan[creates]); assert.ok(expected);
          if (expected.taskBinding) expected.body.preview_task_id = 'task-1';
          assert.equal(url, expected.url);
          if (expected.bodyType === 'JSON') assert.equal(init.body, JSON.stringify(expected.body));
          else assert.equal(JSON.stringify([...init.body.entries()]), JSON.stringify(expected.body));
          creates++;
          return { payload: { result: `task-${creates}`, code: 0, data: { task_id: `task-${creates}` }, uuid: `task-${creates}`, jobs: { subscription_key: 'synthetic-key' }, id: `task-${creates}`, urls: { get: `https://api.replicate.com/v1/predictions/task-${creates}` }, status: 'succeeded', output: 'https://fictional-artifacts.invalid/a.glb' } };
        }
        return { payload: url.endsWith('/download') ? { list: [{ name: 'a.glb', url: 'https://fictional-artifacts.invalid/a.glb' }] } : { jobs: [{ status: 'Done' }] } };
      },
      pollJson: async () => ({ status: 'SUCCEEDED', model_urls: { glb: 'https://fictional-artifacts.invalid/a.glb' }, code: 0, data: { status: 'success', output: { pbr_model: 'https://fictional-artifacts.invalid/a.glb' } } }),
    });
    vm.runInContext(['assertTripoOk', 'mimeFor', 'replicateOfficialModel', 'generateMeshy', 'generateTripo', 'generateRodin', 'generateReplicate'].map(actualFunction).join('\n'), context);
    await context[`generate${provider[0].toUpperCase()}${provider.slice(1)}`](input);
    assert.equal(creates, plan.length);
  });
}

test('semantic input claims do not reset when only the asset label changes', () => {
  const context = vm.createContext({ crypto, Buffer, fs, path, process: { env: { REPLICATE_API_TOKEN: 'synthetic-test-only' } }, wireInputDigest, createWirePlan, executorDigest: () => 'a'.repeat(64), timeoutMs: () => 60_000, maxBytes: () => 1024 * 1024, TRIPO_STABLE_MODEL: 'v3.1-20260211', fail: (reason) => { throw new Error(reason); } });
  vm.runInContext(['requiredEnv', 'replicateOfficialModel', 'protectedRequest'].map(actualFunction).join('\n'), context);
  const a = context.protectedRequest(spec(), Buffer.from('synthetic-spec-a'), 'replicate');
  const b = context.protectedRequest({ ...spec(), id: 'renamed-only' }, Buffer.from('synthetic-spec-b'), 'replicate');
  assert.equal(a.inputDigest, b.inputDigest); assert.notEqual(a.specSha256, b.specSha256);
});

test('executor approval digest includes actual local acceptance dependencies', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-executor-digest-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const name of ['forge.mjs', 'protected-execution.mjs', 'triangle-budget.mjs', 'create-wire-plan.mjs']) {
    fs.copyFileSync(new URL(`../model_forge/${name}`, import.meta.url), path.join(temp, name));
  }
  const executor = await import(pathToFileURL(path.join(temp, 'protected-execution.mjs')));
  const before = executor.executorDigest();
  fs.appendFileSync(path.join(temp, 'triangle-budget.mjs'), '\n// isolated changed acceptance bytes\n');
  assert.notEqual(executor.executorDigest(), before);
});

function artifactContext(t, address = '8.8.8.8', chunks = [Buffer.from('synthetic-glb-bytes')]) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-pinned-artifact-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  let lookups = 0; let connections = 0;
  const answers = [{ address, family: address.includes(':') ? 6 : 4 }];
  const context = vm.createContext({ URL, Buffer, fs, path, crypto, fail: (reason) => { throw new Error(reason); }, maxBytes: () => 1024,
    activeExecution: { signal: new AbortController().signal, assertArtifactUrl: () => {} },
    dns: { lookup: async () => { lookups++; return answers; } },
    https: { get: (_url, options, callback) => {
      connections++; assert.equal(options.agent, false);
      options.lookup('fictional-artifacts.invalid', { all: true }, (error, resolved) => { assert.equal(error, null); assert.deepEqual(resolved, answers); });
      options.lookup('fictional-artifacts.invalid', {}, (error, resolved, family) => { assert.equal(error, null); assert.equal(resolved, address); assert.equal(family, answers[0].family); });
      const request = new EventEmitter();
      queueMicrotask(() => callback({ statusCode: 200, headers: {}, destroy() {}, async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; } }));
      return request;
    } },
  });
  vm.runInContext(['isPrivateIpv4', 'isPrivateIpv6', 'assertPublicHttpUrl', 'assertPublicResolvedUrl', 'downloadFile'].map(actualFunction).join('\n'), context);
  return { context, file: path.join(temp, 'candidate.glb'), lookups: () => lookups, connections: () => connections };
}

test('actual artifact TLS download uses the validated DNS answers exactly once', async (t) => {
  const f = artifactContext(t); const result = await f.context.downloadFile('https://fictional-artifacts.invalid/a.glb', f.file);
  assert.equal(result.bytes, 19); assert.equal(f.lookups(), 1); assert.equal(f.connections(), 1);
  assert.equal(fs.readFileSync(f.file, 'utf8'), 'synthetic-glb-bytes');
});

test('mapped loopback/metadata/private IPv6 addresses reject before TLS connection', async (t) => {
  for (const ip of ['::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:c0a8:101', '::ffff:127.0.0.1']) {
    const f = artifactContext(t, ip); await assert.rejects(f.context.downloadFile('https://fictional-artifacts.invalid/a.glb', f.file), /private IPv6/);
    assert.equal(f.connections(), 0); assert.equal(fs.existsSync(f.file), false);
  }
});

test('actual artifact stream enforces byte limit and removes partial output', async (t) => {
  const f = artifactContext(t, '8.8.8.8', [Buffer.alloc(1000), Buffer.alloc(25)]);
  await assert.rejects(f.context.downloadFile('https://fictional-artifacts.invalid/a.glb', f.file), /too large/);
  assert.equal(fs.existsSync(f.file), false);
});
