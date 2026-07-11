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

function assertNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    console.error(`Forbidden ${label}: ${needle}`);
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
const paidBatchWorkflow = read('.github/workflows/authorized-multimodal-execution.yml');
const promotionWorkflow = read('.github/workflows/promote-reviewed-multimodal-batch.yml');
const multimodalAudit = read('.github/workflows/full-multimodal-asset-audit.yml');
const renderRound = read('image_asset_generator/render_v1_round.py');
const certification = read('image_asset_generator/certify_dropin.py');
const rightsValidation = read('multimodal/validate_rights.py');
const sourceLock = JSON.parse(read('multimodal/source-lock.json'));

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

for (const providerRuntimeMarker of ['OPENAI_API_KEY', 'REPLICATE_API_TOKEN', 'ELEVENLABS_API_KEY', 'STABILITY_API_KEY', 'FAL_KEY']) {
  assertIncludes(providerRuntime, providerRuntimeMarker, `${providerRuntimeMarker} provider runtime support`);
}

for (const paidGuard of ['ASSET_FACTORY_ENABLE_PAID_MEDIA', 'ASSET_FACTORY_PAID_APPROVAL_ID', 'ASSET_FACTORY_PAID_MAX_COST_CENTS']) {
  assertIncludes(providers, paidGuard, `${paidGuard} provider authorization guard`);
  assertIncludes(manifestRoute, paidGuard, `${paidGuard} production readiness declaration`);
}

assertIncludes(providers, 'authorized: enabled && approvalIdPresent && maximumCostCents > 0', 'bounded paid authorization rule');
assertIncludes(providers, "return getPaidProviderAuthorization().authorized ? requested : 'local-proof'", 'fail-closed provider fallback');
assertIncludes(manifestRoute, "providers.selected !== 'local-proof'", 'local proof excluded from production readiness');
assertIncludes(manifestRoute, 'paidProviderReady', 'paid provider readiness signal');
assertIncludes(manifestRoute, 'supportedAssetTypes', 'system manifest supported asset types');
assertIncludes(manifestRoute, 'providers', 'system manifest provider diagnostics');
assertIncludes(validation, 'unsupported type', 'unsupported type validation');
assertIncludes(policy, 'estimatedCostCents', 'policy cost estimate');
assertIncludes(policy, 'maxDurationSeconds', 'audio duration guardrail');
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

// Paid generation must be exact-head, conservative, resumable, and incapable of promotion.
assertNotIncludes(paidBatchWorkflow, '\n  push:', 'automatic paid workflow trigger');
assertIncludes(paidBatchWorkflow, 'workflow_dispatch:', 'manual paid workflow trigger');
assertIncludes(paidBatchWorkflow, "confirm == 'AUTHORIZE_URAI_20USD_BATCH'", 'explicit paid confirmation');
assertIncludes(paidBatchWorkflow, 'expected_sha:', 'exact paid execution head input');
assertIncludes(paidBatchWorkflow, 'ref: ${{ inputs.expected_sha }}', 'exact paid checkout');
assertIncludes(paidBatchWorkflow, 'persist-credentials: false', 'non-persistent paid checkout credentials');
assertIncludes(paidBatchWorkflow, "ASSET_FORGE_BATCH_MAX_PROVIDER_CALLS: '50'", 'conservative provider call ceiling');
assertIncludes(paidBatchWorkflow, "ASSET_FORGE_BATCH_MAX_COST_USD: '15.00'", 'reservation headroom beneath operational goal');
assertIncludes(paidBatchWorkflow, "ASSET_RENDERER_MAX_PROMPT_CHARS: '12000'", 'prompt character ceiling');
assertIncludes(paidBatchWorkflow, "run.get('conclusion') != 'success'", 'resume requires successful source run');
assertIncludes(paidBatchWorkflow, "run.get('head_sha') != os.environ['AUTHORIZED_HEAD_SHA']", 'resume exact-head binding');
assertIncludes(paidBatchWorkflow, "actual != declared['files']", 'resume checksum set verification');
assertIncludes(paidBatchWorkflow, 'promotionAttempted\': False', 'generation receipt denies promotion');
assertIncludes(paidBatchWorkflow, 'Promotion attempted: no', 'generation summary denies promotion');
assertNotIncludes(paidBatchWorkflow, 'gh pr create', 'same-run promotion command');
assertNotIncludes(paidBatchWorkflow, 'git push origin', 'same-run promotion push');

// Reviewed promotion must bind GitHub's source-run authority, not trust artifact metadata alone.
assertIncludes(promotionWorkflow, "run.get('path') != '.github/workflows/authorized-multimodal-execution.yml'", 'canonical paid workflow path binding');
assertIncludes(promotionWorkflow, "run.get('head_sha') != os.environ['EXPECTED_ASSET_FACTORY_SHA']", 'promotion source-run exact-head binding');
assertIncludes(promotionWorkflow, "run.get('repository', {}).get('full_name') != os.environ['GITHUB_REPOSITORY']", 'promotion source repository binding');
assertIncludes(promotionWorkflow, "run.get('status') != 'completed' or run.get('conclusion') != 'success'", 'promotion source terminal success requirement');
assertIncludes(promotionWorkflow, "metadata.get(key) != value", 'promotion package metadata binding');
assertIncludes(promotionWorkflow, "actual != declared['files']", 'promotion package checksum set verification');

// Technical completion may not become certification without rights and exact-hash human review.
assertIncludes(certification, '"technically-validated"', 'technical-only receipt status');
assertIncludes(certification, '--require-promotion-clearance', 'separate promotion clearance flag');
assertIncludes(certification, 'rights.get("promotionAllowed") is not True', 'promotion rights enforcement');
assertIncludes(certification, 'approval.get("humanReview") is not True', 'human review enforcement');
assertIncludes(certification, 'approved_map != expected_map', 'exact approved artifact hash set enforcement');
assertIncludes(certification, 'approval.get("assetFactoryHeadSha") != head_sha', 'creative approval exact-head binding');
assertIncludes(rightsValidation, '--require-promotion-ready', 'rights promotion mode');
assertIncludes(rightsValidation, 'promotionAllowed', 'rights blocking verdict');
assertIncludes(rightsValidation, 'MUST_VERIFY', 'mandatory rights cannot be marked not applicable');

// Resume logic must retry known failed assets while preserving accepted outputs.
assertIncludes(renderRound, 'retry_failed_existing =', 'failed-existing retry control');
assertIncludes(renderRound, 'name not in feedback', 'accepted existing output skip rule');
assertIncludes(renderRound, 'feedback.get(name)', 'quality feedback passed to provider');

// The audit workflow and checked-in source lock must agree on the exact Spatial tree.
assertIncludes(multimodalAudit, `URAI_SPATIAL_LOCKED_SHA: ${sourceLock.spatialMainSha}`, 'Spatial source lock identity');
assertIncludes(multimodalAudit, 'source-lock.json does not match the workflow Spatial SHA', 'source lock mismatch failure');
assertIncludes(multimodalAudit, 'node scripts/test-asset-factory-multimodal.mjs', 'workflow policy regression test');

if (!fs.existsSync(studio)) {
  console.error(`Missing studio directory: ${studio}`);
  process.exit(1);
}

console.log('PASS multimodal asset-factory static checks');
