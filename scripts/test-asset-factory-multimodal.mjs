import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd().endsWith('assetfactory-studio')
  ? path.dirname(process.cwd())
  : process.cwd();
const studio = path.join(root, 'assetfactory-studio');

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Missing required file: ${absolutePath}`);
    process.exit(1);
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`Missing ${label}: ${needle}`);
    process.exit(1);
  }
}

const catalog = read('assetfactory-studio/lib/server/assetTypeCatalog.ts');
const renderer = read('assetfactory-studio/lib/server/assetRenderer.ts');
const generatedRoute = read('assetfactory-studio/app/api/generated-assets/[file]/route.ts');
const manifestRoute = read('assetfactory-studio/app/api/system/manifest/route.ts');
const validation = read('assetfactory-studio/lib/server/assetFactoryValidation.ts');
const providers = read('assetfactory-studio/lib/server/assetProviderAdapters.ts');
const policy = read('assetfactory-studio/lib/server/assetGenerationPolicy.ts');
const storagePaths = read('assetfactory-studio/lib/server/assetStoragePaths.ts');
const store = read('assetfactory-studio/lib/server/assetFactoryStore.ts');
const e2e = read('scripts/e2e-asset-factory.mjs');

for (const assetType of ['graphic', 'model3d', 'audio', 'bundle']) {
  assertIncludes(catalog, `canonicalType: '${assetType}'`, `${assetType} catalog definition`);
  assertIncludes(e2e, `type: '${assetType}'`, `${assetType} E2E case`);
}

for (const mode of ['svg-proof', 'spatial-renderer', 'audio-renderer', 'manifest-only']) {
  assertIncludes(renderer, mode, `${mode} renderer branch`);
}

for (const extension of ['svg', 'gltf', 'wav', 'json']) {
  assertIncludes(generatedRoute, `${extension}:`, `${extension} content type`);
}

for (const provider of ['local-proof', 'openai', 'replicate', 'fal', 'elevenlabs', 'stability']) {
  assertIncludes(providers, provider, `${provider} provider adapter diagnostic`);
}

assertIncludes(manifestRoute, 'supportedAssetTypes', 'system manifest supported asset types');
assertIncludes(manifestRoute, 'providers', 'system manifest provider diagnostics');
assertIncludes(validation, 'unsupported type', 'unsupported type validation');
assertIncludes(policy, 'estimatedCostCents', 'policy cost estimate');
assertIncludes(policy, 'maxDurationSeconds', 'audio duration guardrail');
assertIncludes(storagePaths, 'tenants/${tenantId}/jobs/${jobId}/v${version}', 'canonical storage path convention');
assertIncludes(store, 'status: \'rendering\'', 'rendering lifecycle status');
assertIncludes(store, 'status: \'failed\'', 'failed lifecycle status');
assertIncludes(store, 'storagePaths', 'storage path attachment');

if (!fs.existsSync(studio)) {
  console.error(`Missing studio directory: ${studio}`);
  process.exit(1);
}

console.log('PASS multimodal asset-factory static checks');
