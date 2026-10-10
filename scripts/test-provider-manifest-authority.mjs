import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../assetfactory-studio/package.json', import.meta.url));
const ts = require('typescript');
const sources = {
  route: fs.readFileSync(path.join(root, 'assetfactory-studio/app/api/system/manifest/route.ts'), 'utf8'),
  adapters: fs.readFileSync(path.join(root, 'assetfactory-studio/lib/server/assetProviderAdapters.ts'), 'utf8'),
  auth: fs.readFileSync(path.join(root, 'assetfactory-studio/lib/server/apiAuth.ts'), 'utf8'),
  catalog: fs.readFileSync(path.join(root, 'assetfactory-studio/lib/server/assetTypeCatalog.ts'), 'utf8'),
};
const credentials = { openai: ['OPENAI_API_KEY'], replicate: ['REPLICATE_API_TOKEN'], fal: ['FAL_KEY'], elevenlabs: ['ELEVENLABS_API_KEY'], stability: ['STABILITY_API_KEY'], runway: ['RUNWAY_API_KEY'], higgsfield: ['HIGGSFIELD_API_KEY_ID', 'HIGGSFIELD_API_KEY_SECRET'] };
const declared = ['ASSET_FACTORY_API_KEY', 'ASSET_FACTORY_JWT_HS256_SECRET', 'ASSET_FACTORY_JWT_ISSUER', 'ASSET_FACTORY_JWT_AUDIENCE', 'ASSET_FACTORY_TENANT_CLAIM', 'ASSET_FACTORY_ROLE_CLAIM', 'ASSET_FACTORY_QUEUE_MODE', 'ASSET_FACTORY_WORKER_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'CRON_SECRET', 'ASSET_FACTORY_PROVIDER_TIMEOUT_MS', 'ASSET_FACTORY_PROVIDER_MAX_BYTES'];
const configured = () => ({ ...Object.fromEntries(declared.map((key) => [key, 'synthetic-value-only'])),
  ASSET_FACTORY_REQUIRE_API_KEY: 'true', ASSET_FACTORY_REQUIRE_AUTH: 'true', ASSET_FACTORY_REQUIRE_JWT_SIGNATURE: 'true',
  ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH: 'false', ASSET_FACTORY_MEDIA_PROVIDER: 'local-proof',
});

async function fixture(env = {}, options = {}) {
  let backendReads = 0; let queueReads = 0; let externalCalls = 0;
  const context = vm.createContext({ process: { env: { ...env } }, URL, Headers, Buffer,
    fetch: () => { externalCalls++; throw new Error('Provider/network transport forbidden by read-only fixture'); } });
  const responses = { NextResponse: { json(body, init = {}) { return { status: init.status ?? 200, body, headers: new Headers(init.headers) }; } } };
  const api = new Map(); const modules = new Map();
  const definition = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  api.set('next/server', responses); api.set('crypto', { timingSafeEqual });
  api.set('@/lib/server/assetFactoryStore', { getStoreDiagnostics() { backendReads++; return { mode: options.mode ?? 'firestore-storage', fallbackActive: options.fallbackActive ?? false, firebase: { projectId: 'synthetic-dedicated-factory', storageBucket: 'synthetic-dedicated-factory.appspot.com' }, collections: { assets: 'assets' }, generatedPrefix: 'generated/' }; } });
  api.set('@/lib/server/assetQueueDispatcher', { getQueueDiagnostics() { queueReads++; return { mode: options.queueMode ?? 'durable-test-fixture' }; } });
  const owned = { '@/lib/server/assetProviderAdapters': 'adapters', '@/lib/server/apiAuth': 'auth', '@/lib/server/assetTypeCatalog': 'catalog' };
  async function actual(name) {
    if (modules.has(name)) return modules.get(name);
    const source = options.routeSource && name === 'route' ? options.routeSource : sources[name];
    const out = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    assert.deepEqual(out.diagnostics.filter((item) => item.category === ts.DiagnosticCategory.Error), []);
    const module = new vm.SourceTextModule(out.outputText, { context, identifier: 'actual-' + name });
    modules.set(name, module);
    await module.link(async (specifier) => {
      if (owned[specifier]) return actual(owned[specifier]);
      assert.ok(api.has(specifier), 'Unowned runtime import forbidden: ' + specifier);
      return definition(api.get(specifier));
    });
    return module;
  }
  const module = await actual('route'); await module.evaluate();
  const request = { url: 'https://factory.example.invalid/api/system/manifest' + (options.full ? '?full=true' : ''), headers: new Headers(options.headers) };
  const response = await module.namespace.GET(request);
  return { response, backendReads, queueReads, externalCalls };
}

function assertUnverified(result) {
  assert.equal(result.response.body.evidenceScope, 'configuration-only');
  assert.equal(result.response.body.runtimeVerified, false);
  assert.equal(result.response.body.productionVerified, false);
  assert.equal(result.response.body.capabilities.providerBackedRendering, false);
  assert.equal(result.response.body.capabilities.providerRuntimeVerified, false);
  assert.equal(result.response.body.capabilities.providerCallAuthorized, false);
  assert.equal(result.response.body.productionReadiness.providerRuntimeVerified, false);
  assert.equal(result.response.body.productionReadiness.providerCallAuthorized, false);
  assert.equal(result.response.body.productionReadiness.productionAuthReady, false);
  assert.equal(result.externalCalls, 0);
  assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
}
test('actual local-proof default is not a paid provider or runtime readiness receipt', async () => {
  const result = await fixture();
  assertUnverified(result);
  assert.equal(result.response.body.productionReadiness.providerConfigured, false);
  assert.equal(result.response.body.capabilities.anyPaidProviderCredentialConfigured, false);
  assert.equal(result.response.body.productionReadiness.status, 'not-ready-for-smoke');
});
test('complete other configuration with local-proof still cannot satisfy the selected provider gate', async () => {
  const result = await fixture(configured());
  assertUnverified(result);
  assert.equal(result.response.body.productionReadiness.authConfigurationReady, true);
  assert.equal(result.response.body.productionReadiness.configurationPrerequisitesPresent, false);
});
for (const [provider, keys] of Object.entries(credentials)) {
  test('actual selected credential configuration is not runtime or approval: ' + provider, async () => {
    const env = { ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: provider, ...Object.fromEntries(keys.map((key) => [key, 'synthetic-provider-value'])) };
    const result = await fixture(env); assertUnverified(result);
    assert.equal(result.response.body.productionReadiness.providerConfigured, true);
    assert.equal(result.response.body.productionReadiness.configurationPrerequisitesPresent, true);
    assert.equal(result.response.body.productionReadiness.status, 'provider-evidence-required');
  });
  test('actual selected whitespace credentials are absent: ' + provider, async () => {
    const env = { ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: provider, ...Object.fromEntries(keys.map((key) => [key, ' \n\t '])) };
    const result = await fixture(env); assertUnverified(result);
    assert.equal(result.response.body.productionReadiness.providerConfigured, false);
    assert.equal(result.response.body.capabilities.anyPaidProviderCredentialConfigured, false);
  });
}
test('unselected valid paid credentials do not grant selected provider readiness', async () => {
  const result = await fixture({ ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: 'replicate', OPENAI_API_KEY: 'synthetic-openai' });
  assertUnverified(result);
  assert.equal(result.response.body.capabilities.anyPaidProviderCredentialConfigured, true);
  assert.equal(result.response.body.productionReadiness.providerConfigured, false);
  assert.equal(result.response.body.productionReadiness.configurationPrerequisitesPresent, false);
});
test('unknown provider selection falls back only to unverified proof mode', async () => {
  const result = await fixture({ ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: 'unregistered', OPENAI_API_KEY: 'synthetic-openai' });
  assertUnverified(result); assert.equal(result.response.body.productionReadiness.selectedProvider, 'local-proof');
  assert.equal(result.response.body.productionReadiness.providerConfigured, false);
});
for (const options of [{ queueMode: 'local-inline' }, { mode: 'local-json', fallbackActive: true }]) test('fallback/inline configuration cannot appear smoke ready: ' + JSON.stringify(options), async () => {
  const result = await fixture({ ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic-openai' }, options);
  assertUnverified(result); assert.equal(result.response.body.productionReadiness.configurationPrerequisitesPresent, false);
});
for (const field of ['ASSET_FACTORY_WORKER_SECRET', 'ASSET_FACTORY_JWT_AUDIENCE', 'ASSET_FACTORY_ROLE_CLAIM', 'CRON_SECRET']) test('absent declared prerequisite keeps configuration incomplete: ' + field, async () => {
  const env = { ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic-openai' }; delete env[field];
  const result = await fixture(env); assertUnverified(result);
  assert.equal(result.response.body.productionReadiness.configurationPrerequisitesPresent, false);
});
test('public actual manifest omits full identity, env contract and credential values', async () => {
  const sentinel = 'synthetic-never-public-credential-value';
  const result = await fixture({ ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: 'openai', OPENAI_API_KEY: sentinel, FIREBASE_PRIVATE_KEY: sentinel });
  assertUnverified(result);
  for (const key of ['providers', 'queue', 'firebase', 'firebaseProjectId', 'storageBucket', 'requiredProductionEnv', 'requiredProductionConfiguration']) assert.equal(Object.hasOwn(result.response.body, key), false);
  assert.equal(JSON.stringify(result.response.body).includes(sentinel), false);
});
for (const headers of [{}, { 'x-asset-factory-api-key': 'wrong-synthetic-key' }]) test('actual full key guard denies before backend initialization: ' + Object.keys(headers).length, async () => {
  const result = await fixture(configured(), { full: true, headers });
  assert.equal(result.response.status, 401); assert.equal(result.backendReads, 0); assert.equal(result.queueReads, 0); assert.equal(result.externalCalls, 0);
  assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
});
test('actual full guard fails closed when the owned key is absent before backend initialization', async () => {
  const result = await fixture({}, { full: true });
  assert.equal(result.response.status, 503); assert.equal(result.backendReads, 0); assert.equal(result.queueReads, 0); assert.equal(result.externalCalls, 0);
  assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
});
test('actual full guard treats whitespace-only owned key as unavailable before backend initialization', async () => {
  const result = await fixture({ ASSET_FACTORY_API_KEY: ' \n\t ' }, { full: true, headers: { 'x-asset-factory-api-key': ' ' } });
  assert.equal(result.response.status, 503); assert.equal(result.backendReads, 0); assert.equal(result.queueReads, 0); assert.equal(result.externalCalls, 0);
  assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
});
test('actual authenticated full manifest describes ADC alternatives and refused key variables without values', async () => {
  const env = { ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic-openai' };
  const result = await fixture(env, { full: true, headers: { 'x-asset-factory-api-key': env.ASSET_FACTORY_API_KEY } });
  assertUnverified(result); assert.equal(result.backendReads, 1); assert.equal(result.queueReads, 1);
  const body = result.response.body;
  for (const name of ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_STORAGE_BUCKET', 'FIREBASE_PROJECT_ID', 'ASSET_FACTORY_FIREBASE_PROJECT_ID']) assert.equal(body.requiredProductionEnv.includes(name), false);
  assert.deepEqual(Array.from(body.requiredProductionConfiguration.firebaseProject.oneOf), ['ASSET_FACTORY_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID']);
  assert.equal(body.requiredProductionConfiguration.firebaseCredentials.mode, 'application-default');
  assert.equal(body.requiredProductionConfiguration.firebaseCredentials.deployedIdentityVerified, false);
  assert.equal(body.requiredProductionConfiguration.forbiddenLongLivedCredentialEnv.includes('FIREBASE_PRIVATE_KEY'), true);
  assert.equal(JSON.stringify(body).includes('synthetic-openai'), false);
  assert.equal(JSON.stringify(body).includes(env.ASSET_FACTORY_API_KEY), false);
});
test('caller environment cannot convert the manifest into a provider or production receipt', async () => {
  const result = await fixture({ ...configured(), ASSET_FACTORY_MEDIA_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic-openai',
    ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED: 'true', ASSET_FACTORY_PROVIDER_RUNTIME_VERIFIED: 'true',
    ASSET_FACTORY_PRODUCTION_VERIFIED: 'true' });
  assertUnverified(result);
});
