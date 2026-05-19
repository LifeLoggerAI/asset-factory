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

const readiness = read('LAUNCH_READINESS.md');
const manifestRoute = read('assetfactory-studio/app/api/system/manifest/route.ts');
const authGuard = read('assetfactory-studio/lib/server/assetAuth.ts');
const operationsRunbook = read('docs/OPERATIONS_RUNBOOK.md');
const studioEnvExample = read('assetfactory-studio/.env.example');

const requiredReadinessStrings = [
  'signed HS256 bearer/JWT',
  'ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true',
  'ASSET_FACTORY_JWT_HS256_SECRET',
  'ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH=false',
  'Do not require or document `ASSET_FACTORY_JWKS_URI` for production until RS256/JWKS verification is implemented and tested in `assetAuth.ts`.',
];

for (const expected of requiredReadinessStrings) {
  assertIncludes(readiness, expected, 'LAUNCH_READINESS.md');
}

const requiredManifestStrings = [
  "'ASSET_FACTORY_JWT_HS256_SECRET'",
  "'ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH'",
  'hs256JwtVerifierConfigured',
  'legacyHeaderAuthDisabled',
  'productionAuthReady',
  "configured('ASSET_FACTORY_JWT_HS256_SECRET')",
  "!enabled('ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH')",
];

for (const expected of requiredManifestStrings) {
  assertIncludes(manifestRoute, expected, 'assetfactory-studio/app/api/system/manifest/route.ts');
}

assert(
  !/requiredProductionEnv\s*=\s*\[[\s\S]*ASSET_FACTORY_JWKS_URI/.test(manifestRoute),
  'manifest requiredProductionEnv must not require ASSET_FACTORY_JWKS_URI until RS256/JWKS verification is implemented'
);

assertIncludes(authGuard, "const supportedJwtAlgorithms = new Set(['HS256']);", 'assetfactory-studio/lib/server/assetAuth.ts');
assertIncludes(authGuard, 'verifyHs256Signature', 'assetfactory-studio/lib/server/assetAuth.ts');
assertIncludes(operationsRunbook, 'The current synchronous Studio auth guard supports signed HS256 bearer tokens.', 'docs/OPERATIONS_RUNBOOK.md');
assertIncludes(studioEnvExample, 'ASSET_FACTORY_JWT_HS256_SECRET=', 'assetfactory-studio/.env.example');
assertIncludes(studioEnvExample, 'ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH=false', 'assetfactory-studio/.env.example');

console.log('PASS HS256 production readiness checks');
