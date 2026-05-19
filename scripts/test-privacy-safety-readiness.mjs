import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(content, expected, label) {
  assert(content.includes(expected), `${label} must include ${JSON.stringify(expected)}`);
}

const privacySafety = read('docs/PRIVACY_SAFETY_VERIFICATION.md');
const launchReadiness = read('LAUNCH_READINESS.md');
const operationsRunbook = read('docs/OPERATIONS_RUNBOOK.md');
const openapiRoute = read('assetfactory-studio/app/api/system/openapi/route.ts');
const accountDataRoute = read('assetfactory-studio/app/api/support/account-data/route.ts');
const accountDeletionRoute = read('assetfactory-studio/app/api/support/account-deletion/route.ts');

const requiredPrivacySafetyStrings = [
  'ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true',
  'ASSET_FACTORY_JWT_HS256_SECRET=<secret manager only>',
  'ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH=false',
  'Account export and deletion-request routes exist',
  'support data',
  'support, and admin actions',
  'Do not configure `ASSET_FACTORY_JWKS_URI` as a production dependency unless RS256/JWKS verification is implemented and tested in `assetAuth.ts`.',
];

for (const expected of requiredPrivacySafetyStrings) {
  assertIncludes(privacySafety, expected, 'docs/PRIVACY_SAFETY_VERIFICATION.md');
}

assert(
  !/Required production settings[\s\S]*ASSET_FACTORY_JWKS_URI=<configured>/.test(privacySafety),
  'docs/PRIVACY_SAFETY_VERIFICATION.md must not list ASSET_FACTORY_JWKS_URI as a required production setting'
);

assert(
  !/Account deletion\/export\/support \| Blocked \| Account deletion\/export\/support workflows and route copy need final review\./.test(privacySafety),
  'docs/PRIVACY_SAFETY_VERIFICATION.md must not claim support routes are missing after account-data/account-deletion routes landed'
);

const requiredSupportRouteStrings = [
  '/api/support/account-data',
  '/api/support/account-deletion',
  'account.exported',
  'account.deletion_requested',
  'pending-manual-review',
];

for (const expected of requiredSupportRouteStrings) {
  assert(
    launchReadiness.includes(expected) || operationsRunbook.includes(expected) || openapiRoute.includes(expected) || accountDataRoute.includes(expected) || accountDeletionRoute.includes(expected),
    `support workflow evidence must include ${JSON.stringify(expected)}`
  );
}

assertIncludes(accountDataRoute, "authorizeAssetRequest(req, undefined, 'admin')", 'assetfactory-studio/app/api/support/account-data/route.ts');
assertIncludes(accountDeletionRoute, "authorizeAssetRequest(req, undefined, 'admin')", 'assetfactory-studio/app/api/support/account-deletion/route.ts');
assertIncludes(accountDeletionRoute, 'pending-manual-review', 'assetfactory-studio/app/api/support/account-deletion/route.ts');

console.log('PASS privacy/safety readiness static checks');
