import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(content, expected, label) {
  assert(
    content.includes(expected),
    `${label} must include ${JSON.stringify(expected)}`
  );
}

const readiness = read('LAUNCH_READINESS.md');
const readme = read('README.md');
const remoteSmoke = read('scripts/smoke-asset-factory-remote.mjs');
const emulatorSmoke = read('scripts/test-asset-factory-emulator.mjs');
const unitTests = read('scripts/test-asset-factory-units.mjs');
const studioPackage = read('assetfactory-studio/package.json');
const openapiRoute = read('assetfactory-studio/app/api/system/openapi/route.ts');
const stripeWebhookRoute = read('assetfactory-studio/app/api/stripe/webhooks/route.ts');
const stripeEntitlements = read('assetfactory-studio/lib/server/stripeEntitlements.ts');
const queueDispatcher = read('assetfactory-studio/lib/server/assetQueueDispatcher.ts');
const queueOps = read('assetfactory-studio/lib/server/assetQueueOps.ts');
const workerRoute = read('assetfactory-studio/app/api/worker/asset-queue/route.ts');
const adminQueueRoute = read('assetfactory-studio/app/api/admin/queue/route.ts');
const adminQueueRequeueRoute = read('assetfactory-studio/app/api/admin/queue/requeue/route.ts');
const dashboardRoute = read('assetfactory-studio/app/api/dashboard/route.ts');
const integrationContract = read('assetfactory-studio/app/api/system/integration-contract/route.ts');
const packageJson = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ci.yml');

const requiredReadinessSections = [
  'Status: **not production-ready yet**',
  '## Launch gates',
  '## Required environment groups',
  '## Smoke commands',
  '## Immediate next implementation order',
  'Firebase gate',
  'Auth gate',
  'Tenant isolation gate',
  'Billing gate',
  'Worker gate',
  'Website gate',
  'Production smoke gate',
];

for (const section of requiredReadinessSections) {
  assertIncludes(readiness, section, 'LAUNCH_READINESS.md');
}

const requiredReadmeReferences = [
  'Asset Factory is **not production-ready until `LAUNCH_READINESS.md` gates pass in staging and production**.',
  '`LAUNCH_READINESS.md`: current production launch gate checklist.',
  'npm run smoke:staging',
  'npm run smoke:prod',
  'npm run smoke:website',
];

for (const reference of requiredReadmeReferences) {
  assertIncludes(readme, reference, 'README.md');
}

const requiredPackageScripts = [
  'smoke:remote',
  'smoke:staging',
  'smoke:prod',
  'smoke:website',
  'test:launch-readiness',
];

for (const scriptName of requiredPackageScripts) {
  assert(
    packageJson.scripts?.[scriptName],
    `package.json scripts must define ${scriptName}`
  );
}

assertIncludes(studioPackage, 'node ../scripts/test-asset-factory-units.mjs', 'assetfactory-studio/package.json');

const requiredUnitTestCapabilities = [
  'buildStripeEntitlement',
  'testStripeEntitlementFromCheckoutSession',
  'testStripeEntitlementFromSubscriptionPriceMetadata',
  'testStripeEntitlementRequiresTenant',
  'requeueAssetQueueJob',
  'testRequeueDeadLetteredJob',
  'testRejectsTenantMismatch',
  'testRejectsNonRequeueableStatus',
  'PASS Asset Factory targeted unit behavior tests',
];

for (const capability of requiredUnitTestCapabilities) {
  assertIncludes(unitTests, capability, 'scripts/test-asset-factory-units.mjs');
}

const requiredSmokeCapabilities = [
  'assertPublicDiagnosticsRedacted',
  'assertContractRoutes',
  'assertOperatorQueueSurface',
  '/admin/queue',
  '/api/admin/queue?status=dead-lettered',
  'exerciseAssetType',
  'assertTenantIsolation',
  'assertCronSecret',
  'assertStripeWebhookRejectsUnsignedPayload',
  '/api/stripe/webhooks',
  'ASSET_FACTORY_BASE_URL',
  'ASSET_FACTORY_API_KEY',
  'ASSET_FACTORY_BEARER_TOKEN',
  'ASSET_FACTORY_TENANT_ID',
  'ASSET_FACTORY_OTHER_TENANT_ID',
  'ASSET_FACTORY_SMOKE_READONLY',
];

for (const capability of requiredSmokeCapabilities) {
  assertIncludes(remoteSmoke, capability, 'scripts/smoke-asset-factory-remote.mjs');
}

const requiredEmulatorSmokeCapabilities = [
  'queueRequeueRef',
  'emulator verified retry path',
  'previousStatus',
  'requeuedAt',
  'requeuedBy',
  'requeueReason',
  'failureReason: null',
  'leaseId: null',
  'Queue/Requeue emulator smoke test',
];

for (const capability of requiredEmulatorSmokeCapabilities) {
  assertIncludes(emulatorSmoke, capability, 'scripts/test-asset-factory-emulator.mjs');
}

const requiredOpenApiCapabilities = [
  'workerSecret',
  '/api/worker/asset-queue',
  'claim-and-run',
  'heartbeat',
  '/api/admin/queue',
  '/api/admin/queue/requeue',
  'resetAttempts',
  'allTenants',
  'queue failure/DLQ metrics',
];

for (const capability of requiredOpenApiCapabilities) {
  assertIncludes(openapiRoute, capability, 'assetfactory-studio/app/api/system/openapi/route.ts');
}

const requiredStripeEntitlementCapabilities = [
  'persistStripeEntitlement',
  'buildStripeEntitlement',
  "db.collection('assetFactoryStripeEvents')",
  "db.collection('tenants')",
  'assetFactoryPlan',
  'assetFactoryEntitlement',
  'runTransaction',
  'duplicate',
];

for (const capability of requiredStripeEntitlementCapabilities) {
  assertIncludes(stripeEntitlements, capability, 'assetfactory-studio/lib/server/stripeEntitlements.ts');
}

const requiredStripeWebhookCapabilities = [
  'verifyStripeSignature',
  'persistStripeEntitlement(event)',
  'stripe.webhook.duplicate',
  'entitlementApplied',
  'entitlementDuplicate',
];

for (const capability of requiredStripeWebhookCapabilities) {
  assertIncludes(stripeWebhookRoute, capability, 'assetfactory-studio/app/api/stripe/webhooks/route.ts');
}

const requiredQueueCapabilities = [
  'claimNextAssetQueueJob',
  'heartbeatAssetQueueJob',
  'completeAssetQueueJob',
  'failAssetQueueJob',
  'leaseExpiresAt',
  'maxAttempts',
  'dead-lettered',
  'ASSET_FACTORY_QUEUE_LEASE_SECONDS',
  'ASSET_FACTORY_QUEUE_MAX_ATTEMPTS',
];

for (const capability of requiredQueueCapabilities) {
  assertIncludes(queueDispatcher, capability, 'assetfactory-studio/lib/server/assetQueueDispatcher.ts');
}

const requiredQueueOpsCapabilities = [
  'readQueueOpsSummary',
  'requeueAssetQueueJob',
  'failedOrDeadLettered',
  'staleClaimed',
  'assetFactoryQueue',
  'dead-lettered',
  'retrying',
  'claimed',
  'REQUEUEABLE_STATUSES',
];

for (const capability of requiredQueueOpsCapabilities) {
  assertIncludes(queueOps, capability, 'assetfactory-studio/lib/server/assetQueueOps.ts');
}

const requiredWorkerRouteCapabilities = [
  'ASSET_FACTORY_WORKER_SECRET',
  'claim-and-run',
  'heartbeat',
  'complete',
  'fail',
  'materializeAsset',
  'queue.worker_claimed',
  'queue.worker_completed',
  'queue.worker_failed',
];

for (const capability of requiredWorkerRouteCapabilities) {
  assertIncludes(workerRoute, capability, 'assetfactory-studio/app/api/worker/asset-queue/route.ts');
}

const requiredAdminQueueCapabilities = [
  'authorizeAssetRequest(req, undefined, \'admin\')',
  'readQueueOpsSummary',
  'allTenants',
  'status',
  'limit',
];

for (const capability of requiredAdminQueueCapabilities) {
  assertIncludes(adminQueueRoute, capability, 'assetfactory-studio/app/api/admin/queue/route.ts');
}

const requiredAdminQueueRequeueCapabilities = [
  'authorizeAssetRequest(req, undefined, \'admin\')',
  'requeueAssetQueueJob',
  'queue.admin_requeued',
  'queue.admin_requeue_rejected',
  'resetAttempts',
  'allTenants',
];

for (const capability of requiredAdminQueueRequeueCapabilities) {
  assertIncludes(adminQueueRequeueRoute, capability, 'assetfactory-studio/app/api/admin/queue/requeue/route.ts');
}

const requiredDashboardQueueCapabilities = [
  'readQueueOpsSummary',
  'dlqSize',
  'queueFailures',
  'staleClaimedQueueItems',
  'queueByStatus',
];

for (const capability of requiredDashboardQueueCapabilities) {
  assertIncludes(dashboardRoute, capability, 'assetfactory-studio/app/api/dashboard/route.ts');
}

const requiredWorkerContract = [
  'asset-factory-worker',
  'x-asset-worker-secret',
  'POST /api/worker/asset-queue',
  'leases/retries/DLQ',
];

for (const capability of requiredWorkerContract) {
  assertIncludes(integrationContract, capability, 'assetfactory-studio/app/api/system/integration-contract/route.ts');
}

const requiredAdminQueueContract = [
  'GET /api/admin/queue',
  'POST /api/admin/queue/requeue',
  'allTenantQueue',
  'requeue',
  'dead-lettered',
  'stale-lease',
];

for (const capability of requiredAdminQueueContract) {
  assertIncludes(integrationContract, capability, 'assetfactory-studio/app/api/system/integration-contract/route.ts');
}

assertIncludes(workflow, 'Launch readiness checks', '.github/workflows/ci.yml');
assertIncludes(workflow, 'npm run test:launch-readiness', '.github/workflows/ci.yml');

const unsupportedClaims = [
  'Asset Factory is production-ready',
  'Asset Factory is fully production-ready',
  'Asset Factory is live in production',
  'public launch complete',
];

for (const claim of unsupportedClaims) {
  assert(
    !readme.includes(claim),
    `README.md contains unsupported launch claim: ${claim}`
  );
}

console.log('PASS launch readiness static checks');
