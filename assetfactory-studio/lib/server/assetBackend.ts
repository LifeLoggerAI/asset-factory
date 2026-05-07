import { isFirebaseAdminAvailable } from './firebaseAdmin';
import * as cloud from './cloudAssetFactoryStore';
import * as local from './localAssetFactoryStore';

export function useCloudAssetBackend() {
  return process.env.ASSET_FACTORY_FORCE_LOCAL !== 'true' && isFirebaseAdminAvailable();
}

export function activeAssetBackend() {
  return useCloudAssetBackend()
    ? {
        mode: 'firestore-storage' as const,
        addJob: cloud.cloudAddJob,
        readJobs: cloud.cloudReadJobs,
        findJob: cloud.cloudFindJob,
        updateJob: cloud.cloudUpdateJob,
        listAssets: cloud.cloudListAssets,
        findAsset: cloud.cloudFindAsset,
        upsertAsset: cloud.cloudUpsertAsset,
        recordUsage: cloud.cloudRecordUsage,
        listUsage: cloud.cloudListUsage,
        writeGenerated: cloud.cloudWriteGenerated,
        readGenerated: cloud.cloudReadGenerated,
      }
    : {
        mode: 'local-json' as const,
        addJob: local.localAddJob,
        readJobs: local.localReadJobs,
        findJob: local.localFindJob,
        updateJob: local.localUpdateJob,
        listAssets: local.localListAssets,
        findAsset: local.localFindAsset,
        upsertAsset: local.localUpsertAsset,
        recordUsage: local.localRecordUsage,
        listUsage: local.localListUsage,
        writeGenerated: local.localWriteGenerated,
        readGenerated: local.localReadGenerated,
      };
}
