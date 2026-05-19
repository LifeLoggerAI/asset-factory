import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const studioRoot = path.join(root, 'assetfactory-studio');
const studioNodeModules = path.join(studioRoot, 'node_modules');
const typescriptPath = path.join(studioNodeModules, 'typescript', 'lib', 'typescript.js');

if (!fs.existsSync(typescriptPath)) {
  console.error(`Missing TypeScript dependency at ${typescriptPath}. Run npm --prefix assetfactory-studio install first.`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-units-'));
const compiledDir = path.join(tmpDir, 'compiled');
fs.mkdirSync(path.join(compiledDir, 'lib', 'server'), { recursive: true });

function compileTsModule(relativePath, patches = []) {
  const sourcePath = path.join(studioRoot, relativePath);
  let source = fs.readFileSync(sourcePath, 'utf8');
  for (const [from, to] of patches) source = source.replace(from, to);
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

fs.writeFileSync(path.join(compiledDir, 'lib', 'server', 'firebaseAdmin.mjs'), 'export function getAdminDb() { return globalThis.__ASSET_FACTORY_TEST_DB__ ?? null; }\n');

const stripeModulePath = compileTsModule('lib/server/stripeEntitlements.ts', [["import { getAdminDb } from './firebaseAdmin';", "import { getAdminDb } from './firebaseAdmin.mjs';"]]);
const queueModulePath = compileTsModule('lib/server/assetQueueOps.ts', [["import { getAdminDb } from './firebaseAdmin';", "import { getAdminDb } from './firebaseAdmin.mjs';"]]);
const catalogModulePath = compileTsModule('lib/server/assetTypeCatalog.ts');
compileTsModule('lib/server/assetFactoryValidation.ts', [["import { isSupportedAssetType, supportedAssetTypeNames } from './assetTypeCatalog';", "import { isSupportedAssetType, supportedAssetTypeNames } from './assetTypeCatalog.mjs';"]]);
compileTsModule('lib/server/assetProviderAdapters.ts', [["import type { AssetRendererInput, AssetRendererResult, CanonicalAssetType } from './assetFactoryTypes';", "type CanonicalAssetType = 'graphic' | 'model3d' | 'audio' | 'bundle'; type AssetRendererInput = Record<string, unknown>; type AssetRendererResult = Record<string, unknown>;"]]);
const providerRuntimeModulePath = compileTsModule('lib/server/assetProviderRuntime.ts', [
  ["import type { GenerateRequest } from './assetFactoryValidation';", "type GenerateRequest = { jobId: string; tenantId?: string; prompt: string; type: string; size?: { width?: number; height?: number }; metadata?: Record<string, unknown> };"] ,
  ["import type { AssetTypeDefinition } from './assetTypeCatalog';", "type AssetTypeDefinition = { canonicalType: 'graphic' | 'model3d' | 'audio' | 'bundle'; extension: string };"] ,
  ["import { configuredProviderName, type AssetProviderName } from './assetProviderAdapters';", "import { configuredProviderName } from './assetProviderAdapters.mjs'; type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability';"],
]);

const { buildStripeEntitlement } = await import(pathToFileURL(stripeModulePath).href);
const { requeueAssetQueueJob } = await import(pathToFileURL(queueModulePath).href);
const { resolveAssetType } = await import(pathToFileURL(catalogModulePath).href);
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

  data() {
    return this._data;
  }
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

  doc(id) {
    return new MockDocRef(this, id);
  }
}

class MockTransaction {
  constructor(store) {
    this.store = store;
  }

  async get(ref) {
    return new MockDocSnapshot(ref.id, this.store[ref.collectionName]?.[ref.id]);
  }

  set(ref, patch, options) {
    this.store[ref.collectionName] ??= {};
    const existing = this.store[ref.collectionName][ref.id] ?? {};
    this.store[ref.collectionName][ref.id] = options?.merge ? { ...existing, ...patch } : patch;
  }
}

class MockDb {
  constructor(seed = {}) {
    this.store = seed;
  }

  collection(collectionName) {
    return new MockCollection(collectionName, this.store);
  }

  async runTransaction(callback) {
    return callback(new MockTransaction(this.store));
  }
}

async function testRequeueDeadLetteredJob() {
  const db = new MockDb({
    assetFactoryQueue: {
      job_requeue: {
        jobId: 'job_requeue',
        tenantId: 'tenant-a',
        status: 'dead-lettered',
        queueStatus: 'dead-lettered',
        attempts: 3,
        maxAttempts: 3,
        failureReason: 'provider failed',
        deadLetteredAt: '2026-01-01T00:00:00.000Z',
        leaseId: 'old-lease',
        leaseExpiresAt: '2026-01-01T00:05:00.000Z',
        workerId: 'old-worker',
        heartbeatAt: '2026-01-01T00:01:00.000Z',
      },
    },
  });
  globalThis.__ASSET_FACTORY_TEST_DB__ = db;

  const result = await requeueAssetQueueJob({
    jobId: 'job_requeue',
    tenantId: 'tenant-a',
    operatorId: 'operator-1',
    reason: 'provider fixed',
    resetAttempts: true,
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
      job_other: {
        jobId: 'job_other',
        tenantId: 'tenant-b',
        status: 'dead-lettered',
        queueStatus: 'dead-lettered',
        attempts: 1,
      },
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
      job_completed: {
        jobId: 'job_completed',
        tenantId: 'tenant-a',
        status: 'completed',
        queueStatus: 'completed',
        attempts: 1,
      },
    },
  });
  globalThis.__ASSET_FACTORY_TEST_DB__ = db;

  const result = await requeueAssetQueueJob({ jobId: 'job_completed', tenantId: 'tenant-a' });

  assert.equal(result.requeued, false);
  assert.match(result.reason, /not requeueable/);
  assert.equal(db.store.assetFactoryQueue.job_completed.status, 'completed');
}

async function testReplicateProviderPollsStatusWithGetAndFetchesPublicArtifact() {
  const originalFetch = globalThis.fetch;
  const originalProvider = process.env.ASSET_FACTORY_MEDIA_PROVIDER;
  const originalToken = process.env.REPLICATE_API_TOKEN;
  const originalModel = process.env.ASSET_FACTORY_GRAPHICS_MODEL;
  const originalMaxBytes = process.env.ASSET_FACTORY_PROVIDER_MAX_BYTES;
  const calls = [];

  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'replicate';
  process.env.REPLICATE_API_TOKEN = 'test-token';
  process.env.ASSET_FACTORY_GRAPHICS_MODEL = 'owner/model-version';
  process.env.ASSET_FACTORY_PROVIDER_MAX_BYTES = '1024';

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET' });
    if (String(url) === 'https://api.replicate.com/v1/predictions') {
      assert.equal(options.method, 'POST');
      return new Response(JSON.stringify({ status: 'starting', urls: { get: 'https://api.replicate.com/v1/predictions/pred-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url) === 'https://api.replicate.com/v1/predictions/pred-1') {
      assert.equal(options.method, 'GET');
      return new Response(JSON.stringify({ id: 'pred-1', status: 'succeeded', output: 'https://cdn.example.com/out.png' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url) === 'https://cdn.example.com/out.png') {
      assert.equal(options.method ?? 'GET', 'GET');
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '4' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await renderWithConfiguredProvider(
      { jobId: 'provider-test', tenantId: 'tenant-a', prompt: 'moonlit orb artifact', type: 'graphic' },
      resolveAssetType('graphic')
    );
    assert.equal(result.extension, 'png');
    assert.equal(result.assetMimeType, 'image/png');
    assert.equal(result.assetBuffer.byteLength, 4);
    assert.deepEqual(calls.map((call) => call.method), ['POST', 'GET', 'GET']);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.ASSET_FACTORY_MEDIA_PROVIDER = originalProvider;
    process.env.REPLICATE_API_TOKEN = originalToken;
    process.env.ASSET_FACTORY_GRAPHICS_MODEL = originalModel;
    process.env.ASSET_FACTORY_PROVIDER_MAX_BYTES = originalMaxBytes;
  }
}

async function testProviderArtifactRejectsPrivateUrls() {
  const originalFetch = globalThis.fetch;
  const originalProvider = process.env.ASSET_FACTORY_MEDIA_PROVIDER;
  const originalToken = process.env.REPLICATE_API_TOKEN;
  const originalModel = process.env.ASSET_FACTORY_GRAPHICS_MODEL;

  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'replicate';
  process.env.REPLICATE_API_TOKEN = 'test-token';
  process.env.ASSET_FACTORY_GRAPHICS_MODEL = 'owner/model-version';

  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === 'https://api.replicate.com/v1/predictions') {
      return new Response(JSON.stringify({ status: 'starting', urls: { get: 'https://api.replicate.com/v1/predictions/pred-2' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url) === 'https://api.replicate.com/v1/predictions/pred-2') {
      assert.equal(options.method, 'GET');
      return new Response(JSON.stringify({ id: 'pred-2', status: 'succeeded', output: 'http://127.0.0.1/internal.png' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await assert.rejects(
      () => renderWithConfiguredProvider(
        { jobId: 'private-url-test', tenantId: 'tenant-a', prompt: 'moonlit orb artifact', type: 'graphic' },
        resolveAssetType('graphic')
      ),
      /private or local host/
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.ASSET_FACTORY_MEDIA_PROVIDER = originalProvider;
    process.env.REPLICATE_API_TOKEN = originalToken;
    process.env.ASSET_FACTORY_GRAPHICS_MODEL = originalModel;
  }
}

try {
  testStripeEntitlementFromCheckoutSession();
  testStripeEntitlementFromSubscriptionPriceMetadata();
  testStripeEntitlementRequiresTenant();
  await testRequeueDeadLetteredJob();
  await testRejectsTenantMismatch();
  await testRejectsNonRequeueableStatus();
  await testReplicateProviderPollsStatusWithGetAndFetchesPublicArtifact();
  await testProviderArtifactRejectsPrivateUrls();
  console.log('PASS Asset Factory targeted unit behavior tests');
} finally {
  delete globalThis.__ASSET_FACTORY_TEST_DB__;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
