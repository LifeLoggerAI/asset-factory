import { NextRequest, NextResponse } from 'next/server';
import { getStoreDiagnostics } from '@/lib/server/assetFactoryStore';
import { listAssetTypeDefinitions } from '@/lib/server/assetTypeCatalog';
import { getProviderDiagnostics } from '@/lib/server/assetProviderAdapters';
import { getQueueDiagnostics } from '@/lib/server/assetQueueDispatcher';
import { requireConfiguredAssetFactoryApiKey } from '@/lib/server/apiAuth';

const requiredProductionEnv = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_STORAGE_BUCKET',
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
  'ASSET_FACTORY_IMAGE_PROVIDER',
  'ASSET_FACTORY_MODEL3D_PROVIDER',
  'ASSET_FACTORY_AUDIO_PROVIDER',
  'ASSET_FACTORY_SFX_PROVIDER',
  'ASSET_FACTORY_MUSIC_PROVIDER',
  'ASSET_FACTORY_STT_PROVIDER',
  'ASSET_FACTORY_VIDEO_PROVIDER',
  'ASSET_FACTORY_MAX_JOB_ESTIMATED_COST_CENTS',
  'ASSET_FACTORY_PROVIDER_TIMEOUT_MS',
  'ASSET_FACTORY_PROVIDER_MAX_BYTES',
];

function enabled(name: string) {
  return process.env[name] === 'true';
}

function configured(name: string) {
  return Boolean(process.env[name]);
}

export async function GET(req: NextRequest) {
  const diagnostics = getStoreDiagnostics();
  const supportedAssetTypes = listAssetTypeDefinitions();
  const providers = getProviderDiagnostics();
  const queue = getQueueDiagnostics();
  const fullDiagnostics = new URL(req.url).searchParams.get('full') === 'true';

  if (fullDiagnostics) {
    const authError = requireConfiguredAssetFactoryApiKey(req);
    if (authError) return authError;
  }

  const externalCredentialAvailable = providers.adapters.some((provider) => provider.name !== 'local-proof' && provider.configured);
  const modalityRouting = {
    image: process.env.ASSET_FACTORY_IMAGE_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
    model3d: process.env.ASSET_FACTORY_MODEL3D_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
    audio: process.env.ASSET_FACTORY_AUDIO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
    sfx: process.env.ASSET_FACTORY_SFX_PROVIDER || process.env.ASSET_FACTORY_AUDIO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
    music: process.env.ASSET_FACTORY_MUSIC_PROVIDER || process.env.ASSET_FACTORY_AUDIO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
    stt: process.env.ASSET_FACTORY_STT_PROVIDER || 'local-proof',
    video: process.env.ASSET_FACTORY_VIDEO_PROVIDER || process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
  };
  const activeExternalProviderNames = [...new Set(Object.values(modalityRouting).filter((name) => name !== 'local-proof'))];

  function providerConfigured(providerName: string) {
    return providers.adapters.some((provider) => provider.name === providerName && provider.configured);
  }

  function modalityProviderReady(modality: keyof typeof modalityRouting, providerName: string) {
    if (providerName === 'local-proof' || !providerConfigured(providerName)) return false;
    if (modality === 'audio' && providerName === 'elevenlabs') {
      return configured('ELEVENLABS_VOICE_ID');
    }
    if (providerName === 'replicate') {
      if (modality === 'image') return configured('ASSET_FACTORY_REPLICATE_GRAPHICS_MODEL') || configured('ASSET_FACTORY_GRAPHICS_MODEL');
      if (modality === 'model3d') return configured('ASSET_FACTORY_REPLICATE_MODEL3D_MODEL') || configured('ASSET_FACTORY_MODEL3D_MODEL');
      if (modality === 'audio') return configured('ASSET_FACTORY_REPLICATE_SPEECH_MODEL') || configured('ASSET_FACTORY_REPLICATE_AUDIO_MODEL') || configured('ASSET_FACTORY_AUDIO_MODEL');
      if (modality === 'video') return configured('ASSET_FACTORY_REPLICATE_VIDEO_MODEL');
    }
    if (providerName === 'fal') {
      if (modality === 'image') return configured('ASSET_FACTORY_GRAPHICS_MODEL');
      if (modality === 'model3d') return configured('ASSET_FACTORY_MODEL3D_MODEL');
      if (modality === 'audio' || modality === 'sfx' || modality === 'music') return configured('ASSET_FACTORY_AUDIO_MODEL');
      if (modality === 'video') return configured('ASSET_FACTORY_FAL_VIDEO_ENDPOINT');
    }
    return true;
  }

  const modalityReadiness = Object.fromEntries(
    Object.entries(modalityRouting).map(([modality, providerName]) => [
      modality,
      {
        provider: providerName,
        external: providerName !== 'local-proof',
        ready: modalityProviderReady(modality as keyof typeof modalityRouting, providerName),
      },
    ])
  );
  const activeExternalRoutes = Object.values(modalityReadiness).filter((route) => route.external);
  const activeExternalProvidersConfigured = activeExternalRoutes.length > 0 && activeExternalRoutes.every((route) => route.ready);
  const replicateCredentialVisible = providers.adapters.some(
    (provider) => provider.name === 'replicate' && provider.configured
  );
  const replicateGraphicsConfigured = configured('ASSET_FACTORY_REPLICATE_GRAPHICS_MODEL') || configured('ASSET_FACTORY_GRAPHICS_MODEL');
  const replicateModel3dConfigured = configured('ASSET_FACTORY_REPLICATE_MODEL3D_MODEL') || configured('ASSET_FACTORY_MODEL3D_MODEL');
  const replicateAudioConfigured = configured('ASSET_FACTORY_REPLICATE_AUDIO_MODEL') || configured('ASSET_FACTORY_AUDIO_MODEL');
  const replicateSpeechConfigured = configured('ASSET_FACTORY_REPLICATE_SPEECH_MODEL');
  const replicateRegistryConfigured = replicateGraphicsConfigured && replicateModel3dConfigured && replicateAudioConfigured && replicateSpeechConfigured;
  const durableQueueConfigured = queue.mode !== 'local-inline';
  const authConfigured = enabled('ASSET_FACTORY_REQUIRE_API_KEY') && enabled('ASSET_FACTORY_REQUIRE_AUTH');
  const signedJwtRequired = enabled('ASSET_FACTORY_REQUIRE_JWT_SIGNATURE');
  const hs256JwtVerifierConfigured = configured('ASSET_FACTORY_JWT_HS256_SECRET');
  const legacyHeaderAuthDisabled = !enabled('ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH');
  const productionAuthReady = authConfigured && signedJwtRequired && hs256JwtVerifierConfigured && legacyHeaderAuthDisabled;

  const publicPayload = {
    ok: true,
    service: 'asset-factory-studio',
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
      stripeWebhooks: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      providerBackedRendering: activeExternalProvidersConfigured,
      modalityRouting,
      modalityReadiness,
      activeExternalProviderNames,
      externalCredentialAvailable,
      replicateCredentialVisible,
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
      durableQueueConfigured,
      providerConfigured: activeExternalProvidersConfigured,
      replicateRegistryConfigured,
      stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
      status: !diagnostics.fallbackActive && diagnostics.mode === 'firestore-storage' && productionAuthReady && durableQueueConfigured && activeExternalProvidersConfigured && process.env.STRIPE_WEBHOOK_SECRET && process.env.CRON_SECRET
        ? 'ready-for-smoke'
        : 'not-ready-for-smoke',
    },
  };

  if (!fullDiagnostics) {
    return NextResponse.json(publicPayload);
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
  });
}
