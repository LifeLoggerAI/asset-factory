import { NextRequest, NextResponse } from 'next/server';
import { getStoreDiagnostics } from '@/lib/server/assetFactoryStore';
import { listAssetTypeDefinitions } from '@/lib/server/assetTypeCatalog';
import { getProviderDiagnostics } from '@/lib/server/assetProviderAdapters';
import { getQueueDiagnostics } from '@/lib/server/assetQueueDispatcher';
import { requireConfiguredAssetFactoryApiKey } from '@/lib/server/apiAuth';

const requiredProductionEnv = [
  'ASSET_FACTORY_API_KEY',
  'ASSET_FACTORY_REQUIRE_API_KEY',
  'ASSET_FACTORY_REQUIRE_AUTH',
  'ASSET_FACTORY_REQUIRE_JWT_SIGNATURE',
  'ASSET_FACTORY_JWT_HS256_SECRET',
  'ASSET_FACTORY_JWT_ISSUER',
  'ASSET_FACTORY_JWT_AUDIENCE',
  'ASSET_FACTORY_TENANT_CLAIM',
  'ASSET_FACTORY_ROLE_CLAIM',
  'ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH',
  'ASSET_FACTORY_QUEUE_MODE',
  'ASSET_FACTORY_WORKER_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'CRON_SECRET',
  'ASSET_FACTORY_MEDIA_PROVIDER',
  'ASSET_FACTORY_PROVIDER_TIMEOUT_MS',
  'ASSET_FACTORY_PROVIDER_MAX_BYTES',
];

function enabled(name: string) {
  return process.env[name] === 'true';
}

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function GET(req: NextRequest) {
  const fullDiagnostics = new URL(req.url).searchParams.get('full') === 'true';

  if (fullDiagnostics) {
    const authError = requireConfiguredAssetFactoryApiKey(req);
    if (authError) {
      authError.headers.set('Cache-Control', 'no-store');
      return authError;
    }
  }

  const diagnostics = getStoreDiagnostics();
  const supportedAssetTypes = listAssetTypeDefinitions();
  const providers = getProviderDiagnostics();
  const queue = getQueueDiagnostics();
  // Credentials are configuration, never a successful canary or paid approval.
  // The always-configured local proof adapter cannot satisfy a paid-provider gate.
  const providerConfigured = providers.selected !== 'local-proof' && providers.selectedConfigured;
  const anyPaidProviderCredentialConfigured = providers.adapters.some((provider) => provider.name !== 'local-proof' && provider.configured);
  const replicateCredentialVisible = providers.adapters.some(
    (provider) => provider.name === 'replicate' && provider.configured
  );
  const falCredentialVisible = providers.adapters.some(
    (provider) => provider.name === 'fal' && provider.configured
  );
  const higgsfieldCredentialVisible = providers.adapters.some(
    (provider) => provider.name === 'higgsfield' && provider.configured
  );
  const falGraphicsConfigured = configured('ASSET_FACTORY_FAL_GRAPHICS_MODEL') || configured('ASSET_FACTORY_GRAPHICS_MODEL');
  const replicateGraphicsConfigured = configured('ASSET_FACTORY_REPLICATE_GRAPHICS_MODEL') || configured('ASSET_FACTORY_GRAPHICS_MODEL');
  const replicateModel3dConfigured = configured('ASSET_FACTORY_REPLICATE_MODEL3D_MODEL') || configured('ASSET_FACTORY_MODEL3D_MODEL');
  const replicateAudioConfigured = configured('ASSET_FACTORY_REPLICATE_AUDIO_MODEL') || configured('ASSET_FACTORY_AUDIO_MODEL');
  const replicateSpeechConfigured = configured('ASSET_FACTORY_REPLICATE_SPEECH_MODEL');
  const replicateRegistryConfigured = replicateGraphicsConfigured && replicateModel3dConfigured && replicateAudioConfigured && replicateSpeechConfigured;
  const higgsfieldImageConfigured = configured('ASSET_FACTORY_HIGGSFIELD_IMAGE_ENDPOINT');
  const higgsfieldVideoConfigured = configured('ASSET_FACTORY_HIGGSFIELD_TEXT_VIDEO_ENDPOINT') && configured('ASSET_FACTORY_HIGGSFIELD_IMAGE_VIDEO_ENDPOINT');
  const higgsfieldRegistryConfigured = higgsfieldImageConfigured && higgsfieldVideoConfigured;
  const durableQueueConfigured = queue.mode !== 'local-inline';
  const authConfigured = enabled('ASSET_FACTORY_REQUIRE_API_KEY') && enabled('ASSET_FACTORY_REQUIRE_AUTH');
  const signedJwtRequired = enabled('ASSET_FACTORY_REQUIRE_JWT_SIGNATURE');
  const hs256JwtVerifierConfigured = configured('ASSET_FACTORY_JWT_HS256_SECRET');
  const legacyHeaderAuthDisabled = !enabled('ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH');
  const authConfigurationReady = authConfigured && signedJwtRequired && hs256JwtVerifierConfigured && legacyHeaderAuthDisabled;
  const productionAuthReady = false; // An auth runtime receipt is not established by environment fields.
  const configurationPrerequisitesPresent = !diagnostics.fallbackActive && diagnostics.mode === 'firestore-storage'
    && authConfigurationReady && durableQueueConfigured && providerConfigured
    && requiredProductionEnv.every(configured);

  const publicPayload = {
    ok: true,
    service: 'asset-factory-studio',
    evidenceScope: 'configuration-only',
    runtimeVerified: false,
    productionVerified: false,
    checkedAt: new Date().toISOString(),
    persistenceMode: diagnostics.mode,
    fallbackActive: diagnostics.fallbackActive,
    rendererMode: 'svg-proof',
    rendererModes: [...new Set(supportedAssetTypes.map((type) => type.rendererMode))],
    supportedAssetTypes,
    capabilities: {
      queue: true,
      deterministicProofRenderer: true,
      firestorePersistence: diagnostics.mode === 'firestore-storage',
      cloudStoragePersistence: diagnostics.mode === 'firestore-storage',
      localFallback: diagnostics.fallbackActive,
      publishWorkflow: true,
      rollbackWorkflow: true,
      approvals: true,
      versioningWorkflow: true,
      stripeWebhooks: configured('STRIPE_WEBHOOK_SECRET'),
      providerBackedRendering: false,
      providerAdaptersImplemented: true,
      providerRuntimeVerified: false,
      providerCallAuthorized: false,
      selectedProviderCredentialConfigured: providerConfigured,
      anyPaidProviderCredentialConfigured,
      replicateCredentialVisible,
      falCredentialVisible,
      higgsfieldCredentialVisible,
      higgsfieldImageConfigured,
      higgsfieldVideoConfigured,
      higgsfieldRegistryConfigured,
      falGraphicsConfigured,
      replicateGraphicsConfigured,
      replicateModel3dConfigured,
      replicateAudioConfigured,
      replicateSpeechConfigured,
      replicateRegistryConfigured,
    },
    workflows: {
      generate: true,
      materialize: true,
      publish: true,
      approve: true,
      rollback: true,
      createVersion: true,
    },
    productionReadiness: {
      localFallbackDisabled: !diagnostics.fallbackActive,
      firebaseBacked: diagnostics.mode === 'firestore-storage',
      authConfigured,
      signedJwtRequired,
      hs256JwtVerifierConfigured,
      legacyHeaderAuthDisabled,
      productionAuthReady,
      authConfigurationReady,
      durableQueueConfigured,
      providerConfigured,
      selectedProvider: providers.selected,
      evidenceScope: 'configuration-only',
      providerRuntimeVerified: false,
      providerCallAuthorized: false,
      configurationPrerequisitesPresent,
      falGraphicsConfigured,
      higgsfieldRegistryConfigured,
      replicateRegistryConfigured,
      stripeWebhookConfigured: configured('STRIPE_WEBHOOK_SECRET'),
      cronSecretConfigured: configured('CRON_SECRET'),
      status: configurationPrerequisitesPresent ? 'provider-evidence-required' : 'not-ready-for-smoke',
    },
  };

  if (!fullDiagnostics) {
    return NextResponse.json(publicPayload, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({
    ...publicPayload,
    providers,
    queue,
    firebase: diagnostics.firebase,
    firebaseProjectId: diagnostics.firebase.projectId,
    storageBucket: diagnostics.firebase.storageBucket,
    collections: diagnostics.collections,
    generatedPrefix: diagnostics.generatedPrefix,
    requiredProductionEnv,
    requiredProductionConfiguration: {
      firebaseProject: { oneOf: ['ASSET_FACTORY_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'], constraint: 'Dedicated matching Factory project; shared and production development targets are refused.' },
      firebaseBucket: { optional: 'FIREBASE_STORAGE_BUCKET', constraint: 'Exact project-bound default bucket; omitted value uses the canonical default.' },
      firebaseCredentials: { mode: 'application-default', declaredFileMode: 'external-account-only', deployedIdentityVerified: false },
      forbiddenLongLivedCredentialEnv: ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'GOOGLE_APPLICATION_CREDENTIALS_JSON'],
      providerAuthority: 'Current authenticated approval, exact semantic/source/pricing binding, atomic reservation and executor receipt are required separately. This manifest never authorizes a provider call.',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
