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
  'ASSET_FACTORY_ENABLE_PAID_MEDIA',
  'ASSET_FACTORY_PAID_APPROVAL_ID',
  'ASSET_FACTORY_PAID_MAX_COST_CENTS',
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

  const paidProviderReady = providers.selected !== 'local-proof'
    && providers.selectedConfigured
    && providers.selectedExecutable
    && providers.paidAuthorization.authorized;
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
      providerBackedRendering: paidProviderReady,
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
      requestedProvider: providers.requested,
      selectedProvider: providers.selected,
      paidProviderAuthorized: providers.paidAuthorization.authorized,
      paidProviderReady,
      stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
      status: !diagnostics.fallbackActive
        && diagnostics.mode === 'firestore-storage'
        && productionAuthReady
        && durableQueueConfigured
        && paidProviderReady
        && process.env.STRIPE_WEBHOOK_SECRET
        && process.env.CRON_SECRET
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
