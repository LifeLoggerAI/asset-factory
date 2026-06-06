import { validateSpatialManifest } from './validateSpatialManifest';

export type RuntimeSpatialAsset = {
  assetId: string;
  modelUrl: string;
  fallbackAsset: string;
  geometryType: string;
  performanceTier: string;
  mobileReady: boolean;
};

export function loadSpatialAssetContract(manifest: unknown): RuntimeSpatialAsset {
  const validation = validateSpatialManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid spatial asset: ${validation.errors.join('; ')}`);
  }

  return {
    assetId: validation.asset.id,
    modelUrl: validation.modelUrl,
    fallbackAsset: validation.asset.fallbackAsset as string,
    geometryType: validation.asset.geometryType as string,
    performanceTier: validation.asset.performanceTier,
    mobileReady: validation.asset.mobileReady,
  };
}
