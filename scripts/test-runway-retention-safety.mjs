import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const script = path.resolve('scripts/retain-existing-runway-tasks.mjs')
const workflow = fs.readFileSync('.github/workflows/home-runway-existing-task-retention.yml', 'utf8')
const items = Array.from({ length: 12 }, (_, i) => ({ id: `item_${i}`, role: i < 8 ? 'survey' : 'anchor', taskId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, expectedMedia: 'video' }))
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-retain-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const manifest = path.join(dir, 'manifest.json')
  fs.writeFileSync(manifest, JSON.stringify({ provider: 'runway', truthClass: 'interpretive', autobiographical: false, items }))
  const preload = path.join(dir, 'no-network.mjs')
  fs.writeFileSync(preload, `globalThis.fetch = async () => { throw new Error('NETWORK_MUST_NOT_RUN') }`)
  const run = output => spawnSync(process.execPath, ['--import', preload, script, manifest, output], { encoding: 'utf8', env: { ...process.env, RUNWAY_API_KEY: 'synthetic-test-key' } })
  return { dir, manifest, preload, run }
}
for (const kind of ['existing-evidence', 'source-directory', 'symlink', 'dangling-symlink']) {
  test(`retention preserves ${kind} before any provider call`, t => {
    const f = fixture(t)
    const retained = path.join(f.dir, 'retained')
    fs.mkdirSync(retained)
    const sentinel = path.join(retained, 'sentinel')
    fs.writeFileSync(sentinel, 'preserve-existing-bytes')
    let output = retained
    if (kind === 'source-directory') output = f.dir
    if (kind.includes('symlink')) {
      output = path.join(f.dir, 'output-link')
      fs.symlinkSync(kind === 'symlink' ? retained : path.join(f.dir, 'missing'), output)
    }
    const result = f.run(output)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /EEXIST/)
    assert.doesNotMatch(result.stderr, /NETWORK_MUST_NOT_RUN/)
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preserve-existing-bytes')
    assert.ok(fs.existsSync(f.manifest))
    if (kind.includes('symlink')) assert.ok(fs.lstatSync(output).isSymbolicLink())
  })
}
test('rejects unsafe or duplicate output identifiers before provider access', t => {
  const f = fixture(t)
  for (const id of ['../escape', items[1].id]) {
    fs.writeFileSync(f.manifest, JSON.stringify({ provider: 'runway', truthClass: 'interpretive', autobiographical: false, items: [{ ...items[0], id }, ...items.slice(1)] }))
    const result = f.run(path.join(f.dir, 'new-output'))
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /output identifier/)
    assert.doesNotMatch(result.stderr, /NETWORK_MUST_NOT_RUN/)
  }
})
test('fresh output retains all twelve synthetic tasks with matching hashes and GET-only calls', t => {
  const f = fixture(t)
  fs.writeFileSync(f.preload, `globalThis.fetch = async (url, options) => {
    if (options.method !== 'GET') throw new Error('Provider mutation forbidden')
    if (String(url).startsWith('https://api.dev.runwayml.com/v1/tasks/')) return Response.json({ id: String(url).split('/').at(-1), status: 'SUCCEEDED', output: ['https://synthetic.invalid/output.mp4'] })
    if (String(url) !== 'https://synthetic.invalid/output.mp4' || options.headers?.Authorization) throw new Error('Invalid media request')
    return new Response('synthetic-media-bytes', { headers: { 'content-type': 'video/mp4' } })
  }`)
  const output = path.join(f.dir, 'fresh')
  const result = f.run(output)
  assert.equal(result.status, 0, result.stderr)
  const receipt = JSON.parse(fs.readFileSync(path.join(output, 'retention-receipt.json')))
  assert.equal(receipt.items.length, 12)
  assert.equal(receipt.generationCallsExecuted, 0)
  assert.equal(receipt.providerMutationPerformed, false)
  assert.equal(receipt.outputUrlsRetained, false)
  for (const item of receipt.items) {
    assert.equal(fs.readFileSync(path.join(output, item.outputs[0].filename), 'utf8'), 'synthetic-media-bytes')
    assert.equal(item.outputs[0].sha256, crypto.createHash('sha256').update('synthetic-media-bytes').digest('hex'))
  }
})
function shellStep(name) {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0]
  assert.ok(step, name)
  return step.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n')
}
test('credential masking is emitted separately and never becomes credential bytes', t => {
  const f = fixture(t)
  const bin = path.join(f.dir, 'gcloud')
  fs.writeFileSync(bin, '#!/bin/sh\nif [ "$1 $2 $3" = "secrets versions access" ]; then printf synthetic-retention-key; else exit 2; fi\n', { mode: 0o700 })
  const envFile = path.join(f.dir, 'github-env')
  const result = spawnSync('bash', ['-c', shellStep('Load UrAi Runway credential from Secret Manager without exposing it')], { encoding: 'utf8', env: { ...process.env, PATH: `${f.dir}:${process.env.PATH}`, PROJECT_ID: 'synthetic-project', RUNNER_TEMP: f.dir, GOOGLE_APPLICATION_CREDENTIALS: f.manifest, GITHUB_ENV: envFile } })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(envFile, 'utf8'), 'RUNWAY_API_KEY=synthetic-retention-key\n')
  assert.equal(result.stdout.trim(), '::add-mask::synthetic-retention-key')
})
test('provider step handles absent ADC safely and rejects retained ADC', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.dir, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o700 })
  const env = { ...process.env, PATH: `${f.dir}:${process.env.PATH}`, RUNNER_TEMP: f.dir }
  delete env.GOOGLE_APPLICATION_CREDENTIALS
  const run = env => spawnSync('bash', ['-c', shellStep('Retain existing task bytes and immutable hashes')], { env, encoding: 'utf8' })
  assert.equal(run(env).status, 0)
  assert.notEqual(run({ ...env, GOOGLE_APPLICATION_CREDENTIALS: 'retained-credential-file' }).status, 0)
})
