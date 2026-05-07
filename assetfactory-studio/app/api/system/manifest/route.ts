import { NextResponse } from 'next/server';
import { getStoreDiagnostics } from '@/lib/server/assetFactoryStore';
import { listAssetTypeDefinitions } from '@/lib/server/assetTypeCatalog';
import { getProviderDiagnostics } from '@/lib/server/assetProviderAdapters';

export async function GET() {
  const diagnostics = getStoreDiagnostics();
  const supportedAssetTypes = listAssetTypeDefinitions();
  const providers = getProviderDiagnostics();

  return NextResponse.json({
    ok: true,
    service: 'asset-factory-studio',
    checkedAt: new Date().toISOString(),
    persistenceMode: diagnostics.mode,
    fallbackActive: diagnostics.fallbackActive,
    rendererMode: 'svg-proof',
    rendererModes: [...new Set(supportedAssetTypes.map((type) => type.rendererMode))],
    supportedAssetTypes,
    providers,
    firebase: diagnostics.firebase,
    firebaseProjectId: diagnostics.firebase.projectId,
    storageBucket: diagnostics.firebase.storageBucket,
    collections: diagnostics.collections,
    generatedPrefix: diagnostics.generatedPrefix,
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
      providerBackedRendering: providers.some((provider) => provider.configured),
    },
    requiredProductionEnv: [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_STORAGE_BUCKET',
      'ASSET_FACTORY_API_KEY',
    ],
  });
}