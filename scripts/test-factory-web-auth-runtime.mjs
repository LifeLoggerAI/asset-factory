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
  jobs: compile('app/api/jobs/route.ts'),
  assets: compile('app/api/assets/route.ts'),
};

function instantiate(program, env, clock, dependencies) {
  const module = { exports: {} };
  class FixtureDate extends Date { static now() { return clock.value; } }
  const context = vm.createContext({ module, exports: module.exports, Buffer, Error, URL, Date: FixtureDate,
    process: { env }, fetch: forbidden, console: { log: forbidden, error: forbidden },
    require(name) {
      if (name === 'crypto' || name === 'node:crypto') return createRequire(import.meta.url)('node:crypto');
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
      listAssets: async () => {
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
  const jobs = instantiate(code.jobs, env, clock, dependencies);
  const assets = instantiate(code.assets, env, clock, dependencies);
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
  const readRequest = (payload = claims({}), extraHeaders = {}, relativePath = '/api/generate') =>
    new next.NextRequest('https://factory.fixture.invalid' + relativePath, { method: 'GET',
      headers: { authorization: `Bearer ${token(payload)}`, ...extraHeaders } });
  return { env, clock, auth, generate, jobs, assets, claims, token, request, readRequest, writes,
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
  const response = await f.generate.GET(f.readRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ jobId: 'own-fixture', tenantId: 'fixture-tenant' }]);
});
test('actual Generate GET rejects expiration during storage await', async () => {
  const f = fixture({}, null, ({ clock }) => { clock.value += 3600_000; });
  const response = await f.generate.GET(f.readRequest());
  assert.equal(response.status, 401);
  assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
});
test('actual Generate GET rejects verifier rotation during storage await', async () => {
  const f = fixture({}, null, ({ env }) => { env.ASSET_FACTORY_JWT_HS256_SECRET = 'rotated-fixture-' + 'r'.repeat(48); });
  const response = await f.generate.GET(f.readRequest());
  assert.equal(response.status, 401);
  assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
});
test('actual Generate GET rejects changed actor during storage await', async () => {
  let req;
  const f = fixture({}, null, () => { req.headers.set('authorization', `Bearer ${f.token(f.claims({ sub: 'different-fixture-actor' }))}`); });
  req = f.readRequest();
  const response = await f.generate.GET(req);
  assert.equal(response.status, 403);
  assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
});
test('actual Generate GET redacts storage exception detail', async () => {
  const f = fixture({}, null, () => { throw new Error('synthetic-private-read-sentinel'); });
  const response = await f.generate.GET(f.readRequest());
  assert.equal(response.status, 500);
  const data = await response.json();
  assert.equal(data.error, 'Unable to read asset jobs.');
  assert.ok(!JSON.stringify(data).includes('synthetic-private-read-sentinel'));
});


test('signed canonical tenant rejects a foreign selected header without an expected-tenant argument', () => {
  const f = fixture();
  const result = f.auth.authorizeAssetRequest(f.readRequest(f.claims({}), { 'x-tenant-id': 'foreign-tenant' }));
  assert.equal(result.ok, false); assert.equal(result.status, 403); assert.equal(result.error, 'Tenant mismatch');
});
test('blank selected header cannot silently select the signed tenant', () => {
  const f = fixture();
  const result = f.auth.authorizeAssetRequest(f.readRequest(f.claims({}), { 'x-tenant-id': ' ' }));
  assert.equal(result.ok, false); assert.equal(result.status, 403);
});
test('matching normalized selected header retains signed tenant access', () => {
  const f = fixture();
  const result = f.auth.authorizeAssetRequest(f.readRequest(f.claims({}), { 'x-tenant-id': ' fixture-tenant ' }));
  assert.equal(result.ok, true); assert.equal(result.tenantId, 'fixture-tenant');
});
test('selected header cannot substitute a missing canonical tenant claim', () => {
  const f = fixture();
  const result = f.auth.authorizeAssetRequest(f.readRequest(f.claims({ tenantId: undefined }), { 'x-tenant-id': 'fixture-tenant' }));
  assert.equal(result.ok, false); assert.equal(result.status, 401);
});
test('selected and role headers cannot substitute a missing signed production role', () => {
  const f = fixture();
  const result = f.auth.authorizeAssetRequest(f.readRequest(f.claims({ roles: undefined }), { 'x-tenant-id': 'fixture-tenant', 'x-asset-roles': 'admin' }));
  assert.equal(result.ok, false); assert.equal(result.status, 401);
});
test('custom canonical tenant claim agrees with the selected request context', () => {
  const f = fixture({ ASSET_FACTORY_TENANT_CLAIM: 'canonicalTenant' });
  const result = f.auth.authorizeAssetRequest(f.readRequest(f.claims({ canonicalTenant: 'fixture-tenant', tenantId: 'foreign-legacy-value' }), { 'x-tenant-id': 'fixture-tenant' }));
  assert.equal(result.ok, true); assert.equal(result.tenantId, 'fixture-tenant');
});
test('actual Generate POST rejects changed selected header after quota', async () => {
  let req;
  const f = fixture({}, () => { req.headers.set('x-tenant-id', 'foreign-tenant'); });
  req = f.request();
  const response = await f.generate.POST(req);
  assert.equal(response.status, 403); assert.equal(f.writes.length, 0);
});
test('actual Generate GET rejects changed selected header after storage', async () => {
  let req;
  const f = fixture({}, null, () => { req.headers.set('x-tenant-id', 'foreign-tenant'); });
  req = f.readRequest();
  const response = await f.generate.GET(req);
  assert.equal(response.status, 403);
  assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
});
test('actual alternate Jobs POST rejects viewer before quota and writes', async () => {
  const f = fixture();
  const response = await f.jobs.POST(f.request(f.claims({ roles: ['viewer'] })));
  assert.equal(response.status, 403); assert.equal(f.quotaCalls(), 0); assert.equal(f.writes.length, 0);
});
test('actual alternate Jobs POST retains creator, job identity and tenant', async () => {
  const f = fixture();
  const response = await f.jobs.POST(f.request());
  assert.equal(response.status, 202); assert.equal(f.writes.length, 1);
  const body = await response.json();
  assert.equal(body.jobId, 'fixture-job'); assert.equal(f.writes[0].tenantId, 'fixture-tenant');
});
test('actual alternate Jobs POST still requires the server API key', async () => {
  const f = fixture();
  const response = await f.jobs.POST(f.request(f.claims({}), { 'x-asset-factory-api-key': '' }));
  assert.equal(response.status, 401); assert.equal(f.quotaCalls(), 0); assert.equal(f.writes.length, 0);
});
test('actual alternate Jobs POST retains server-generated ID and default graphic type', async () => {
  const f = fixture();
  const req = new next.NextRequest('https://factory.fixture.invalid/api/jobs', { method: 'POST',
    headers: { authorization: `Bearer ${f.token(f.claims({}))}`, 'x-asset-factory-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: 'fixture-tenant', prompt: 'Synthetic default-field proof.' }) });
  const response = await f.jobs.POST(req);
  assert.equal(response.status, 202); assert.equal(f.writes.length, 1);
  const body = await response.json();
  assert.match(body.jobId, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  assert.equal(f.writes[0].jobId, body.jobId); assert.equal(f.writes[0].requestedType, 'graphic');
});
for (const [name, mutate, status] of [
  ['expiry', ({ clock }) => { clock.value += 3600_000; }, 401],
  ['verifier rotation', ({ env }) => { env.ASSET_FACTORY_JWT_HS256_SECRET = 'rotated-fixture-' + 'r'.repeat(48); }, 401],
  ['auth disablement', ({ env }) => { env.ASSET_FACTORY_REQUIRE_AUTH = 'false'; }, 503],
]) {
  test(`actual alternate Jobs POST rejects ${name} during quota`, async () => {
    const f = fixture({}, mutate);
    const response = await f.jobs.POST(f.request());
    assert.equal(response.status, status); assert.equal(f.quotaCalls(), 1); assert.equal(f.writes.length, 0);
  });
}
for (const [name, mutate] of [
  ['actor', (f, req) => req.headers.set('authorization', `Bearer ${f.token(f.claims({ sub: 'different-fixture-actor' }))}`)],
  ['selected tenant', (_f, req) => req.headers.set('x-tenant-id', 'foreign-tenant')],
]) {
  test(`actual alternate Jobs POST rejects changed ${name} after quota`, async () => {
    let req;
    const f = fixture({}, () => mutate(f, req));
    req = f.request();
    const response = await f.jobs.POST(req);
    assert.equal(response.status, 403); assert.equal(f.writes.length, 0);
  });
}
test('actual alternate Jobs POST redacts quota exception details', async () => {
  const f = fixture({}, () => { throw new Error('synthetic-private-quota-sentinel'); });
  const response = await f.jobs.POST(f.request());
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.error, 'Unable to create asset job.');
  assert.ok(!JSON.stringify(body).includes('synthetic-private-quota-sentinel')); assert.equal(f.writes.length, 0);
});
for (const [name, route, relativePath, readError] of [
  ['Jobs', 'jobs', '/api/jobs', 'Unable to read asset jobs.'],
  ['Assets', 'assets', '/api/assets', 'Unable to read asset metadata.'],
]) {
  test(`actual ${name} GET retains only the signed tenant data`, async () => {
    const f = fixture();
    const response = await f[route].GET(f.readRequest(f.claims({}), { 'x-tenant-id': 'fixture-tenant' }, relativePath));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ jobId: 'own-fixture', tenantId: 'fixture-tenant' }]);
  });
  test(`actual ${name} GET rejects a foreign selected context before data delivery`, async () => {
    const f = fixture();
    const response = await f[route].GET(f.readRequest(f.claims({}), { 'x-tenant-id': 'foreign-tenant' }, relativePath));
    assert.equal(response.status, 403);
    assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
  });
  for (const [mutation, mutate, status] of [
    ['expiry', ({ clock }) => { clock.value += 3600_000; }, 401],
    ['verifier rotation', ({ env }) => { env.ASSET_FACTORY_JWT_HS256_SECRET = 'rotated-fixture-' + 'r'.repeat(48); }, 401],
    ['auth disablement', ({ env }) => { env.ASSET_FACTORY_REQUIRE_AUTH = 'false'; }, 503],
  ]) {
    test(`actual ${name} GET rejects ${mutation} during storage`, async () => {
      const f = fixture({}, null, mutate);
      const response = await f[route].GET(f.readRequest(f.claims({}), {}, relativePath));
      assert.equal(response.status, status);
      assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
    });
  }
  for (const [mutation, mutate] of [
    ['actor', (f, req) => req.headers.set('authorization', `Bearer ${f.token(f.claims({ sub: 'different-fixture-actor' }))}`)],
    ['selected tenant', (_f, req) => req.headers.set('x-tenant-id', 'foreign-tenant')],
  ]) {
    test(`actual ${name} GET rejects changed ${mutation} during storage`, async () => {
      let req;
      const f = fixture({}, null, () => mutate(f, req));
      req = f.readRequest(f.claims({}), {}, relativePath);
      const response = await f[route].GET(req);
      assert.equal(response.status, 403);
      assert.ok(!JSON.stringify(await response.json()).includes('own-fixture'));
    });
  }
  test(`actual ${name} GET redacts storage exception details`, async () => {
    const f = fixture({}, null, () => { throw new Error('synthetic-private-read-sentinel'); });
    const response = await f[route].GET(f.readRequest(f.claims({}), {}, relativePath));
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, readError); assert.ok(!JSON.stringify(body).includes('synthetic-private-read-sentinel'));
  });
}
test('actual Jobs GET retains same-tenant item lookup and hides a foreign job', async () => {
  const f = fixture();
  const own = await f.jobs.GET(f.readRequest(f.claims({}), {}, '/api/jobs?jobId=own-fixture'));
  assert.equal(own.status, 200); assert.equal((await own.json()).jobId, 'own-fixture');
  const foreign = await f.jobs.GET(f.readRequest(f.claims({}), {}, '/api/jobs?jobId=foreign-fixture'));
  assert.equal(foreign.status, 404);
  assert.deepEqual(await foreign.json(), { error: 'Job not found' });
});

console.log(JSON.stringify({ proof: 'actual compiled source with real Next Request/Response SDK',
  typescript: ts.version, next: sdkVersion, providerCalls: 0, spend: 0,
  dependencyLimits: 'Policy/quota/store/type-catalog boundaries are synthetic; no database, provider or deployed membership/revocation acceptance.' }));
