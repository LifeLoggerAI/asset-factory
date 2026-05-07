import { NextResponse } from 'next/server';
import { getStoreDiagnostics } from '@/lib/server/assetFactoryStore';

export async function GET() {
  const diagnostics = getStoreDiagnostics();

  return NextResponse.json({
    ok: true,
    service: 'asset-factory-studio',
    checkedAt: new Date().toISOString(),
    persistenceMode: diagnostics.mode,
    fallbackActive: diagnostics.fallbackActive,
    rendererMode: 'svg-proof',
    firebase: diagnostics.firebase,
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
