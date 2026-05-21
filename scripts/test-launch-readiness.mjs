import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(content, expected, label) {
  assert(content.includes(expected), `${label} must include ${JSON.stringify(expected)}`);
}

function assertNotIncludes(content, forbidden, label) {
  assert(!content.includes(forbidden), `${label} must not include stale or forbidden text ${JSON.stringify(forbidden)}`);
}

const readiness = read('LAUNCH_READINESS.md');
const readme = read('README.md');
const completionLock = read('docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md');
const privacySafety = read('docs/PRIVACY_SAFETY_VERIFICATION.md');
const operationsRunbook = read('docs/OPERATIONS_RUNBOOK.md');
const completionChecklist = read('docs/COMPLETION_CHECKLIST.md');
const remoteSmoke = read('scripts/smoke-asset-factory-remote.mjs');
const emulatorSmoke = read('scripts/test-asset-factory-emulator.mjs');
const unitTests = read('scripts/test-asset-factory-units.mjs');
const authTests = read('scripts/test-asset-factory-auth.mjs');
const doctor = read('scripts/doctor.mjs');
const deployWorkflowCheck = read('scripts/check-deploy-workflow.mjs');
const releaseEvidenceCheck = read('scripts/check-release-evidence.mjs');
const latestReleaseEvidenceCheck = read('scripts/check-latest-release-evidence.mjs');
const releaseEvidenceTemplate = read('docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md');
const releaseEvidenceReadme = read('docs/release-evidence/README.md');
const studioPackage = read('assetfactory-studio/package.json');
const studioEnvExample = read('assetfactory-studio/.env.example');
const manifestRoute = read('assetfactory-studio/app/api/system/manifest/route.ts');
const healthRoute = read('assetfactory-studio/app/api/system/health/route.ts');
const healthAliasRoute = read('assetfactory-studio/app/api/health/route.ts');
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
const rootPackageJson = JSON.parse(read('package.json'));
const studioPackageJson = JSON.parse(studioPackage);
const ciWorkflow = read('.github/workflows/ci.yml');
const deployWorkflow = read('.github/workflows/deploy-asset-factory.yml');

const requiredReadinessText = [
  'Status: **repo-side hardening complete for current pass; live evidence required before production lock**.',
  'Canonical live tracker: GitHub issue #63.',
  '## Launch gates',
  '## Required environment groups',
  '## Preferred smoke path',
  'Actions -> Deploy Asset Factory -> Run workflow',
  'staging / deploy=false / smoke_mode=readonly',
  'production / deploy=true / smoke_mode=both',
  'Firebase gate',
  'Auth gate',
  'Tenant isolation gate',
  'Billing gate',
  'Worker gate',
  'Website gate',
  'Production smoke gate'
];

for (const expected of requiredReadinessText) assertIncludes(readiness, expected, 'LAUNCH_READINESS.md');

const syncedDocs = [
  ['README.md', readme],
  ['docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md', completionLock],
  ['docs/PRIVACY_SAFETY_VERIFICATION.md', privacySafety],
  ['docs/OPERATIONS_RUNBOOK.md', operationsRunbook],
  ['docs/COMPLETION_CHECKLIST.md', completionChecklist]
];

for (const [label, content] of syncedDocs) {
  assertIncludes(content, 'repo-side hardening is complete for the current pass', label);
  assertIncludes(content, 'live evidence', label);
}

const requiredReadmeReferences = [
  'Node.js 22.x for Studio/deploy workflow parity',
  'Java 21 for current Firebase emulator/CLI tooling',
  'nvm install 22',
  'Actions -> Deploy Asset Factory -> Run workflow',
  'npm run deploy:studio',
  'npm run smoke:staging',
  'npm run smoke:prod',
  'npm run smoke:website',
  'npm run doctor',
  'docs/ASSET_FACTORY_IMPLEMENTATION_AUDIT_PROMPT.md',
  'npm run test:implementation-audit-prompt'
];

for (const expected of requiredReadmeReferences) assertIncludes(readme, expected, 'README.md');

const staleText = [
  'Status: **not production-ready yet**',
  'nvm install 20.19.0',
  'nvm use 20.19.0',
  'Asset Factory is **not production-ready until `LAUNCH_READINESS.md` gates pass in staging and production**.'
];

for (const forbidden of staleText) {
  assertNotIncludes(readiness, forbidden, 'LAUNCH_READINESS.md');
  assertNotIncludes(readme, forbidden, 'README.md');
  assertNotIncludes(doctor, forbidden, 'scripts/doctor.mjs');
}

const forbiddenClaims = [
  '100% complete',
  'fully production ready',
  'fully wired',
  'fully verified',
  'system of systems complete',
  'all outputs delivered',
  'no roadmap remaining'
];

for (const claim of forbiddenClaims) {
  assertNotIncludes(readme, claim, 'README.md');
  assertNotIncludes(readiness, claim, 'LAUNCH_READINESS.md');
  assertNotIncludes(privacySafety, claim, 'docs/PRIVACY_SAFETY_VERIFICATION.md');
}

const requiredPackageScripts = [
  'doctor',
  'smoke:remote',
  'smoke:staging',
  'smoke:prod',
  'smoke:website',
  'test:launch-readiness',
  'test:completion-lock',
  'test:implementation-audit-prompt',
  'check:release-evidence',
  'check:release-evidence:latest',
  'check:deploy-workflow',
  'deploy:studio'
];

for (const scriptName of requiredPackageScripts) {
  assert(rootPackageJson.scripts?.[scriptName], `package.json scripts must define ${scriptName}`);
}

assertEqual(rootPackageJson.scripts?.['check:release-evidence'], 'node scripts/check-release-evidence.mjs', 'package.json check:release-evidence must validate a specific file');
assertEqual(rootPackageJson.scripts?.['check:release-evidence:latest'], 'node scripts/check-latest-release-evidence.mjs', 'package.json check:release-evidence:latest must validate newest evidence file');
assertEqual(rootPackageJson.engines?.node, '>=20.19.0', 'root package.json must keep Node >=20.19.0 compatibility floor');
assertEqual(rootPackageJson.engines?.npm, '>=10.8.0', 'root package.json must require npm >=10.8.0');
assertEqual(studioPackageJson.engines?.node, '22', 'assetfactory-studio/package.json must require Node 22');
assertEqual(studioPackageJson.engines?.npm, '>=10.8.0', 'assetfactory-studio/package.json must require npm >=10.8.0');

const requiredDoctorCapabilities = [
  'MIN_NODE',
  'RECOMMENDED_NODE',
  '22',
  'node version is supported',
  'NPM_CONFIG_PREFIX',
  'root test:launch-readiness script exists',
  'studio test script exists',
  'local HEAD matches origin/main',
  'Recommended recovery commands',
  'nvm install'
];

for (const expected of requiredDoctorCapabilities) assertIncludes(doctor, expected, 'scripts/doctor.mjs');
assertNotIncludes(doctor, 'git reset --hard origin/main', 'scripts/doctor.mjs');

const requiredDeployWorkflowText = [
  'Use Node.js 22',
  "node-version: '22'",
  'Use Java 21 for Firebase CLI',
  "java-version: '21'",
  'npm run deploy:studio',
  'npm run smoke:website',
  'npm run smoke:staging',
  'npm run smoke:prod',
  'Upload release evidence'
];

for (const expected of requiredDeployWorkflowText) assertIncludes(deployWorkflow, expected, '.github/workflows/deploy-asset-factory.yml');
for (const expected of requiredDeployWorkflowText.slice(0, 6)) assertIncludes(deployWorkflowCheck, expected, 'scripts/check-deploy-workflow.mjs');

assertIncludes(ciWorkflow, 'Launch readiness checks', '.github/workflows/ci.yml');
assertIncludes(ciWorkflow, 'npm run test:launch-readiness', '.github/workflows/ci.yml');
assertIncludes(ciWorkflow, 'Use Java 21 for Firebase emulators', '.github/workflows/ci.yml');
assertIncludes(ciWorkflow, 'Use Node.js 22', '.github/workflows/ci.yml');

const requiredReleaseEvidenceFields = [
  'staging_smoke_run',
  'production_smoke_run',
  'tenant_isolation_verified',
  'provider_generation_verified',
  'worker_queue_verified',
  'stripe_entitlements_verified',
  'observability_verified',
  'rollback_sha',
  'placeholder angle-bracket content remains in evidence file',
  'exactly one release decision must be selected with [x]',
  'decision rationale must be filled'
];

for (const expected of requiredReleaseEvidenceFields) assertIncludes(releaseEvidenceCheck, expected, 'scripts/check-release-evidence.mjs');

const requiredLatestReleaseEvidenceCapabilities = [
  'docs/release-evidence',
  'Checking latest release evidence',
  'scripts/check-release-evidence.mjs',
  'no markdown evidence files found under docs/release-evidence'
];
for (const expected of requiredLatestReleaseEvidenceCapabilities) assertIncludes(latestReleaseEvidenceCheck, expected, 'scripts/check-latest-release-evidence.mjs');

const requiredReleaseEvidenceTemplateCapabilities = [
  'docs/release-evidence/YYYY-MM-DD-environment.md',
  'Do not literally run a command with `<file>` in it',
  'npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md',
  'npm run check:release-evidence:latest'
];
for (const expected of requiredReleaseEvidenceTemplateCapabilities) assertIncludes(releaseEvidenceTemplate, expected, 'docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md');

const requiredReleaseEvidenceReadmeCapabilities = [
  'cp docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md docs/release-evidence/YYYY-MM-DD-environment.md',
  'npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md',
  'npm run check:release-evidence:latest',
  'Do not literally run a command containing `docs/release-evidence/<file>.md`',
  'Bash treats `<file>` as input redirection'
];
for (const expected of requiredReleaseEvidenceReadmeCapabilities) assertIncludes(releaseEvidenceReadme, expected, 'docs/release-evidence/README.md');

const requiredStudioEnvCapabilities = [
  'ASSET_FACTORY_REQUIRE_AUTH=false',
  'ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=false',
  'ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH=false',
  'ASSET_FACTORY_JWT_HS256_SECRET=',
  'ASSET_FACTORY_JWT_ISSUER=',
  'ASSET_FACTORY_JWT_AUDIENCE=',
  'ASSET_FACTORY_AUDIENCE=',
  'ASSET_FACTORY_TENANT_CLAIM=tenantId',
  'ASSET_FACTORY_ROLE_CLAIM=roles',
  'Production should prefer signed bearer tokens'
];

for (const expected of requiredStudioEnvCapabilities) assertIncludes(studioEnvExample, expected, 'assetfactory-studio/.env.example');

const requiredManifestCapabilities = [
  'productionReadiness',
  'ready-for-smoke',
  'not-ready-for-smoke',
  'requiredProductionEnv,',
  'rollbackWorkflow: true',
  'approvals: true',
  'versioningWorkflow: true',
  'workflows: {',
  'generate: true',
  'materialize: true',
  'publish: true',
  'approve: true',
  'rollback: true',
  'createVersion: true'
];

for (const expected of requiredManifestCapabilities) assertIncludes(manifestRoute, expected, 'assetfactory-studio/app/api/system/manifest/route.ts');
assert(!/rollbackWorkflow:\s*['"]contract-only['"]/.test(manifestRoute), 'manifest route must not report rollback as contract-only');
assert(!/approvals:\s*['"]contract-only['"]/.test(manifestRoute), 'manifest route must not report approvals as contract-only');

const requiredHealthCapabilities = [
  'asset-factory-studio',
  'productionReadiness'
];
for (const expected of requiredHealthCapabilities) assertIncludes(healthRoute, expected, 'assetfactory-studio/app/api/system/health/route.ts');
assertIncludes(healthAliasRoute, '../system/health/route', 'assetfactory-studio/app/api/health/route.ts');

const requiredUnitTestCapabilities = [
  'buildStripeEntitlement',
  'testStripeEntitlementFromCheckoutSession',
  'testStripeEntitlementFromSubscriptionPriceMetadata',
  'testStripeEntitlementRequiresTenant',
  'requeueAssetQueueJob',
  'testRequeueDeadLetteredJob',
  'testRejectsTenantMismatch',
  'testRejectsNonRequeueableStatus',
  'PASS Asset Factory targeted unit behavior tests'
];
for (const expected of requiredUnitTestCapabilities) assertIncludes(unitTests, expected, 'scripts/test-asset-factory-units.mjs');

const requiredAuthTestCapabilities = [
  'ASSET_FACTORY_REQUIRE_AUTH',
  'ASSET_FACTORY_REQUIRE_JWT_SIGNATURE',
  'ASSET_FACTORY_JWT_HS256_SECRET',
  'ASSET_FACTORY_JWT_ISSUER',
  'ASSET_FACTORY_JWT_AUDIENCE',
  'ASSET_FACTORY_TENANT_CLAIM',
  'ASSET_FACTORY_ROLE_CLAIM',
  'Tenant mismatch',
  'Role publisher required',
  'JWT is expired'
];
for (const expected of requiredAuthTestCapabilities) assertIncludes(authTests, expected, 'scripts/test-asset-factory-auth.mjs');

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
  'ASSET_FACTORY_SMOKE_READONLY'
];
for (const expected of requiredSmokeCapabilities) assertIncludes(remoteSmoke, expected, 'scripts/smoke-asset-factory-remote.mjs');

const requiredEmulatorSmokeCapabilities = [
  'queueRequeueRef',
  'emulator verified retry path',
  'previousStatus',
  'requeuedAt',
  'requeuedBy',
  'requeueReason',
  'failureReason: null',
  'leaseId: null',
  'Queue/Requeue emulator smoke test'
];
for (const expected of requiredEmulatorSmokeCapabilities) assertIncludes(emulatorSmoke, expected, 'scripts/test-asset-factory-emulator.mjs');

const requiredOpenApiCapabilities = [
  'workerSecret',
  '/api/worker/asset-queue',
  'claim-and-run',
  'heartbeat',
  '/api/admin/queue',
  '/api/admin/queue/requeue',
  'resetAttempts',
  'allTenants',
  'queue failure/DLQ metrics'
];
for (const expected of requiredOpenApiCapabilities) assertIncludes(openapiRoute, expected, 'assetfactory-studio/app/api/system/openapi/route.ts');

const requiredStripeEntitlementCapabilities = [
  'persistStripeEntitlement',
  'buildStripeEntitlement',
  "db.collection('assetFactoryStripeEvents')",
  "db.collection('tenants')",
  'assetFactoryPlan',
  'assetFactoryEntitlement',
  'runTransaction',
  'duplicate'
];
for (const expected of requiredStripeEntitlementCapabilities) assertIncludes(stripeEntitlements, expected, 'assetfactory-studio/lib/server/stripeEntitlements.ts');

const requiredStripeWebhookCapabilities = [
  'verifyStripeSignature',
  'persistStripeEntitlement(event)',
  'stripe.webhook.duplicate',
  'entitlementApplied',
  'entitlementDuplicate'
];
for (const expected of requiredStripeWebhookCapabilities) assertIncludes(stripeWebhookRoute, expected, 'assetfactory-studio/app/api/stripe/webhooks/route.ts');

const requiredQueueCapabilities = [
  'claimNextAssetQueueJob',
  'heartbeatAssetQueueJob',
  'completeAssetQueueJob',
  'failAssetQueueJob',
  'leaseExpiresAt',
  'maxAttempts',
  'dead-lettered',
  'ASSET_FACTORY_QUEUE_LEASE_SECONDS',
  'ASSET_FACTORY_QUEUE_MAX_ATTEMPTS'
];
for (const expected of requiredQueueCapabilities) assertIncludes(queueDispatcher, expected, 'assetfactory-studio/lib/server/assetQueueDispatcher.ts');

const requiredQueueOpsCapabilities = [
  'readQueueOpsSummary',
  'requeueAssetQueueJob',
  'failedOrDeadLettered',
  'staleClaimed',
  'assetFactoryQueue',
  'dead-lettered',
  'retrying',
  'claimed',
  'REQUEUEABLE_STATUSES'
];
for (const expected of requiredQueueOpsCapabilities) assertIncludes(queueOps, expected, 'assetfactory-studio/lib/server/assetQueueOps.ts');

const requiredWorkerRouteCapabilities = [
  'ASSET_FACTORY_WORKER_SECRET',
  'claim-and-run',
  'heartbeat',
  'complete',
  'fail',
  'materializeAsset',
  'queue.worker_claimed',
  'queue.worker_completed',
  'queue.worker_failed'
];
for (const expected of requiredWorkerRouteCapabilities) assertIncludes(workerRoute, expected, 'assetfactory-studio/app/api/worker/asset-queue/route.ts');

const requiredAdminQueueCapabilities = [
  'authorizeAssetRequest(req, undefined, \'admin\')',
  'readQueueOpsSummary',
  'allTenants',
  'status',
  'limit'
];
for (const expected of requiredAdminQueueCapabilities) assertIncludes(adminQueueRoute, expected, 'assetfactory-studio/app/api/admin/queue/route.ts');

const requiredAdminQueueRequeueCapabilities = [
  'authorizeAssetRequest(req, undefined, \'admin\')',
  'requeueAssetQueueJob',
  'queue.admin_requeued',
  'queue.admin_requeue_rejected',
  'resetAttempts',
  'allTenants'
];
for (const expected of requiredAdminQueueRequeueCapabilities) assertIncludes(adminQueueRequeueRoute, expected, 'assetfactory-studio/app/api/admin/queue/requeue/route.ts');

const requiredDashboardQueueCapabilities = [
  'readQueueOpsSummary',
  'dlqSize',
  'queueFailures',
  'staleClaimedQueueItems',
  'queueByStatus'
];
for (const expected of requiredDashboardQueueCapabilities) assertIncludes(dashboardRoute, expected, 'assetfactory-studio/app/api/dashboard/route.ts');

const requiredContracts = [
  'asset-factory-worker',
  'x-asset-worker-secret',
  'POST /api/worker/asset-queue',
  'leases/retries/DLQ',
  'GET /api/admin/queue',
  'POST /api/admin/queue/requeue',
  'allTenantQueue',
  'requeue',
  'dead-lettered',
  'stale-lease'
];
for (const expected of requiredContracts) assertIncludes(integrationContract, expected, 'assetfactory-studio/app/api/system/integration-contract/route.ts');

console.log('PASS launch readiness static checks');
