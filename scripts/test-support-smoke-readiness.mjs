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

const remoteSmoke = read('scripts/smoke-asset-factory-remote.mjs');
const openapiRoute = read('assetfactory-studio/app/api/system/openapi/route.ts');
const accountDataRoute = read('assetfactory-studio/app/api/support/account-data/route.ts');
const accountDeletionRoute = read('assetfactory-studio/app/api/support/account-deletion/route.ts');

const requiredSmokeCoverage = [
  'assertSupportWorkflows',
  '/api/support/account-data',
  '/api/support/account-deletion',
  'ASSET_FACTORY_OTHER_BEARER_TOKEN',
  'pending-manual-review',
  'account data export returned unexpected payload',
  'account deletion request returned unexpected payload',
  'two-token support tenant isolation smoke',
];

for (const expected of requiredSmokeCoverage) {
  assertIncludes(remoteSmoke, expected, 'scripts/smoke-asset-factory-remote.mjs');
}

assertIncludes(openapiRoute, '/api/support/account-data', 'assetfactory-studio/app/api/system/openapi/route.ts');
assertIncludes(openapiRoute, '/api/support/account-deletion', 'assetfactory-studio/app/api/system/openapi/route.ts');
assertIncludes(accountDataRoute, 'account.exported', 'assetfactory-studio/app/api/support/account-data/route.ts');
assertIncludes(accountDeletionRoute, 'account.deletion_requested', 'assetfactory-studio/app/api/support/account-deletion/route.ts');
assertIncludes(accountDeletionRoute, 'No tenant data was deleted automatically.', 'assetfactory-studio/app/api/support/account-deletion/route.ts');

console.log('PASS support workflow smoke readiness checks');
