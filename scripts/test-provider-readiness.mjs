import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./provider-readiness.mjs', import.meta.url));
const keys = ['FIREBASE_PROJECT_ID', 'URAI_IMAGE_PROVIDER', 'URAI_IMAGE_API_KEY',
  'URAI_SPATIAL_ASSET_BASE_URL', 'URAI_STUDIO_BASE_URL', 'URAI_PROVIDER_STRICT'];
const cleanEnv = { ...process.env };
for (const key of keys) delete cleanEnv[key];

const valid = {
  FIREBASE_PROJECT_ID: 'urai-asset-factory',
  URAI_IMAGE_PROVIDER: 'fal',
  URAI_IMAGE_API_KEY: 'private-provider-canary-sentinel',
  URAI_SPATIAL_ASSET_BASE_URL: 'https://urai.app/assets',
  URAI_STUDIO_BASE_URL: 'https://uraistudio.com',
};
let executions = 0;
function run(overrides = {}) {
  executions += 1;
  const result = spawnSync(process.execPath, [script], {
    env: { ...cleanEnv, ...overrides }, encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'configuration check must terminate');
  return { ...result, payload: JSON.parse(result.stdout) };
}

const unconfigured = run();
assert.equal(unconfigured.status, 0);
assert.equal(unconfigured.payload.notConfigured.length, 4);
assert.equal(unconfigured.payload.configurationReady, false);
const missingStrict = run({ URAI_PROVIDER_STRICT: 'true' });
assert.equal(missingStrict.status, 1);
assert.equal(missingStrict.payload.blocked.length, 4);

const configured = run({ ...valid, URAI_PROVIDER_STRICT: 'true' });
assert.equal(configured.status, 0);
assert.equal(configured.payload.configurationReady, true);
assert.equal(configured.payload.configured.length, 4);
assert.equal(configured.payload.evidenceScope, 'configuration-only');
assert.deepEqual(configured.payload.ready, []);
assert.equal(configured.payload.providerRuntimeVerified, false);
assert.equal(configured.payload.productionTargetVerified, false);
assert.equal(configured.payload.releaseReady, false);
assert.ok(configured.payload.providers.every((row) => row.status === 'configured' && row.runtimeVerified === false));
assert.ok(!configured.stdout.includes(valid.URAI_IMAGE_API_KEY), 'diagnostics must never echo credentials');

const whitespace = run({ ...valid, URAI_PROVIDER_STRICT: 'true', URAI_IMAGE_API_KEY: '   ' });
assert.equal(whitespace.status, 1);
assert.deepEqual(whitespace.payload.blocked[0].missing, ['URAI_IMAGE_API_KEY']);

for (const id of ['abc', 'UPPERCASE-PROJECT', 'invalid/project', 'project with spaces']) {
  const rejected = run({ ...valid, URAI_PROVIDER_STRICT: 'true', FIREBASE_PROJECT_ID: id });
  assert.equal(rejected.status, 1, 'malformed project ID cannot pass configuration');
  assert.equal(rejected.payload.blocked[0].invalid[0].key, 'FIREBASE_PROJECT_ID');
}

for (const key of ['URAI_SPATIAL_ASSET_BASE_URL', 'URAI_STUDIO_BASE_URL']) {
  for (const endpoint of [
    'not-a-url', 'http://urai.app', 'https://localhost', 'https://127.0.0.1',
    'https://[::1]', 'https://private.internal', 'https://example.com',
    'https://user:secret@urai.app', 'https://urai.app?token=secret', 'https://urai.app#secret',
  ]) {
    const rejected = run({ ...valid, URAI_PROVIDER_STRICT: 'true', [key]: endpoint });
    assert.equal(rejected.status, 1, 'unsafe endpoint must fail: ' + key);
    assert.equal(rejected.payload.blocked[0].invalid[0].key, key);
    assert.ok(!rejected.stdout.includes(endpoint), 'invalid endpoint values are not retained');
  }
}
const invalidOptional = run({ ...valid, URAI_STUDIO_BASE_URL: 'http://uraistudio.com' });
assert.equal(invalidOptional.status, 0);
assert.equal(invalidOptional.payload.invalidConfiguration.length, 1);
assert.equal(invalidOptional.payload.configurationReady, false);

for (const identity of ['local-proof', 'offline', 'deterministic', 'fallback', 'mock', 'test', 'placeholder', 'Unnamed Provider']) {
  const rejected = run({ ...valid, URAI_PROVIDER_STRICT: 'true', URAI_IMAGE_PROVIDER: identity });
  assert.equal(rejected.status, 1, 'local/unnamed image identity must fail external configuration');
  assert.equal(rejected.payload.blocked[0].invalid[0].key, 'URAI_IMAGE_PROVIDER');
}

console.log('provider configuration regression passed (' + executions + ' bounded CLI executions)');
