const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const regressionScript = path.join(root, 'scripts', 'test-legacy-token-fail-closed.mjs');

test('legacy tenant JWT hardening regression suite passes at the checked-out source', () => {
  // Run the canonical script as a child so npm --prefix engine test discovers
  // the test without relying on ESM loading in the legacy CommonJS engine.
  const run = spawnSync(process.execPath, ['--test', regressionScript], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, JWT_SECRET: '' },
  });
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.signal, null, `test runner terminated by ${run.signal}`);
  assert.equal(run.status, 0, `security regression test failure:\n${run.stdout}\n${run.stderr}`);
});
