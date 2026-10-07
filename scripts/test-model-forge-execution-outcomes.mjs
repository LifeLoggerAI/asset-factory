import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-forge-outcomes-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, 'model_forge'));
  for (const file of ['forge.mjs', 'run-wave.mjs', 'provider-preflight.mjs', 'triangle-budget.mjs']) {
    fs.copyFileSync(path.join(root, 'model_forge', file), path.join(cwd, 'model_forge', file));
  }
  fs.writeFileSync(path.join(cwd, 'no-network.mjs'), `
    globalThis.fetch = async () => { throw new Error('synthetic provider failure; no network attempted'); };
  `);
  const spec = {
    id: 'execution-outcome-fixture', prompt: 'Synthetic contract fixture',
    providers: ['replicate'], generation: { maxProviderAttempts: 1 },
    target: { meters: 1, maxTriangles: 100, pbr: true },
  };
  fs.writeFileSync(path.join(cwd, 'spec.json'), JSON.stringify(spec));
  const wave = {
    schemaVersion: 'urai-model-forge-wave-v1', id: 'execution-outcome-fixture',
    maxCandidateGenerations: 1,
    entries: [{ spec: 'spec.json', providers: ['replicate'], maxAttemptsPerProvider: 1 }],
  };
  fs.writeFileSync(path.join(cwd, 'wave.json'), JSON.stringify(wave));
  const run = (file, args, credential = false) => spawnSync(process.execPath, [file, ...args], {
    cwd, encoding: 'utf8', timeout: 10000,
    // No inherited provider keys. Every fetch in this process and children is intercepted.
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: `--import=${path.join(cwd, 'no-network.mjs')}`,
      URAI_MODEL_FORGE_SPEND_AUTHORIZED: '1',
      ...(credential ? { REPLICATE_API_TOKEN: 'synthetic-test-only' } : {}),
    },
  });
  return { cwd, run, wave };
}

test('forge reports missing credentials as failure and retains its receipt', (t) => {
  const { cwd, run } = fixture(t);
  const result = run('model_forge/forge.mjs', ['--spec', 'spec.json']);
  assert.equal(result.status, 1, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.completedCandidates, 0);
  assert.equal(receipt.providers[0].status, 'skipped-missing-credential');
  const runs = path.join(cwd, 'model_forge/runs/execution-outcome-fixture');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runs, fs.readdirSync(runs)[0], 'run-receipt.json'))), receipt);
});

test('forge exits nonzero after provider failure rather than certifying an empty run', (t) => {
  const { run } = fixture(t);
  const result = run('model_forge/forge.mjs', ['--spec', 'spec.json'], true);
  assert.equal(result.status, 1, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.providers[0].status, 'failed');
  assert.match(receipt.providers[0].attempts[0].error, /no network attempted/);
});

for (const credential of [false, true]) {
  test(`wave cannot report completion for ${credential ? 'failed' : 'missing'} provider`, (t) => {
    const { cwd, run } = fixture(t);
    const result = run('model_forge/run-wave.mjs', ['--wave', 'wave.json', '--execute'], credential);
    assert.equal(result.status, 1, result.stderr);
    const receipt = JSON.parse(fs.readFileSync(path.join(cwd, 'model-forge-wave-receipt.json')));
    assert.equal(receipt.status, 'incomplete');
    assert.equal(receipt.entries[0].status, credential ? 'failed' : 'blocked-missing-credential');
  });
}

test('dry-run remains successful without credentials or calls', (t) => {
  const { run } = fixture(t);
  const result = run('model_forge/run-wave.mjs', ['--wave', 'wave.json']);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, 'planned');
  assert.equal(receipt.execute, false);
});

test('empty waves cannot pass vacuous completion', (t) => {
  const { cwd, run, wave } = fixture(t);
  fs.writeFileSync(path.join(cwd, 'wave.json'), JSON.stringify({ ...wave, entries: [] }));
  const result = run('model_forge/run-wave.mjs', ['--wave', 'wave.json', '--execute']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /at least one entry/);
  assert.equal(fs.existsSync(path.join(cwd, 'model-forge-wave-receipt.json')), false);
});
