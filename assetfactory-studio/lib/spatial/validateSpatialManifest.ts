import { validateUraiAssetManifest, isSpatialAssetType, type UraiAssetManifest } from '../assets/assetSchema';

export type SpatialValidationResult =
  | { ok: true; asset: UraiAssetManifest; modelUrl: string }
  | { ok: false; errors: string[] };

function primaryModelUrl(asset: UraiAssetManifest) {
  return asset.glbUrl ?? asset.gltfUrl ?? asset.modelUrl ?? '';
}

function isGltfPath(value: string) {
  const lower = value.toLowerCase().split('?')[0].split('#')[0];
  return lower.endsWith('.glb') || lower.endsWith('.gltf');
}

export function validateSpatialManifest(value: unknown): SpatialValidationResult {
  const base = validateUraiAssetManifest(value);
  if (!base.ok) return base;
  const asset = base.asset;
  const errors: string[] = [];
  const modelUrl = primaryModelUrl(asset);

  if (!isSpatialAssetType(asset.assetType)) errors.push('assetType is not spatial');
  if (!asset.spatialReady) errors.push('spatialReady must be true');
  if (!asset.productionReady) errors.push('productionReady must be true for spatial loading');
  if (!asset.mobileReady) errors.push('mobileReady metadata is required');
  if (!asset.performanceTier) errors.push('performanceTier is required');
  if (!asset.geometryType || asset.geometryType === 'none' || asset.geometryType === 'plane') {
    errors.push('true 3D assets must declare non-flat geometryType');
  }
  if (!modelUrl) errors.push('modelUrl, gltfUrl, or glbUrl is required');
  if (modelUrl && !isGltfPath(modelUrl)) errors.push('model must be a glb or gltf file');
  if (!asset.fallbackAsset) errors.push('fallbackAsset is required');
  if (asset.validation.gltfValid !== true) errors.push('validation.gltfValid must be true');

  return errors.length ? { ok: false, errors } : { ok: true, asset, modelUrl };
}
