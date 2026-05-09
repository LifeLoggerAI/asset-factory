import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
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

const { buildStripeEntitlement } = await import(pathToFileURL(stripeModulePath).href);
const { requeueAssetQueueJob } = await import(pathToFileURL(queueModulePath).href);

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

try {
  testStripeEntitlementFromCheckoutSession();
  testStripeEntitlementFromSubscriptionPriceMetadata();
  testStripeEntitlementRequiresTenant();
  await testRequeueDeadLetteredJob();
  await testRejectsTenantMismatch();
  await testRejectsNonRequeueableStatus();
  console.log('PASS Asset Factory targeted unit behavior tests');
} finally {
  delete globalThis.__ASSET_FACTORY_TEST_DB__;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
