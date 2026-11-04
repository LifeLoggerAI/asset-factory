import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const load = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('legacy tenant-token issuer rejects every request without minting a JWT', () => {
  const source = load('assetfactory-studio/pages/api/get-token.js');
  assert.doesNotMatch(source, /jwt\.(sign|verify)\s*\(/);
  assert.doesNotMatch(source, /req\.body\.tenantId/);
  const sandbox = { module: { exports: null } };
  vm.runInNewContext(source.replace('export default function handler', 'module.exports = function handler'), sandbox);
  const handler = sandbox.module.exports;
  for (const method of ['GET', 'POST', 'PUT', 'OPTIONS']) {
    const headers = {};
    let responseStatus;
    let responseBody;
    const response = {
      setHeader(name, value) { headers[name] = value; return this; },
      status(code) { responseStatus = code; return this; },
      json(body) { responseBody = body; return this; },
    };
    handler({ method, body: { tenantId: 'other-tenant' } }, response);
    assert.equal(responseStatus, 410, `method ${method} must be disabled`);
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(typeof responseBody.error, 'string');
    assert.equal(responseBody.token, undefined);
  }
});

test('legacy JWT consumers require configured secrets and pin HS256', () => {
  for (const relativePath of ['engine/server.js', 'assetfactory-studio/lib/auth.ts']) {
    const source = load(relativePath);
    assert.doesNotMatch(source, /JWT_SECRET\s*=\s*process\.env\.JWT_SECRET\s*\|\|/);
    assert.match(source, /JWT_SECRET\.length\s*<\s*32|secret\.length\s*<\s*32/);
    assert.match(source, /algorithms:\s*\['HS256'\]/);
    assert.match(source, /change-me-local-only/);
    assert.match(source, /your-default-super-secret-key-that-is-long-and-secure/);
  }
});

test('legacy engine cannot start without an explicit strong JWT secret', () => {
  const source = load('engine/server.js');
  const declaration = source.match(/const JWT_SECRET = process\.env\.JWT_SECRET\?\.trim\(\);[\s\S]*?throw new Error\('Legacy API startup denied: a secure JWT_SECRET must be configured\.'\);\s*\}/);
  assert.ok(declaration, 'expected exact fail-closed startup guard');
  for (const candidate of [undefined, '', 'short', 'change-me-local-only', 'your-default-super-secret-key-that-is-long-and-secure']) {
    assert.throws(() => vm.runInNewContext(declaration[0], { process: { env: { JWT_SECRET: candidate } } }), /Legacy API startup denied/);
  }
  assert.doesNotThrow(() => vm.runInNewContext(declaration[0], { process: { env: { JWT_SECRET: 'a'.repeat(48) } } }));
});
