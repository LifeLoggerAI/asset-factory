import type { UraiAssetManifest } from './assetSchema';

export type AssetRequestUser = {
  uid?: string | null;
  roles?: string[];
  service?: boolean;
};

function hasRole(user: AssetRequestUser | null | undefined, role: string) {
  return Boolean(user?.roles?.includes(role));
}

export function isAdminUser(user: AssetRequestUser | null | undefined) {
  return Boolean(user?.service || hasRole(user, 'admin') || hasRole(user, 'asset-admin'));
}

export function canReadAsset(user: AssetRequestUser | null | undefined, asset: UraiAssetManifest) {
  if (asset.visibility === 'public-demo' || asset.visibility === 'public-marketing') {
    return asset.permissions.publicReadable === true && asset.permissions.containsUserData === false;
  }
  if (asset.visibility === 'system') return isAdminUser(user) || asset.permissions.publicReadable === true;
  if (asset.visibility === 'admin' || asset.visibility === 'internal-only') return isAdminUser(user);
  if (asset.visibility === 'private-user') return Boolean(user?.uid && user.uid === (asset.ownerId ?? asset.permissions.ownerId));
  return false;
}

export function canWriteAsset(user: AssetRequestUser | null | undefined, asset: UraiAssetManifest) {
  if (isAdminUser(user)) return true;
  return asset.visibility === 'private-user' && Boolean(user?.uid && user.uid === (asset.ownerId ?? asset.permissions.ownerId));
}

export function canPublishAsset(user: AssetRequestUser | null | undefined, asset: UraiAssetManifest) {
  if (!isAdminUser(user)) return false;
  return asset.validation.schemaValid === true && asset.productionReady === true;
}

export function assertAssetIsPublicSafe(asset: UraiAssetManifest) {
  if (asset.permissions.containsUserData) throw new Error('public asset contains user data');
  if (!asset.validation.noPrivateData) throw new Error('public asset has not passed private-data validation');
  if (asset.visibility === 'public-demo' && !asset.permissions.sanitizedForDemo) {
    throw new Error('public demo asset is not sanitized');
  }
}

export function assertAssetIsProductionReady(asset: UraiAssetManifest) {
  if (!asset.productionReady) throw new Error('asset is not productionReady');
  if (!asset.fallbackAsset) throw new Error('production asset is missing fallbackAsset');
  if (!asset.validation.schemaValid) throw new Error('asset schema validation has not passed');
  if (asset.validation.errors.length > 0) throw new Error(`asset has validation errors: ${asset.validation.errors.join('; ')}`);
}

export function canServeAssetFile(user: AssetRequestUser | null | undefined, asset: UraiAssetManifest, filePath: string) {
  if (!canReadAsset(user, asset)) return false;
  return !isBlockedDeployableAssetPath(filePath);
}

export function isBlockedDeployableAssetPath(filePath: string) {
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  return (
    normalized.includes('/_audit/') ||
    normalized.startsWith('_audit/') ||
    normalized.includes('/outputs/') ||
    normalized.startsWith('outputs/') ||
    normalized.endsWith('.bak') ||
    normalized.endsWith('.body') ||
    normalized.endsWith('.log') ||
    normalized.includes('proof') ||
    normalized.includes('audit')
  );
}
