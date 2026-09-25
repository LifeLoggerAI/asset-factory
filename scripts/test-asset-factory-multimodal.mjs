import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd().endsWith('assetfactory-studio') ? path.dirname(process.cwd()) : process.cwd();
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
const providerRuntime = read('assetfactory-studio/lib/server/assetProviderRuntime.ts');
const videoProviderRuntime = read('assetfactory-studio/lib/server/assetVideoProviderRuntime.ts');
const transcriptionRuntime = read('assetfactory-studio/lib/server/assetTranscriptionRuntime.ts');
const transcriptionRoute = read('assetfactory-studio/app/api/assets/transcribe/route.ts');
const appHostingConfig = read('assetfactory-studio/apphosting.yaml');
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

for (const assetType of ['graphic', 'model3d', 'audio', 'bundle']) {
  assertIncludes(catalog, `canonicalType: '${assetType}'`, `${assetType} catalog definition`);
  assertIncludes(e2e, `type: '${assetType}'`, `${assetType} E2E case`);
}
assertIncludes(catalog, "canonicalType: 'video'", 'video catalog definition');

// Renderer-mode authority lives in the catalog. The renderer intentionally dispatches
// non-video modes via definition.rendererMode rather than repeating mode string literals.
for (const mode of ['svg-proof', 'spatial-renderer', 'audio-renderer', 'video-renderer', 'manifest-only']) {
  assertIncludes(catalog, mode, `${mode} renderer mode authority`);
}
assertIncludes(renderer, "rendererMode: 'video-renderer'", 'video renderer branch');
assertIncludes(renderer, 'definition.rendererMode', 'catalog-driven renderer dispatch');

for (const extension of ['svg', 'gltf', 'wav', 'mp4', 'webm', 'json']) {
  assertIncludes(generatedRoute, `${extension}:`, `${extension} content type`);
}

for (const provider of ['local-proof', 'openai', 'replicate', 'fal', 'elevenlabs', 'stability', 'runway', 'meshy']) {
  assertIncludes(providers, provider, `${provider} provider adapter diagnostic`);
}

for (const providerRuntimeMarker of ['OPENAI_API_KEY', 'REPLICATE_API_TOKEN', 'ELEVENLABS_API_KEY', 'MESHY_API_KEY', 'STABILITY_API_KEY', 'FAL_KEY']) {
  assertIncludes(providerRuntime, providerRuntimeMarker, `${providerRuntimeMarker} provider runtime support`);
}
for (const marker of ['ASSET_FACTORY_VIDEO_PROVIDER', 'ASSET_FACTORY_REPLICATE_VIDEO_MODEL', 'RUNWAYML_API_SECRET', 'FAL_KEY', 'referenceImageUrl', 'referenceVideoUrl', 'api.dev.runwayml.com/v1/image_to_video', 'api.dev.runwayml.com/v1/tasks/']) {
  assertIncludes(videoProviderRuntime, marker, `video runtime support for ${marker}`);
}

assertIncludes(videoProviderRuntime, 'if (meta.referenceImageUrl) payload.promptImage = meta.referenceImageUrl;', 'Runway optional image conditioning on unified endpoint');
assertIncludes(videoProviderRuntime, "trustedProviderUrl(endpoint, 'fal.run')", 'fal video endpoint host pin');
assertIncludes(videoProviderRuntime, "authorization: `Key ${apiKey}`", 'fal video Key authentication');
assertIncludes(videoProviderRuntime, "aspect_ratio: input.aspectRatio || '9:16'", 'fal video REST aspect ratio contract');
if (videoProviderRuntime.includes('ASSET_FACTORY_RUNWAY_TEXT_VIDEO_ENDPOINT')) {
  console.error('Runway text-to-video must use the verified image_to_video endpoint with promptImage omitted');
  process.exit(1);
}

for (const marker of ['isPrivateIpv4', 'isPrivateIpv6', 'loopbackHostname', "host.endsWith('.local')"]) {
  assertIncludes(videoProviderRuntime, marker, `video provider private-network guard for ${marker}`);
}

for (const marker of ['ASSET_FACTORY_IMAGE_PROVIDER', 'ASSET_FACTORY_MODEL3D_PROVIDER', 'ASSET_FACTORY_AUDIO_PROVIDER', 'ASSET_FACTORY_SFX_PROVIDER', 'ASSET_FACTORY_MUSIC_PROVIDER']) {
  assertIncludes(providerRuntime, marker, `modality provider routing for ${marker}`);
}
assertIncludes(providerRuntime, 'api.meshy.ai/openapi/v2/text-to-3d', 'Meshy text-to-3D runtime');
assertIncludes(providerRuntime, 'api.meshy.ai/openapi/v1/image-to-3d', 'Meshy image-to-3D runtime');
assertIncludes(providerRuntime, 'api.meshy.ai/openapi/v1/multi-image-to-3d', 'Meshy multi-image-to-3D runtime');
assertIncludes(providerRuntime, "ASSET_FACTORY_MESHY_MULTI_IMAGE_GEOMETRY_RESOLUTION", 'Meshy multi-image resolution isolation');
assertIncludes(providerRuntime, "ASSET_FACTORY_MESHY_TEXT_GEOMETRY_RESOLUTION", 'Meshy text geometry resolution');
assertIncludes(providerRuntime, "ai_model: textModel", 'Meshy text-to-3D model pinning');
assertIncludes(providerRuntime, "['standard', '2k']", 'Meshy multi-image supported resolution boundary');
assertIncludes(providerRuntime, "gpt-image-2.5-sunburst", 'current OpenAI image default');
assertIncludes(providerRuntime, "ASSET_FACTORY_OPENAI_IMAGE_FORMAT", 'OpenAI image format authority');
assertIncludes(providerRuntime, "ASSET_FACTORY_OPENAI_SPEECH_MODEL", 'OpenAI speech model authority');
assertIncludes(providerRuntime, "ASSET_FACTORY_OPENAI_VOICE must be explicitly configured", 'fail-closed OpenAI voice identity');
assertIncludes(providerRuntime, "ASSET_FACTORY_REPLICATE_SPEECH_VOICE must be explicitly configured", 'fail-closed Replicate voice identity');
assertIncludes(providerRuntime, "https://api.stability.ai/v2beta/stable-image/generate/${service}", 'current Stability image endpoint');
assertIncludes(providerRuntime, "expected core or ultra", 'Stability service allowlist');
assertIncludes(providerRuntime, "ELEVENLABS_VOICE_ID must be explicitly configured", 'fail-closed ElevenLabs voice identity');
if (providerRuntime.includes('21m00Tcm4TlvDq8ikWAM')) {
  console.error('Stock ElevenLabs voice fallback must not exist in Asset Factory runtime');
  process.exit(1);
}

for (const marker of ['ASSET_FACTORY_STT_PROVIDER', 'ELEVENLABS_API_KEY', 'scribe_v2', '/v1/speech-to-text', 'sourceSha256']) {
  assertIncludes(transcriptionRuntime, marker, `transcription runtime support for ${marker}`);
}
for (const marker of ['requireAssetFactoryApiKey', "'creator'", "allowedMimePrefixes", 'ASSET_FACTORY_STT_MAX_BYTES', 'Number.isFinite(configuredMaxBytes)', '50 * 1024 * 1024']) {
  assertIncludes(transcriptionRoute, marker, `transcription route guard for ${marker}`);
}

for (const variable of [
  'ASSET_FACTORY_MEDIA_PROVIDER',
  'ASSET_FACTORY_IMAGE_PROVIDER',
  'ASSET_FACTORY_MODEL3D_PROVIDER',
  'ASSET_FACTORY_AUDIO_PROVIDER',
  'ASSET_FACTORY_SFX_PROVIDER',
  'ASSET_FACTORY_MUSIC_PROVIDER',
  'ASSET_FACTORY_STT_PROVIDER',
  'ASSET_FACTORY_VIDEO_PROVIDER',
]) {
  assertIncludes(appHostingConfig, `variable: ${variable}`, `App Hosting fail-closed modality ${variable}`);
}
if ((appHostingConfig.match(/value: local-proof/g) ?? []).length < 8) {
  console.error('App Hosting must keep all multimodal provider selectors fail-closed at local-proof');
  process.exit(1);
}
assertIncludes(appHostingConfig, 'variable: ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED', 'App Hosting provider spend kill switch');
assertIncludes(appHostingConfig, 'value: "false"', 'App Hosting provider spend kill switch default false');

for (const variable of [
  'ASSET_FACTORY_PROVIDER_MAX_BYTES',
  'ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS',
  'ASSET_FACTORY_VIDEO_PROVIDER_MAX_BYTES',
  'ASSET_FACTORY_ALLOW_VIDEO_INPUT_OVERRIDES',
  'ASSET_FACTORY_OPENAI_IMAGE_MODEL',
  'ASSET_FACTORY_OPENAI_SPEECH_MODEL',
  'ASSET_FACTORY_STABILITY_IMAGE_SERVICE',
  'ASSET_FACTORY_ELEVENLABS_SPEECH_MODEL',
  'ASSET_FACTORY_ELEVENLABS_SFX_MODEL',
  'ASSET_FACTORY_ELEVENLABS_MUSIC_MODEL',
  'ASSET_FACTORY_ELEVENLABS_STT_MODEL',
  'ASSET_FACTORY_MESHY_MODEL',
  'ASSET_FACTORY_MESHY_TEXT_MODEL',
  'ASSET_FACTORY_MESHY_MULTI_IMAGE_GEOMETRY_RESOLUTION',
  'ASSET_FACTORY_RUNWAY_VIDEO_MODEL',
]) {
  assertIncludes(appHostingConfig, `variable: ${variable}`, `App Hosting provider registry for ${variable}`);
}

assertIncludes(providerRuntime, 'ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED', 'provider runtime provider spend kill switch');
assertIncludes(videoProviderRuntime, 'ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED', 'video runtime provider spend kill switch');
assertIncludes(transcriptionRuntime, 'ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED', 'transcription runtime provider spend kill switch');

assertIncludes(renderer, 'local-proof cannot promote fake motion as video', 'fail-closed local video policy');
assertIncludes(renderer, 'identity-continuity', 'video identity QA gate');
assertIncludes(renderer, 'temporal-flicker', 'video temporal QA gate');
assertIncludes(manifestRoute, 'supportedAssetTypes', 'system manifest supported asset types');
assertIncludes(manifestRoute, 'providers', 'system manifest provider diagnostics');
assertIncludes(manifestRoute, 'modalityReadiness', 'modality-aware provider readiness');
assertIncludes(manifestRoute, 'providerSpendAuthorized', 'provider spend authorization readiness');
assertIncludes(manifestRoute, "enabled('ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED')", 'provider spend kill switch readiness');
assertIncludes(manifestRoute, "approved-voice-not-configured", 'speech identity readiness blocker');
assertIncludes(manifestRoute, "configured('ASSET_FACTORY_OPENAI_VOICE')", 'approved OpenAI voice readiness requirement');
assertIncludes(manifestRoute, "configured('ELEVENLABS_VOICE_ID')", 'approved ElevenLabs voice readiness requirement');
assertIncludes(manifestRoute, "provider-account-capability-not-certified", 'Runway account capability readiness blocker');
assertIncludes(manifestRoute, "configured('ASSET_FACTORY_REPLICATE_VIDEO_MODEL')", 'Replicate video model readiness requirement');
assertIncludes(manifestRoute, "configured('ASSET_FACTORY_FAL_VIDEO_ENDPOINT')", 'fal video endpoint readiness requirement');
assertIncludes(validation, 'metadata.durationSeconds', 'video duration validation');
assertIncludes(validation, 'metadata.fps', 'video fps validation');
assertIncludes(policy, "canonicalType === 'video'", 'video cost policy');
assertIncludes(policy, 'estimatedCostCents', 'policy cost estimate');
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
assertIncludes(store, "status: 'rendering'", 'rendering lifecycle status');
assertIncludes(store, "status: 'failed'", 'failed lifecycle status');
assertIncludes(store, 'storagePaths', 'storage path attachment');

if (!fs.existsSync(studio)) {
  console.error(`Missing studio directory: ${studio}`);
  process.exit(1);
}

console.log('PASS multimodal asset-factory static checks including governed video');
