import { NextRequest, NextResponse } from 'next/server';
import { getStoreDiagnostics } from '@/lib/server/assetFactoryStore';
import { listAssetTypeDefinitions } from '@/lib/server/assetTypeCatalog';
import { getProviderDiagnostics } from '@/lib/server/assetProviderAdapters';
import { getQueueDiagnostics } from '@/lib/server/assetQueueDispatcher';
import { requireConfiguredAssetFactoryApiKey } from '@/lib/server/apiAuth';

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
      rollbackWorkflow: 'contract-only',
      approvals: 'contract-only',
      stripeWebhooks: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      providerBackedRendering: providers.adapters.some((provider) => provider.configured),
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
    requiredProductionEnv: [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_STORAGE_BUCKET',
      'ASSET_FACTORY_API_KEY',
    ],
  });
}
