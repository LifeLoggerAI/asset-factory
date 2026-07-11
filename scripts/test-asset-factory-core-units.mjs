import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const studioRoot = path.join(root, 'assetfactory-studio');
const typescriptPath = path.join(studioRoot, 'node_modules', 'typescript', 'lib', 'typescript.js');

if (!fs.existsSync(typescriptPath)) {
  console.error(`Missing TypeScript dependency at ${typescriptPath}. Run npm --prefix assetfactory-studio install first.`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-core-units-'));
const compiledDir = path.join(tmpDir, 'compiled');
fs.mkdirSync(path.join(compiledDir, 'lib', 'server'), { recursive: true });

function compileTsModule(relativePath, patches = []) {
  const sourcePath = path.join(studioRoot, relativePath);
  let source = fs.readFileSync(sourcePath, 'utf8');
  for (const [from, to] of patches) {
    assert.ok(source.includes(from), `${relativePath} patch source missing: ${from}`);
    source = source.replace(from, to);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: relativePath,
  }).outputText;
  const outputPath = path.join(compiledDir, relativePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  return outputPath;
}

fs.writeFileSync(
  path.join(compiledDir, 'lib', 'server', 'firebaseAdmin.mjs'),
  'export function getAdminDb() { return globalThis.__ASSET_FACTORY_TEST_DB__ ?? null; }\n'
);

const stripeModulePath = compileTsModule('lib/server/stripeEntitlements.ts', [
  ["import { getAdminDb } from './firebaseAdmin';", "import { getAdminDb } from './firebaseAdmin.mjs';"],
]);
const queueModulePath = compileTsModule('lib/server/assetQueueOps.ts', [
  ["import { getAdminDb } from './firebaseAdmin';", "import { getAdminDb } from './firebaseAdmin.mjs';"],
]);
const catalogModulePath = compileTsModule('lib/server/assetTypeCatalog.ts');
compileTsModule('lib/server/assetFactoryValidation.ts', [
  ["import { isSupportedAssetType, supportedAssetTypeNames } from './assetTypeCatalog';", "import { isSupportedAssetType, supportedAssetTypeNames } from './assetTypeCatalog.mjs';"],
]);
const providerAdapterModulePath = compileTsModule('lib/server/assetProviderAdapters.ts', [
  ["import type { CanonicalAssetType } from './assetFactoryTypes';", "type CanonicalAssetType = 'graphic' | 'model3d' | 'audio' | 'bundle';"],
]);
const providerRuntimeModulePath = compileTsModule('lib/server/assetProviderRuntime.ts', [
  ["import type { GenerateRequest } from './assetFactoryValidation';", "type GenerateRequest = { jobId: string; tenantId?: string; prompt: string; type: string; size?: { width?: number; height?: number }; metadata?: Record<string, unknown> };"],
  ["import type { AssetTypeDefinition } from './assetTypeCatalog';", "type AssetTypeDefinition = { canonicalType: 'graphic' | 'model3d' | 'audio' | 'bundle'; extension: string };"],
  ["import { configuredProviderName, type AssetProviderName } from './assetProviderAdapters';", "import { configuredProviderName } from './assetProviderAdapters.mjs'; type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability';"],
]);

const { buildStripeEntitlement } = await import(pathToFileURL(stripeModulePath).href);
const { requeueAssetQueueJob } = await import(pathToFileURL(queueModulePath).href);
const { resolveAssetType } = await import(pathToFileURL(catalogModulePath).href);
const {
  assertPaidProviderRequestAuthorized,
  configuredProviderName,
  getPaidProviderAuthorization,
  getProviderDiagnostics,
} = await import(pathToFileURL(providerAdapterModulePath).href);
const { renderWithConfiguredProvider } = await import(pathToFileURL(providerRuntimeModulePath).href);

function testStripeEntitlementFromCheckoutSession() {
  const entitlement = buildStripeEntitlement({
    id: 'evt_checkout',
    type: 'checkout.session.completed',
    created: 1710000000,
    data: {
      object: {
        customer: 'cus_123',
        subscription: 'sub_123',
        client_reference_id: 'fallback-tenant',
        metadata: {
          tenantId: 'tenant-checkout',
          assetFactoryPlanName: 'Pro',
          assetFactoryMaxMonthlyJobs: '100',
          assetFactoryMaxMonthlyUnits: '2500',
          assetFactoryMaxMonthlyCostCents: '5000',
        },
      },
    },
  });

  assert.deepEqual(entitlement, {
    tenantId: 'tenant-checkout',
    status: 'active',
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    planName: 'Pro',
    maxMonthlyJobs: 100,
    maxMonthlyUnits: 2500,
    maxMonthlyCostCents: 5000,
    sourceEventId: 'evt_checkout',
    sourceEventType: 'checkout.session.completed',
    stripeCreatedAt: 1710000000,
  });
}

function testStripeEntitlementFromSubscriptionPriceMetadata() {
  const entitlement = buildStripeEntitlement({
    id: 'evt_subscription',
    type: 'customer.subscription.updated',
    created: 1710001111,
    data: {
      object: {
        id: 'sub_456',
        customer: 'cus_456',
        status: 'trialing',
        metadata: { workspaceId: 'tenant-subscription' },
        items: {
          data: [{
            price: {
              id: 'price_456',
              product: 'prod_456',
              nickname: 'Growth',
              metadata: {
                maxMonthlyJobs: 50,
                maxMonthlyUnits: '1000',
                maxMonthlyCostCents: '2500',
              },
            },
          }],
        },
      },
    },
  });

  assert.equal(entitlement.tenantId, 'tenant-subscription');
  assert.equal(entitlement.status, 'trialing');
  assert.equal(entitlement.stripeCustomerId, 'cus_456');
  assert.equal(entitlement.stripeSubscriptionId, 'sub_456');
  assert.equal(entitlement.stripePriceId, 'price_456');
  assert.equal(entitlement.stripeProductId, 'prod_456');
  assert.equal(entitlement.planName, 'Growth');
  assert.equal(entitlement.maxMonthlyJobs, 50);
  assert.equal(entitlement.maxMonthlyUnits, 1000);
  assert.equal(entitlement.maxMonthlyCostCents, 2500);
}

function testStripeEntitlementRequiresTenant() {
  const entitlement = buildStripeEntitlement({
    id: 'evt_missing_tenant',
    type: 'invoice.paid',
    data: { object: { customer: 'cus_missing' } },
  });
  assert.equal(entitlement, null);
}

class MockDocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== undefined;
  }
  data() { return this._data; }
}

class MockDocRef {
  constructor(collection, id) {
    this.collectionName = collection.collectionName;
    this.id = id;
    this.store = collection.store;
  }
}

class MockCollection {
  constructor(collectionName, store) {
    this.collectionName = collectionName;
    this.store = store;
  }
  doc(id) { return new MockDocRef(this, id); }
}

class MockTransaction {
  constructor(store) { this.store = store; }
  async get(ref) { return new MockDocSnapshot(ref.id, this.store[ref.collectionName]?.[ref.id]); }
  set(ref, patch, options) {
    this.store[ref.collectionName] ??= {};
    const existing = this.store[ref.collectionName][ref.id] ?? {};
    this.store[ref.collectionName][ref.id] = options?.merge ? { ...existing, ...patch } : patch;
  }
}

class MockDb {
  constructor(seed = {}) { this.store = seed; }
  collection(collectionName) { return new MockCollection(collectionName, this.store); }
  async runTransaction(callback) { return callback(new MockTransaction(this.store)); }
}

async function testRequeueDeadLetteredJob() {
  const db = new MockDb({
    assetFactoryQueue: {
      job_requeue: {
        jobId: 'job_requeue', tenantId: 'tenant-a', status: 'dead-lettered', queueStatus: 'dead-lettered',
        attempts: 3, maxAttempts: 3, failureReason: 'provider failed', deadLetteredAt: '2026-01-01T00:00:00.000Z',
        leaseId: 'old-lease', leaseExpiresAt: '2026-01-01T00:05:00.000Z', workerId: 'old-worker', heartbeatAt: '2026-01-01T00:01:00.000Z',
      },
    },
  });
  globalThis.__ASSET_FACTORY_TEST_DB__ = db;
  const result = await requeueAssetQueueJob({
    jobId: 'job_requeue', tenantId: 'tenant-a', operatorId: 'operator-1', reason: 'provider fixed', resetAttempts: true,
  });
  const stored = db.store.assetFactoryQueue.job_requeue;
  assert.equal(result.configured, true);
  assert.equal(result.requeued, true);
  assert.equal(result.previousStatus, 'dead-lettered');
  assert.equal(stored.status, 'queued');
  assert.equal(stored.queueStatus, 'queued');
  assert.equal(stored.attempts, 0);
  assert.equal(stored.previousStatus, 'dead-lettered');
  assert.equal(stored.requeuedBy, 'operator-1');
  assert.equal(stored.requeueReason, 'provider fixed');
  assert.equal(stored.failureReason, null);
  assert.equal(stored.deadLetteredAt, null);
  assert.equal(stored.leaseId, null);
  assert.equal(stored.workerId, null);
}

async function testRejectsTenantMismatch() {
  const db = new MockDb({
    assetFactoryQueue: {
      job_other: { jobId: 'job_other', tenantId: 'tenant-b', status: 'dead-lettered', queueStatus: 'dead-lettered', attempts: 1 },
    },
  });
  globalThis.__ASSET_FACTORY_TEST_DB__ = db;
  const result = await requeueAssetQueueJob({ jobId: 'job_other', tenantId: 'tenant-a' });
  assert.equal(result.requeued, false);
  assert.equal(result.reason, 'Tenant mismatch.');
  assert.equal(db.store.assetFactoryQueue.job_other.status, 'dead-lettered');
}

async function testRejectsNonRequeueableStatus() {
  const db = new MockDb({
    assetFactoryQueue: {
      job_completed: { jobId: 'job_completed', tenantId: 'tenant-a', status: 'completed', queueStatus: 'completed', attempts: 1 },
    },
  });
  globalThis.__ASSET_FACTORY_TEST_DB__ = db;
  const result = await requeueAssetQueueJob({ jobId: 'job_completed', tenantId: 'tenant-a' });
  assert.equal(result.requeued, false);
  assert.match(result.reason, /not requeueable/);
  assert.equal(db.store.assetFactoryQueue.job_completed.status, 'completed');
}

async function testPaidLookingEnvironmentCannotCallProvider() {
  const names = [
    'ASSET_FACTORY_MEDIA_PROVIDER',
    'ASSET_FACTORY_ENABLE_PAID_MEDIA',
    'ASSET_FACTORY_PAID_APPROVAL_ID',
    'ASSET_FACTORY_PAID_MAX_COST_CENTS',
    'OPENAI_API_KEY',
    'REPLICATE_API_TOKEN',
    'ASSET_FACTORY_GRAPHICS_MODEL',
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  Object.assign(process.env, {
    ASSET_FACTORY_MEDIA_PROVIDER: 'replicate',
    ASSET_FACTORY_ENABLE_PAID_MEDIA: 'true',
    ASSET_FACTORY_PAID_APPROVAL_ID: 'weak-environment-only-approval',
    ASSET_FACTORY_PAID_MAX_COST_CENTS: '999999',
    OPENAI_API_KEY: 'test-key',
    REPLICATE_API_TOKEN: 'test-token',
    ASSET_FACTORY_GRAPHICS_MODEL: 'owner/model-version',
  });
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Paid provider network call must not occur');
  };

  try {
    const authorization = getPaidProviderAuthorization();
    assert.equal(authorization.requestedProvider, 'replicate');
    assert.equal(authorization.authorized, false);
    assert.equal(authorization.executionAuthorized, false);
    assert.equal(authorization.atomicLedgerConfigured, false);
    assert.equal(configuredProviderName(), 'local-proof');
    assert.equal(getProviderDiagnostics().selected, 'local-proof');
    assert.throws(() => assertPaidProviderRequestAuthorized(1), /atomic one-time authorization and consumption ledger/);

    const result = await renderWithConfiguredProvider(
      { jobId: 'no-spend-test', tenantId: 'tenant-a', prompt: 'moonlit orb artifact', type: 'graphic' },
      resolveAssetType('graphic')
    );
    assert.equal(result, null);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

try {
  testStripeEntitlementFromCheckoutSession();
  testStripeEntitlementFromSubscriptionPriceMetadata();
  testStripeEntitlementRequiresTenant();
  await testRequeueDeadLetteredJob();
  await testRejectsTenantMismatch();
  await testRejectsNonRequeueableStatus();
  await testPaidLookingEnvironmentCannotCallProvider();
  console.log('PASS Asset Factory core unit behavior and no-spend provider tests');
} finally {
  delete globalThis.__ASSET_FACTORY_TEST_DB__;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
