const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Test the actual legacy V4 auth middleware without starting a server or
// touching Firebase. jwt.verify is deliberately stubbed; this validates
// decoded-claims handling, NOT cryptographic signature validation.
const source = readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf('async function authenticateAndAuthorize(req, res, next) {');
const end = source.indexOf('// --- EXPRESS APP ---', start);
assert.ok(start !== -1 && end > start, 'legacy authorization function must be identifiable');
const definition = source.slice(start, end);

function invokeMiddleware(decoded, failure) {
  class TokenExpiredError extends Error {}
  class JsonWebTokenError extends Error {}
  const jwt = {
    TokenExpiredError,
    JsonWebTokenError,
    verify() {
      if (failure === 'expired') throw new TokenExpiredError('expired');
      if (failure === 'invalid') throw new JsonWebTokenError('invalid');
      return decoded;
    },
  };
  const middleware = vm.runInNewContext(
    `${definition}\nauthenticateAndAuthorize`,
    { jwt, JWT_SECRET: 'dummy-local-test-only', console: { log() {}, error() {} } },
  );
  return async (authorization) => {
    let nextCalled = false;
    const res = {
      statusCode: undefined,
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    const req = { get() { return authorization; } };
    await middleware(req, res, () => { nextCalled = true; });
    return { code: res.statusCode, nextCalled, tenantId: req.tenantId };
  };
}

for (const [label, payload] of [
  ['null', null],
  ['undefined', undefined],
  ['string', 'forged-tenant'],
  ['empty object', {}],
  ['blank tenant', { tenantId: '  ' }],
  ['non-string tenant', { tenantId: 123 }],
]) {
  test(`legacy JWT decoded ${label} cannot authorize a tenant`, async () => {
    const result = await invokeMiddleware(payload)('Bearer local-stub');
    assert.equal(result.code, 403);
    assert.equal(result.nextCalled, false);
    assert.equal(result.tenantId, undefined);
  });
}

test('missing authorization header is denied', async () => {
  const result = await invokeMiddleware({ tenantId: 'tenant-a' })(undefined);
  assert.equal(result.code, 401);
  assert.equal(result.nextCalled, false);
});

test('non-Bearer authorization header is denied', async () => {
  const result = await invokeMiddleware({ tenantId: 'tenant-a' })('Basic local-stub');
  assert.equal(result.code, 401);
  assert.equal(result.nextCalled, false);
});

test('expired legacy JWT is denied', async () => {
  const result = await invokeMiddleware(null, 'expired')('Bearer local-stub');
  assert.equal(result.code, 401);
  assert.equal(result.nextCalled, false);
});

test('invalid legacy JWT is denied', async () => {
  const result = await invokeMiddleware(null, 'invalid')('Bearer local-stub');
  assert.equal(result.code, 401);
  assert.equal(result.nextCalled, false);
});

test('only a well-shaped stub-verified tenant reaches the handler', async () => {
  const result = await invokeMiddleware({ tenantId: 'tenant-a' })('Bearer local-stub');
  assert.equal(result.code, undefined);
  assert.equal(result.nextCalled, true);
  assert.equal(result.tenantId, 'tenant-a');
});
