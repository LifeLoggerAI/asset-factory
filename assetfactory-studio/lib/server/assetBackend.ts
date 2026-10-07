import { isFirebaseAdminAvailable } from './firebaseAdmin';
import * as cloud from './cloudAssetFactoryStore';
import * as local from './localAssetFactoryStore';

export function shouldUseCloudAssetBackend() {
  const forcedLocal = process.env.ASSET_FACTORY_FORCE_LOCAL === 'true';
  if (process.env.NODE_ENV === 'production' && forcedLocal) {
    throw new Error('Production Asset Factory requires durable Firebase persistence');
  }
  const available = !forcedLocal && isFirebaseAdminAvailable();
  if (process.env.NODE_ENV === 'production' && !available) {
    throw new Error('Production Asset Factory Firebase authority is unavailable; local fallback is denied');
  }
  return available;
}

export function activeAssetBackend() {
  return shouldUseCloudAssetBackend()
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
