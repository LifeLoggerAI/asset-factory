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
const generateRoute = read('assetfactory-studio/app/api/generate/route.ts');
const materializeRoute = read('assetfactory-studio/app/api/jobs/[jobId]/materialize/route.ts');
const manifestRoute = read('assetfactory-studio/app/api/system/manifest/route.ts');
const validation = read('assetfactory-studio/lib/server/assetFactoryValidation.ts');
const providers = read('assetfactory-studio/lib/server/assetProviderAdapters.ts');
const providerRuntime = read('assetfactory-studio/lib/server/assetProviderRuntime.ts');
const videoProviderRuntime = read('assetfactory-studio/lib/server/assetVideoProviderRuntime.ts');
const videoTransactions = read('assetfactory-studio/lib/server/assetVideoTransactions.ts');
const videoPackage = read('assetfactory-studio/lib/server/assetVideoPackage.ts');
const policy = read('assetfactory-studio/lib/server/assetGenerationPolicy.ts');
const billing = read('assetfactory-studio/lib/server/assetBilling.ts');
const storagePaths = read('assetfactory-studio/lib/server/assetStoragePaths.ts');
const cloudStore = read('assetfactory-studio/lib/server/cloudAssetFactoryStore.ts');
const backend = read('assetfactory-studio/lib/server/assetBackend.ts');
const queue = read('assetfactory-studio/lib/server/assetQueue.ts');
const queueDispatcher = read('assetfactory-studio/lib/server/assetQueueDispatcher.ts');
const auth = read('assetfactory-studio/lib/server/assetAuth.ts');
const store = read('assetfactory-studio/lib/server/assetFactoryStore.ts');
const e2e = read('scripts/e2e-asset-factory.mjs');
const packageCli = read('scripts/build-waiting-room-video-package.mjs');
const previewEncoder = read('scripts/render-waiting-room-preview.mjs');
const dayZeroAnimatic = read('launch-films/waiting-room/day-00/the-door.animatic.json');

for (const assetType of ['graphic', 'model3d', 'audio', 'video', 'bundle']) {
  assertIncludes(catalog, `canonicalType: '${assetType}'`, `${assetType} catalog definition`);
  assertIncludes(e2e, `type: '${assetType}'`, `${assetType} E2E case`);
}

for (const mode of ['svg-proof', 'spatial-renderer', 'audio-renderer', 'video-animatic', 'manifest-only']) {
  assertIncludes(renderer, mode, `${mode} renderer branch`);
}

for (const extension of ['svg', 'gltf', 'wav', 'animatic', 'mp4', 'webm', 'mov', 'json']) {
  assertIncludes(generatedRoute, `${extension}:`, `${extension} content type`);
}

for (const provider of ['local-proof', 'openai', 'replicate', 'fal', 'elevenlabs', 'stability']) {
  assertIncludes(providers, provider, `${provider} provider adapter diagnostic`);
}

for (const providerRuntimeMarker of ['OPENAI_API_KEY', 'REPLICATE_API_TOKEN', 'ELEVENLABS_API_KEY', 'STABILITY_API_KEY', 'FAL_KEY']) {
  assertIncludes(providerRuntime, providerRuntimeMarker, `${providerRuntimeMarker} provider runtime support`);
}

for (const videoProviderMarker of ['ASSET_FACTORY_VIDEO_MODEL', 'REPLICATE_API_TOKEN', 'FAL_KEY', 'assertPublicUrl', 'ASSET_FACTORY_VIDEO_PROVIDER_MAX_BYTES']) {
  assertIncludes(videoProviderRuntime, videoProviderMarker, `${videoProviderMarker} guarded video provider support`);
}

for (const transactionMarker of [
  'urai-video-provider-transaction-1',
  'urai-video-provider-budget-1',
  'reserveVideoProviderTransaction',
  'beginVideoProviderAttempt',
  'failed-reservation-held',
  'humanReviewRequired: true',
  'productionReady: false',
]) {
  assertIncludes(videoTransactions, transactionMarker, `${transactionMarker} paid video transaction boundary`);
}

for (const packageMarker of [
  'urai-video-package-1',
  'urai-video-package-receipt-1',
  'captions.srt',
  'captions.vtt',
  'audio-description.json',
  'rendered: false',
  'providerSpend: false',
]) {
  assertIncludes(videoPackage, packageMarker, `${packageMarker} deterministic video package boundary`);
}

assertIncludes(renderer, 'renderVideoWithConfiguredProvider', 'dedicated video provider routing');
assertIncludes(renderer, 'urai-video-animatic-1', 'video animatic schema');
assertIncludes(renderer, 'productionReady: false', 'video local proof fail-closed marker');
assertIncludes(videoProviderRuntime, 'reviewRequired: true', 'provider video human-review gate');
assertIncludes(policy, 'maxDurationSeconds: 90', 'video duration guardrail');
assertIncludes(policy, 'estimatedCostCents: seconds * 20', 'video cost estimate');
assertIncludes(generateRoute, "req.headers.get('idempotency-key')", 'provider video idempotency header');
assertIncludes(generateRoute, 'ASSET_FACTORY_VIDEO_MAX_JOB_COST_CENTS', 'provider video per-job ceiling');
assertIncludes(generateRoute, 'ASSET_FACTORY_VIDEO_MAX_CAMPAIGN_COST_CENTS', 'provider video campaign ceiling');
assertIncludes(generateRoute, 'reserveVideoProviderTransaction', 'atomic provider video reservation');
assertIncludes(materializeRoute, 'beginVideoProviderAttempt', 'single provider dispatch lease');
assertIncludes(materializeRoute, 'markVideoProviderAttemptFailed', 'provider failure reservation hold');
assertIncludes(materializeRoute, 'markVideoProviderArtifactReady', 'provider artifact review state');
assertIncludes(packageCli, 'Refusing to overwrite existing encoded preview', 'package duplicate-safety wording is not reused incorrectly');
assertIncludes(packageCli, 'Output directory is not empty', 'package overwrite refusal');
assertIncludes(previewEncoder, 'urai-video-technical-preview-receipt-1', 'technical preview receipt');
assertIncludes(previewEncoder, 'productionReady: false', 'technical preview fail-closed marker');
assertIncludes(previewEncoder, 'providerSpend: false', 'technical preview no-spend marker');
assertIncludes(dayZeroAnimatic, 'day-00-the-door', 'Day 0 source package');
assertIncludes(dayZeroAnimatic, 'audioDescriptionRequired', 'Day 0 audio-description requirement');
assertIncludes(manifestRoute, 'supportedAssetTypes', 'system manifest supported asset types');
assertIncludes(manifestRoute, 'providers', 'system manifest provider diagnostics');
assertIncludes(validation, 'unsupported type', 'unsupported type validation');
assertIncludes(policy, 'estimatedCostCents', 'policy cost estimate');
assertIncludes(policy, 'maxDurationSeconds', 'media duration guardrail');
assertIncludes(billing, 'stripe-price-metadata', 'Stripe price metadata quota source');
assertIncludes(billing, 'maxMonthlyCostCents', 'monthly cost quota');
assertIncludes(storagePaths, 'tenants/${tenantId}/jobs/${jobId}/v${version}', 'canonical storage path convention');
assertIncludes(cloudStore, 'assetFactoryJobs', 'Firestore jobs collection');
assertIncludes(cloudStore, 'cloudWriteGenerated', 'Cloud Storage artifact writer');
assertIncludes(backend, 'activeAssetBackend', 'active backend selector');
assertIncludes(queueDispatcher, 'ASSET_FACTORY_QUEUE_MODE', 'durable queue mode configuration');
assertIncludes(queueDispatcher, 'ASSET_FACTORY_WORKER_URL', 'HTTP worker dispatch configuration');
assertIncludes(queue, 'dispatchAssetJob', 'queue dispatcher integration');
assertIncludes(auth, 'x-asset-roles', 'tenant RBAC role header');
assertIncludes(auth, 'Role ${requiredRole} required', 'RBAC rejection message');
assertIncludes(store, 'activeAssetBackend', 'store backend selection');
assertIncludes(store, 'artifactUri', 'cloud artifact URI attachment');
assertIncludes(store, 'status: \'rendering\'', 'rendering lifecycle status');
assertIncludes(store, 'status: \'failed\'', 'failed lifecycle status');
assertIncludes(store, 'storagePaths', 'storage path attachment');

if (!fs.existsSync(studio)) {
  console.error(`Missing studio directory: ${studio}`);
  process.exit(1);
}

console.log('PASS multimodal asset-factory static checks');