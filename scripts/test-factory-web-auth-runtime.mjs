import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studio = path.join(root, 'assetfactory-studio');
const requireStudio = createRequire(path.join(studio, 'package.json'));
const ts = requireStudio('typescript');
const next = requireStudio('next/server');
const sdkVersion = requireStudio('next/package.json').version;
const signingSecret = 'synthetic-signing-fixture-' + 'x'.repeat(48);
const apiKey = 'synthetic-api-key-fixture';
const issuer = 'https://issuer.fixture.invalid';
const audience = 'asset-factory-fixture';
const forbidden = () => { throw new Error('network/provider operation prohibited'); };

function compile(relative) {
  const source = fs.readFileSync(path.join(studio, relative), 'utf8');
  const result = ts.transpileModule(source, { fileName: relative, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true, isolatedModules: true } });
  const errors = (result.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => root, getCanonicalFileName: name => name, getNewLine: () => '\n' }));
  return result.outputText;
}
const code = {
  auth: compile('lib/server/assetAuth.ts'),
  key: compile('lib/server/apiAuth.ts'),
  generate: compile('app/api/generate/route.ts'),
};

function instantiate(program, env, clock, dependencies) {
  const module = { exports: {} };
  class FixtureDate extends Date { static now() { return clock.value; } }
  const context = vm.createContext({ module, exports: module.exports, Buffer, Error, Date: FixtureDate,
    process: { env }, fetch: forbidden, console: { log: forbidden, error: forbidden },
    require(name) {
      if (name === 'crypto') return createRequire(import.meta.url)('node:crypto');
      if (name === 'next/server') return next;
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unregistered module dependency ${name}`);
    } });
  new vm.Script(program, { filename: 'actual-compiled-factory-module' })
    .runInContext(context, { timeout: 1000 });
  return module.exports;
}

function fixture(overrides = {}, quotaHook = null, readHook = null) {
  const clock = { value: Date.UTC(2026, 9, 8) };
  const env = { NODE_ENV: 'production', ASSET_FACTORY_REQUIRE_AUTH: 'true',
    ASSET_FACTORY_JWT_HS256_SECRET: signingSecret, ASSET_FACTORY_JWT_ISSUER: issuer,
    ASSET_FACTORY_JWT_AUDIENCE: audience, ASSET_FACTORY_REQUIRE_API_KEY: 'true',
    ASSET_FACTORY_API_KEY: apiKey, ...overrides };
  const auth = instantiate(code.auth, env, clock, {});
  const key = instantiate(code.key, env, clock, {});
  const writes = [];
  let quotaCalls = 0;
  const dependencies = {
    '@/lib/server/assetAuth': auth, '@/lib/server/apiAuth': key,
    '@/lib/server/assetFactoryStore': { readJobs: async () => {
      if (readHook) await readHook({ env, clock, writes });
      return [{ jobId: 'own-fixture', tenantId: 'fixture-tenant' },
        { jobId: 'foreign-fixture', tenantId: 'foreign-tenant' }];
    },
      addJob: async job => { writes.push(structuredClone(job)); },
      getStoreDiagnostics: () => ({ mode: 'synthetic', fallbackActive: false }) },
    '@/lib/server/assetFactoryValidation': { validateGenerateRequest: () => null },
    '@/lib/server/assetGenerationPolicy': { evaluateGenerationPolicy: () =>
      ({ ok: true, estimatedUnits: 1, estimatedCostCents: 0 }) },
    '@/lib/server/assetBilling': { evaluateTenantQuota: async () => {
      quotaCalls += 1; if (quotaHook) await quotaHook({ env, clock, writes });
      return { ok: true }; } },
    '@/lib/server/assetTypeCatalog': { resolveAssetType: () =>
      ({ canonicalType: 'graphic', family: 'graphic' }) },
  };
  const generate = instantiate(code.generate, env, clock, dependencies);
  const claims = extra => ({ sub: 'fixture-actor', tenantId: 'fixture-tenant', roles: ['creator'],
    iss: issuer, aud: audience, exp: clock.value / 1000 + 600, ...extra });
  const token = (payload, secret = signingSecret, header = { alg: 'HS256', typ: 'JWT' }) => {
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${h}.${p}.${createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
  };
  const request = (payload = claims({}), extraHeaders = {}) => new next.NextRequest(
    'https://factory.fixture.invalid/api/generate', { method: 'POST',
      headers: { authorization: `Bearer ${token(payload)}`, 'x-asset-factory-api-key': apiKey,
        'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ jobId: 'fixture-job', tenantId: 'fixture-tenant', type: 'graphic',
        prompt: 'Synthetic prompt, no private data.' }) });
  return { env, clock, auth, generate, claims, token, request, writes,
    quotaCalls: () => quotaCalls };
}

const cases = [
  ['production absent auth flag', { ASSET_FACTORY_REQUIRE_AUTH: undefined }, {}, 503],
  ['production disabled auth flag', { ASSET_FACTORY_REQUIRE_AUTH: 'false' }, {}, 503],
  ['production legacy header mode', { ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH: 'true' }, {}, 503],
  ['production missing issuer', { ASSET_FACTORY_JWT_ISSUER: undefined }, {}, 503],
  ['production missing audience', { ASSET_FACTORY_JWT_AUDIENCE: undefined }, {}, 503],
  ['production missing verifier', { ASSET_FACTORY_JWT_HS256_SECRET: undefined }, {}, 503],
  ['production whitespace verifier', { ASSET_FACTORY_JWT_HS256_SECRET: ' ' }, {}, 503],
  ['production short verifier', { ASSET_FACTORY_JWT_HS256_SECRET: 'short-fixture' }, {}, 503],
  ['missing expiration', {}, { exp: undefined }, 401],
  ['string expiration', {}, { exp: 'later' }, 401],
  ['null expiration', {}, { exp: null }, 401],
  ['expired token', {}, { exp: Date.UTC(2026, 9, 8) / 1000 - 1 }, 401],
  ['unbounded production lifetime', {}, { exp: Date.UTC(2026, 9, 8) / 1000 + 3601 }, 401],
  ['invalid activation claim', {}, { nbf: 'later' }, 401],
  ['future activation claim', {}, { nbf: Date.UTC(2026, 9, 8) / 1000 + 1 }, 401],
  ['wrong issuer', {}, { iss: 'https://foreign.fixture.invalid' }, 401],
  ['wrong audience', {}, { aud: 'foreign-service' }, 401],
  ['missing canonical tenant', {}, { tenantId: undefined, tid: 'fixture-tenant' }, 401],
  ['missing configured tenant', { ASSET_FACTORY_TENANT_CLAIM: 'canonicalTenant' }, {}, 401],
  ['missing canonical role', {}, { roles: undefined, role: 'admin' }, 401],
  ['missing configured role', { ASSET_FACTORY_ROLE_CLAIM: 'canonicalRoles' }, {}, 401],
  ['unknown role', {}, { roles: ['unknown'] }, 401],
  ['mixed unknown role', {}, { roles: ['creator', 'unknown'] }, 401],
  ['missing canonical subject', {}, { sub: undefined, uid: 'fixture-actor' }, 401],
];
for (const [name, env, claims, status] of cases) {
  test(`actual compiled auth rejects ${name}`, () => {
    const f = fixture(env);
    const result = f.auth.authorizeAssetRequest(f.request(f.claims(claims)), 'fixture-tenant', 'creator');
    assert.equal(result.ok, false, name);
    assert.equal(result.status, status, name);
    assert.equal(f.writes.length, 0);
  });
}

test('missing verifier cannot turn a JWT into authentication outside production', () => {
  const f = fixture({ NODE_ENV: 'test', ASSET_FACTORY_JWT_HS256_SECRET: undefined,
    ASSET_FACTORY_REQUIRE_JWT_SIGNATURE: undefined });
  const result = f.auth.authorizeAssetRequest(f.request(), 'fixture-tenant', 'creator');
  assert.equal(result.ok, false); assert.equal(result.status, 503);
});
test('signature flag false cannot bypass the verifier', () => {
  const f = fixture({ ASSET_FACTORY_REQUIRE_JWT_SIGNATURE: 'false' });
  const req = f.request({}, { authorization: `Bearer ${f.token(f.claims({}), 'foreign-fixture-secret')}` });
  const result = f.auth.authorizeAssetRequest(req, 'fixture-tenant', 'creator');
  assert.equal(result.ok, false); assert.equal(result.status, 401);
});
test('production header identities cannot grant access', () => {
  const f = fixture();
  const req = f.request({}, { authorization: '', 'x-tenant-id': 'fixture-tenant', 'x-asset-role': 'admin' });
  const result = f.auth.authorizeAssetRequest(req, 'fixture-tenant', 'creator');
  assert.equal(result.ok, false); assert.equal(result.status, 401);
});
test('explicit nonproduction local behavior is preserved', () => {
  const f = fixture({ NODE_ENV: 'test', ASSET_FACTORY_REQUIRE_AUTH: 'false' });
  const result = f.auth.authorizeAssetRequest(f.request({}, { 'x-tenant-id': 'fixture-tenant' }));
  assert.equal(result.ok, true); assert.equal(result.mode, 'disabled');
});
test('valid scoped production token retains creator access', () => {
  const f = fixture();
  const result = f.auth.authorizeAssetRequest(f.request(), 'fixture-tenant', 'creator');
  assert.equal(result.ok, true); assert.equal(result.mode, 'jwt');
  assert.equal(result.userId, 'fixture-actor'); assert.equal(result.tenantId, 'fixture-tenant');
});
test('configured canonical claims are supported without legacy substitution', () => {
  const f = fixture({ ASSET_FACTORY_TENANT_CLAIM: 'canonicalTenant', ASSET_FACTORY_ROLE_CLAIM: 'canonicalRoles' });
  const result = f.auth.authorizeAssetRequest(f.request(f.claims({ canonicalTenant: 'fixture-tenant', canonicalRoles: ['creator'] })), 'fixture-tenant', 'creator');
  assert.equal(result.ok, true); assert.equal(result.userId, 'fixture-actor');
});
test('foreign tenant is rejected', () => {
  const f = fixture();
  const result = f.auth.authorizeAssetRequest(f.request(), 'foreign-tenant', 'creator');
  assert.equal(result.ok, false); assert.equal(result.status, 403);
});

test('actual Generate POST rejects viewer before quota or private writes', async () => {
  const f = fixture();
  const response = await f.generate.POST(f.request(f.claims({ roles: ['viewer'] })));
  assert.equal(response.status, 403); assert.equal(f.quotaCalls(), 0); assert.equal(f.writes.length, 0);
});
test('actual Generate POST retains authenticated creator behavior', async () => {
  const f = fixture();
  const response = await f.generate.POST(f.request());
  assert.equal(response.status, 202); assert.equal(f.quotaCalls(), 1); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].tenantId, 'fixture-tenant');
});
test('actual Generate POST rejects expiration during quota await', async () => {
  const f = fixture({}, ({ clock }) => { clock.value += 3600_000; });
  const response = await f.generate.POST(f.request());
  assert.equal(response.status, 401); assert.equal(f.quotaCalls(), 1); assert.equal(f.writes.length, 0);
});
test('actual Generate POST rejects verifier rotation during quota await', async () => {
  const f = fixture({}, ({ env }) => { env.ASSET_FACTORY_JWT_HS256_SECRET = 'other-fixture-secret-' + 'z'.repeat(48); });
  const response = await f.generate.POST(f.request());
  assert.equal(response.status, 401); assert.equal(f.writes.length, 0);
});
test('actual Generate POST rejects changed request actor after quota await', async () => {
  let req;
  const f = fixture({}, () => { req.headers.set('authorization', `Bearer ${f.token(f.claims({ sub: 'different-fixture-actor' }))}`); });
  req = f.request(); const response = await f.generate.POST(req);
  assert.equal(response.status, 403); assert.equal(f.writes.length, 0);
});
test('actual Generate POST rejects disabled auth after quota await', async () => {
  const f = fixture({}, ({ env }) => { env.ASSET_FACTORY_REQUIRE_AUTH = 'false'; });
  const response = await f.generate.POST(f.request());
  assert.equal(response.status, 503); assert.equal(f.writes.length, 0);
});
test('actual Generate POST redacts internal exception detail', async () => {
  const f = fixture({}, () => { throw new Error('synthetic-private-error-sentinel'); });
  const response = await f.generate.POST(f.request());
  assert.equal(response.status, 500); const data = await response.json();
  assert.equal(data.error, 'Unable to create asset job.');
  assert.ok(!JSON.stringify(data).includes('synthetic-private-error-sentinel'));
  assert.equal(f.writes.length, 0);
});


test('actual Generate GET reads only the authenticated tenant', async () => {
  const f = fixture();
  const response = await f.generate.GET(f.request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ jobId: 'own-fixture', tenantId: 'fixture-tenant' }]);
});
test('actual Generate GET rejects expiration during storage await', async () => {
  const f = fixture({}, null, ({ clock }) => { clock.value += 3600_000; });
  const response = await f.generate.GET(f.request());
  assert.equal(response.status, 401);
  assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
});
test('actual Generate GET rejects verifier rotation during storage await', async () => {
  const f = fixture({}, null, ({ env }) => { env.ASSET_FACTORY_JWT_HS256_SECRET = 'rotated-fixture-' + 'r'.repeat(48); });
  const response = await f.generate.GET(f.request());
  assert.equal(response.status, 401);
  assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
});
test('actual Generate GET rejects changed actor during storage await', async () => {
  let req;
  const f = fixture({}, null, () => { req.headers.set('authorization', `Bearer ${f.token(f.claims({ sub: 'different-fixture-actor' }))}`); });
  req = f.request();
  const response = await f.generate.GET(req);
  assert.equal(response.status, 403);
  assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
});
test('actual Generate GET redacts storage exception detail', async () => {
  const f = fixture({}, null, () => { throw new Error('synthetic-private-read-sentinel'); });
  const response = await f.generate.GET(f.request());
  assert.equal(response.status, 500);
  const data = await response.json();
  assert.equal(data.error, 'Unable to read asset jobs.');
  assert.ok(!JSON.stringify(data).includes('synthetic-private-read-sentinel'));
});

console.log(JSON.stringify({ proof: 'actual compiled source with real Next Request/Response SDK',
  typescript: ts.version, next: sdkVersion, providerCalls: 0, spend: 0,
  dependencyLimits: 'Policy/quota/store/type-catalog boundaries are synthetic; no database, provider or deployed membership/revocation acceptance.' }));
