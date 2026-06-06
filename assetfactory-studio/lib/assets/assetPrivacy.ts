import type { UraiAssetManifest } from './assetSchema';

type MemoryAwarePermissions = UraiAssetManifest['permissions'] & {
  containsUserMemoryData?: boolean;
};

export function assetHasUserMemoryData(asset: UraiAssetManifest) {
  const permissions = asset.permissions as MemoryAwarePermissions;
  return permissions.containsUserData === true || permissions.containsUserMemoryData === true;
}

export function assetIsDemoSafe(asset: UraiAssetManifest) {
  return asset.permissions.publicReadable === true
    && !assetHasUserMemoryData(asset)
    && asset.validation.noPrivateData === true
    && asset.permissions.sanitizedForDemo === true;
}

export function assertAssetHasNoUserMemoryData(asset: UraiAssetManifest) {
  if (assetHasUserMemoryData(asset)) throw new Error('asset includes user-derived memory data');
}
