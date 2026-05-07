import { NextResponse } from 'next/server';
import { getStoreDiagnostics } from '@/lib/server/assetFactoryStore';
import { listAssetTypeDefinitions } from '@/lib/server/assetTypeCatalog';
import { getProviderDiagnostics } from '@/lib/server/assetProviderAdapters';
import { getQueueDiagnostics } from '@/lib/server/assetQueueDispatcher';

export async function GET() {
  const diagnostics = getStoreDiagnostics();
  const supportedAssetTypes = listAssetTypeDefinitions();
  const providers = getProviderDiagnostics();
  const queue = getQueueDiagnostics();

  return NextResponse.json({
    ok: true,
    service: 'asset-factory-studio',
    persistenceMode: diagnostics.mode,
    fallbackActive: diagnostics.fallbackActive,
    rendererModes: [...new Set(supportedAssetTypes.map((type) => type.rendererMode))],
    supportedAssetTypes,
    providers,
    queue,
    firebaseProjectId: diagnostics.firebase.projectId,
    storageBucket: diagnostics.firebase.storageBucket,
  });
}
