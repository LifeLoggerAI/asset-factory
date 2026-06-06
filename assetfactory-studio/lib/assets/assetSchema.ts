export type UraiAssetType =
  | 'image'
  | 'overlay'
  | 'svg'
  | 'texture'
  | 'material'
  | 'model-glb'
  | 'model-gltf'
  | 'particle-system'
  | 'spatial-scene'
  | 'audio-loop'
  | 'audio-cue'
  | 'voice'
  | 'animation'
  | 'lottie'
  | 'rive'
  | 'video'
  | 'prompt-template'
  | 'scene-manifest';

export type UraiAssetVisibility =
  | 'private-user'
  | 'system'
  | 'admin'
  | 'public-demo'
  | 'public-marketing'
  | 'internal-only';

export type UraiAssetStatus =
  | 'draft'
  | 'queued'
  | 'generating'
  | 'generated'
  | 'validating'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'archived'
  | 'failed';

export type UraiPerformanceTier = 'mobile-low' | 'mobile-mid' | 'mobile-high' | 'desktop' | 'xr';

export interface UraiAssetPermissions {
  ownerId?: string;
  allowedUserIds?: string[];
  allowedRoles?: string[];
  publicReadable: boolean;
  adminOnly: boolean;
  containsUserData: boolean;
  sanitizedForDemo: boolean;
}

export interface UraiAssetValidationState {
  schemaValid: boolean;
  filesExist: boolean;
  urlsReachable: boolean;
  gltfValid?: boolean;
  audioValid?: boolean;
  imageOptimized?: boolean;
  noPlaceholderText: boolean;
  noDebugText: boolean;
  noPrivateData: boolean;
  checkedAt?: string;
  errors: string[];
  warnings: string[];
}

export interface UraiAssetManifest {
  id: string;
  slug: string;
  title: string;
  description?: string;
  assetType: UraiAssetType;
  symbolicCategory: string;
  visualLayer?: string;
  environment?: string;
  emotionalState?: string;
  moodWeather?: string;
  auraColor?: string;
  geometryType?: string;
  textureUrl?: string;
  normalMapUrl?: string;
  displacementMapUrl?: string;
  roughnessMapUrl?: string;
  modelUrl?: string;
  gltfUrl?: string;
  glbUrl?: string;
  audioUrl?: string;
  animationUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  prompt?: string;
  sourcePrompt?: string;
  negativePrompt?: string;
  promptTemplateId?: string;
  generationModel?: string;
  seed?: string | number;
  generationParams?: Record<string, unknown>;
  version: string;
  status: UraiAssetStatus;
  visibility: UraiAssetVisibility;
  permissions: UraiAssetPermissions;
  ownerId?: string;
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  tags: string[];
  dependencies: string[];
  compatibleScenes: string[];
  fallbackAsset?: string;
  performanceTier: UraiPerformanceTier;
  mobileReady: boolean;
  arReady: boolean;
  vrReady: boolean;
  xrReady: boolean;
  spatialReady: boolean;
  productionReady: boolean;
  validation: UraiAssetValidationState;
}

const assetTypes = new Set<string>([
  'image', 'overlay', 'svg', 'texture', 'material', 'model-glb', 'model-gltf', 'particle-system',
  'spatial-scene', 'audio-loop', 'audio-cue', 'voice', 'animation', 'lottie', 'rive', 'video',
  'prompt-template', 'scene-manifest',
]);
const visibilities = new Set<string>(['private-user', 'system', 'admin', 'public-demo', 'public-marketing', 'internal-only']);
const statuses = new Set<string>(['draft', 'queued', 'generating', 'generated', 'validating', 'approved', 'rejected', 'published', 'archived', 'failed']);
const tiers = new Set<string>(['mobile-low', 'mobile-mid', 'mobile-high', 'desktop', 'xr']);
const spatialTypes = new Set<string>(['model-glb', 'model-gltf', 'spatial-scene', 'scene-manifest', 'particle-system']);
const audioTypes = new Set<string>(['audio-loop', 'audio-cue', 'voice']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'string' && String(value[key]).trim().length > 0;
}
function hasBoolean(value: Record<string, unknown>, key: string) {
  return typeof value[key] === 'boolean';
}
function hasStringArray(value: Record<string, unknown>, key: string) {
  return Array.isArray(value[key]) && (value[key] as unknown[]).every((item) => typeof item === 'string');
}
function hasModelReference(asset: Record<string, unknown>) {
  return hasString(asset, 'modelUrl') || hasString(asset, 'gltfUrl') || hasString(asset, 'glbUrl');
}

export function validateUraiAssetManifest(value: unknown): { ok: true; asset: UraiAssetManifest } | { ok: false; errors: string[] } {
  if (!isRecord(value)) return { ok: false, errors: ['asset manifest must be an object'] };
  const errors: string[] = [];

  for (const key of ['id', 'slug', 'title', 'assetType', 'symbolicCategory', 'version', 'status', 'visibility', 'createdBy', 'createdAt', 'updatedAt', 'performanceTier']) {
    if (!hasString(value, key)) errors.push(`missing ${key}`);
  }
  if (!assetTypes.has(String(value.assetType))) errors.push(`unsupported assetType ${String(value.assetType)}`);
  if (!statuses.has(String(value.status))) errors.push(`unsupported status ${String(value.status)}`);
  if (!visibilities.has(String(value.visibility))) errors.push(`unsupported visibility ${String(value.visibility)}`);
  if (!tiers.has(String(value.performanceTier))) errors.push(`unsupported performanceTier ${String(value.performanceTier)}`);
  for (const key of ['mobileReady', 'arReady', 'vrReady', 'xrReady', 'spatialReady', 'productionReady']) {
    if (!hasBoolean(value, key)) errors.push(`missing ${key}`);
  }
  for (const key of ['tags', 'dependencies', 'compatibleScenes']) {
    if (!hasStringArray(value, key)) errors.push(`missing ${key}`);
  }

  const permissions = isRecord(value.permissions) ? value.permissions : null;
  if (!permissions) errors.push('missing permissions');
  else for (const key of ['publicReadable', 'adminOnly', 'containsUserData', 'sanitizedForDemo']) {
    if (!hasBoolean(permissions, key)) errors.push(`missing permissions.${key}`);
  }

  const validation = isRecord(value.validation) ? value.validation : null;
  if (!validation) errors.push('missing validation');
  else {
    for (const key of ['schemaValid', 'filesExist', 'urlsReachable', 'noPlaceholderText', 'noDebugText', 'noPrivateData']) {
      if (!hasBoolean(validation, key)) errors.push(`missing validation.${key}`);
    }
    if (!Array.isArray(validation.errors)) errors.push('missing validation.errors');
    if (!Array.isArray(validation.warnings)) errors.push('missing validation.warnings');
  }

  if ((value.visibility === 'public-demo' || value.visibility === 'public-marketing') && permissions?.containsUserData === true) {
    errors.push('public assets cannot contain private user data');
  }
  if (value.visibility === 'public-demo' && permissions?.sanitizedForDemo !== true) {
    errors.push('public-demo assets must be sanitizedForDemo');
  }
  if (value.status === 'published' && !hasString(value, 'thumbnailUrl') && !hasString(value, 'previewUrl')) {
    errors.push('published assets must include thumbnailUrl or previewUrl');
  }
  if (value.productionReady === true && !hasString(value, 'fallbackAsset')) {
    errors.push('production assets must include fallbackAsset');
  }
  if (spatialTypes.has(String(value.assetType))) {
    if (value.spatialReady !== true) errors.push('spatial assets must be spatialReady');
    if (!hasModelReference(value)) errors.push('spatial assets must include modelUrl, gltfUrl, or glbUrl');
    if (validation && validation.gltfValid !== true) errors.push('spatial model assets must have validation.gltfValid true');
  }
  if (audioTypes.has(String(value.assetType)) && validation && validation.audioValid !== true) {
    errors.push('audio assets must have validation.audioValid true');
  }

  return errors.length ? { ok: false, errors } : { ok: true, asset: value as unknown as UraiAssetManifest };
}

export function assertUraiAssetManifest(value: unknown): UraiAssetManifest {
  const result = validateUraiAssetManifest(value);
  if (!result.ok) throw new Error(`Invalid URAI asset manifest: ${result.errors.join('; ')}`);
  return result.asset;
}

export function isSpatialAssetType(assetType: string) {
  return spatialTypes.has(assetType);
}
