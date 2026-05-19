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

const studioPackage = JSON.parse(read('assetfactory-studio/package.json'));
const nextConfig = read('assetfactory-studio/next.config.mjs');
const studioFirebase = JSON.parse(read('assetfactory-studio/firebase.json'));
const healthRoute = read('assetfactory-studio/app/api/system/health/route.ts');

assert(
  ['20', '22', '24'].includes(String(studioPackage.engines?.node)),
  'assetfactory-studio/package.json engines.node must be an exact Firebase Functions runtime: 20, 22, or 24'
);
assert(
  String(studioPackage.engines?.node) === '22',
  'assetfactory-studio/package.json should deploy SSR on Node 22'
);

assertIncludes(nextConfig, 'turbopack', 'assetfactory-studio/next.config.mjs');
assertIncludes(nextConfig, 'root: studioRoot', 'assetfactory-studio/next.config.mjs');
assert(
  !nextConfig.includes('destination:') && !nextConfig.includes('https://urai-4dc1d.web.app/api/:path*'),
  'assetfactory-studio/next.config.mjs must not rewrite /api routes back to the deployed host'
);

assert(
  studioFirebase?.hosting?.source === '.',
  'assetfactory-studio/firebase.json hosting.source must point at the Studio source for Firebase framework deploys'
);
assert(
  studioFirebase?.apphosting?.backend?.id === 'assetfactory-studio',
  'assetfactory-studio/firebase.json must preserve the assetfactory-studio App Hosting backend id'
);

const publicHealthBranch = healthRoute.split('if (!fullDiagnostics)')[1]?.split('try {')[0] ?? '';
assertIncludes(healthRoute, 'const publicPayload = {', 'assetfactory-studio/app/api/system/health/route.ts');
assertIncludes(publicHealthBranch, 'return NextResponse.json(publicPayload);', 'public health branch');
assert(
  !publicHealthBranch.includes('readJobs()') && !publicHealthBranch.includes('listAssets()'),
  'public /api/system/health must not require persistence reads before returning 200'
);
assertIncludes(healthRoute, 'requireConfiguredAssetFactoryApiKey(req)', 'assetfactory-studio/app/api/system/health/route.ts');
assertIncludes(healthRoute, 'counts:', 'assetfactory-studio/app/api/system/health/route.ts');

console.log('PASS Studio deploy readiness checks');
