const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
const bootEnd = source.indexOf("require('dotenv').config();");
assert.ok(bootEnd > 0, 'admission guard must run BEFORE any external dependency loads');
const bootGuard = source.slice(0, bootEnd);
const startError = /Legacy V4 API is disabled by default/;
const probe = (env) => vm.runInNewContext(bootGuard, { process: { env }, Error });

for (const [description, env] of [
  ['no opt-in', {}],
  ['default Node development', { ASSET_FACTORY_ENABLE_LEGACY_V4_SERVER: 'true' }],
  ['production even with opt-in', { ASSET_FACTORY_ENABLE_LEGACY_V4_SERVER: 'true', NODE_ENV: 'production' }],
  ['staging even with opt-in', { ASSET_FACTORY_ENABLE_LEGACY_V4_SERVER: 'true', NODE_ENV: 'staging' }],
  ['development with false opt-in', { ASSET_FACTORY_ENABLE_LEGACY_V4_SERVER: 'false', NODE_ENV: 'development' }],
  ['test with absent opt-in', { NODE_ENV: 'test' }],
]) {
  test('legacy V4 startup denies ' + description, () => assert.throws(() => probe(env), startError));
}

for (const env of [
  { NODE_ENV: 'development', ASSET_FACTORY_ENABLE_LEGACY_V4_SERVER: 'true' },
  { NODE_ENV: 'test', ASSET_FACTORY_ENABLE_LEGACY_V4_SERVER: 'true' },
]) {
  test('legacy V4 startup admits explicit local opt-in ' + env.NODE_ENV, () => {
    assert.doesNotThrow(() => probe(env));
  });
}

test('legacy V4 listener is loopback-only even when explicitly admitted', () => {
  assert.match(source, /const LEGACY_V4_BIND_HOST = '127\.0\.0\.1';/);
  assert.match(source, /app\.listen\(PORT, LEGACY_V4_BIND_HOST,/);
  assert.doesNotMatch(source, /app\.listen\(PORT,\s*\(\)/);
});
