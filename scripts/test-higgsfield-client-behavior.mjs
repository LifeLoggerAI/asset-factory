import { syntheticCleanBuild, syntheticStudioSpend } from './lib/studio-spend-test-fixture.mjs'
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const require = createRequire(new URL('../assetfactory-studio/package.json', import.meta.url))
const ts = require('typescript')
const scratch = mkdtempSync(path.join(tmpdir(), 'urai-higgsfield-offline-tests-'))
const compiled = path.join(scratch, 'client.mjs')
const protectedFile = path.join(scratch, 'protectedProviderRequest.mjs')
writeFileSync(protectedFile, ts.transpileModule(readFileSync(new URL('../assetfactory-studio/lib/server/protectedProviderRequest.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText)
writeFileSync(compiled, ts.transpileModule(readFileSync(new URL('../assetfactory-studio/lib/server/higgsfieldClient.ts', import.meta.url), 'utf8').replace("from './protectedProviderRequest';", "from './protectedProviderRequest.mjs';"), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText)
after(() => rmSync(scratch, { recursive: true, force: true }))
const { downloadHiggsfieldArtifact, higgsfieldArtifactUrl, runHiggsfieldGeneration } = await import(pathToFileURL(compiled).href)
const protector = await import(pathToFileURL(protectedFile).href)
const limits = { maxBytes: 8, timeoutMs: 1000 }
function policy(t) {
  const previous = process.env.ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS
  process.env.ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS = 'https://outputs.example.test'
  t.after(() => { if (previous === undefined) delete process.env.ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS; else process.env.ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS = previous })
}
function mock(t, fn) { const original = globalThis.fetch; globalThis.fetch = fn; t.after(() => { globalThis.fetch = original }) }
test('artifact origins fail closed for private, IPv6, credential and unapproved URLs', (t) => {
  policy(t)
  for (const url of ['http://127.0.0.1/a', 'https://[::1]/a', 'https://[::ffff:127.0.0.1]/a', 'https://localhost./a', 'https://user:pass@outputs.example.test/a', 'https://other.example.test/a']) {
    assert.throws(() => higgsfieldArtifactUrl({ image: { url } }, 'image'))
  }
  assert.equal(higgsfieldArtifactUrl({ image: { url: 'https://outputs.example.test/a' } }, 'image'), 'https://outputs.example.test/a')
  delete process.env.ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS
  assert.throws(() => higgsfieldArtifactUrl({ image: { url: 'https://outputs.example.test/a' } }, 'image'))
})
test('artifact fetch rejects redirects and retains exact bounded bytes', async (t) => {
  policy(t)
  mock(t, async (url, options) => { assert.equal(url, 'https://outputs.example.test/a'); assert.equal(options.redirect, 'error'); return new Response(new Uint8Array([1,2,3]), { headers: { 'content-type': 'image/png' } }) })
  const result = await downloadHiggsfieldArtifact('https://outputs.example.test/a', limits)
  assert.deepEqual([...result.buffer], [1,2,3])
  assert.equal(result.mimeType, 'image/png')
})
test('chunked artifact is cancelled before retaining bytes beyond the limit', async (t) => {
  policy(t)
  let canceled = false
  mock(t, async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(6)) }, cancel() { canceled = true } })))
  await assert.rejects(downloadHiggsfieldArtifact('https://outputs.example.test/a', limits), /while streaming/)
  assert.equal(canceled, true)
})
test('declared oversize cancels body and invalid budgets issue no request', async (t) => {
  policy(t)
  let calls = 0, canceled = false
  mock(t, async () => { calls++; return new Response(new ReadableStream({ cancel() { canceled = true } }), { headers: { 'content-length': '99' } }) })
  await assert.rejects(downloadHiggsfieldArtifact('https://outputs.example.test/a', limits), /exceeds max bytes/)
  assert.equal(canceled, true)
  await assert.rejects(downloadHiggsfieldArtifact('https://outputs.example.test/a', { maxBytes: -1, timeoutMs: 1 }), /Invalid/)
  assert.equal(calls, 1)
})
test('protected submit and polling reject redirects and API errors omit provider body', async (t) => {
  const keys = ['HIGGSFIELD_API_KEY_ID','HIGGSFIELD_API_KEY_SECRET','ASSET_FACTORY_HIGGSFIELD_POLL_MS']
  const previous = keys.map(key => process.env[key])
  process.env.HIGGSFIELD_API_KEY_ID = 'offline-fixture'
  process.env.HIGGSFIELD_API_KEY_SECRET = 'offline-fixture'
  process.env.ASSET_FACTORY_HIGGSFIELD_POLL_MS = '1'
  const build = syntheticCleanBuild()
  t.after(() => { build.restore(); keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] }) })
  const sourceInput = { jobId: 'offline-fixture', tenantId: 'synthetic', type: 'video', prompt: 'Synthetic non-private input' }
  function install(providerFetch) {
    const f = syntheticStudioSpend(sourceInput, { endpoint: 'https://api.higgsfield.ai/approved/model', provider: 'higgsfield', model: 'approved/model', lane: 'video', body: '{}', headers: { authorization: 'Key offline-fixture:offline-fixture', 'content-type': 'application/json', 'Idempotency-Key': 'offline-key' } }, protector)
    globalThis.fetch = f.wrap(providerFetch)
    return f
  }
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original })
  let calls = 0
  install(async (url, options) => {
    assert.equal(options.redirect, 'error')
    calls++
    return new Response(JSON.stringify(calls === 1 ? { request_id:'offline-fixture', status:'queued', status_url:'https://api.higgsfield.ai/requests/offline-fixture/status' } : { request_id:'offline-fixture', status:'completed' }))
  })
  assert.equal((await runHiggsfieldGeneration('approved/model', {}, 'offline-key', sourceInput)).status, 'completed')
  install(async () => new Response(JSON.stringify({ request_id: 'offline-fixture', status: 'queued', status_url: 'https://api.higgsfield.ai:8443/status' })))
  await assert.rejects(runHiggsfieldGeneration('approved/model', {}, 'offline-key', sourceInput), /escaped the approved API origin/)
  install(async () => new Response('private-provider-body', { status: 401 }))
  await assert.rejects(runHiggsfieldGeneration('approved/model', {}, 'offline-key', sourceInput), error => error.message === 'Higgsfield request failed 401')
})
