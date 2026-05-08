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

const requiredSmokeCapabilities = [
  'assertPublicDiagnosticsRedacted',
  'assertContractRoutes',
  'exerciseAssetType',
  'assertTenantIsolation',
  'assertCronSecret',
  'assertStripeWebhookRejectsUnsignedPayload',
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
