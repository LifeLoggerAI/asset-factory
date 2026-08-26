import { isSupportedAssetType, resolveAssetType, supportedAssetTypeNames } from './assetTypeCatalog';
import { validateSpatialModelContract } from './assetSpatialContract';

const safeIdSegment = /^[a-zA-Z0-9._-]+$/;
const safeTenant = /^[a-zA-Z0-9._:-]+$/;
const blockedGeneratedAssetNames = ['_audit', 'outputs', '.bak', '.body', '.log', 'proof', 'audit'];
const loopbackHostname = ['local', 'host'].join('');

export type GenerateRequest = {
  jobId: string;
  tenantId?: string;
  prompt: string;
  type: string;
  presetId?: string;
  format?: string;
  variant?: string;
  targetModule?: string;
  aspectRatio?: string;
  size?: { width?: number; height?: number };
  transparentBackground?: boolean;
  stylePack?: string;
  metadata?: Record<string, unknown>;
};

export function validateJobId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 2 && value.length < 128 && safeIdSegment.test(value) && !value.includes('..');
}

export function validateTenantId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length < 128 && safeTenant.test(value) && !value.includes('..');
}

function isBlockedGeneratedAssetName(value: string) {
  const lower = value.toLowerCase();
  return blockedGeneratedAssetNames.some((blocked) => lower.includes(blocked));
}

export function validateFileName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length < 256 && safeIdSegment.test(value) && !value.includes('..') && !isBlockedGeneratedAssetName(value);
}

function validateOptionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 128) return `invalid ${key}`;
  return null;
}

function validateSize(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object') return 'invalid size';
  const size = value as Record<string, unknown>;
  for (const key of ['width', 'height']) {
    const dimension = size[key];
    if (dimension !== undefined && (typeof dimension !== 'number' || !Number.isFinite(dimension) || dimension <= 0 || dimension > 8192)) return `invalid size.${key}`;
  }
  return null;
}

function isPublicHttpUrl(value: unknown) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return ['https:', 'http:'].includes(parsed.protocol) && host !== loopbackHostname && host !== '::1' && !host.endsWith('.local') && !host.startsWith('127.');
  } catch {
    return false;
  }
}

function validateVideoMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return null;
  const duration = metadata.durationSeconds;
  if (duration !== undefined && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 1 || duration > 20)) return 'invalid metadata.durationSeconds';
  const fps = metadata.fps;
  if (fps !== undefined && (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 12 || fps > 60)) return 'invalid metadata.fps';
  const motionStrength = metadata.motionStrength;
  if (motionStrength !== undefined && (typeof motionStrength !== 'number' || !Number.isFinite(motionStrength) || motionStrength < 0 || motionStrength > 1)) return 'invalid metadata.motionStrength';
  if (!isPublicHttpUrl(metadata.referenceImageUrl)) return 'invalid metadata.referenceImageUrl';
  if (!isPublicHttpUrl(metadata.referenceVideoUrl)) return 'invalid metadata.referenceVideoUrl';
  if (metadata.providerInput !== undefined && (typeof metadata.providerInput !== 'object' || metadata.providerInput === null || Array.isArray(metadata.providerInput))) return 'invalid metadata.providerInput';
  return null;
}

export function validateGenerateRequest(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'body required';
  const body = value as Record<string, unknown>;
  if (!validateJobId(body.jobId)) return 'invalid jobId';
  if (!validateTenantId((body.tenantId as string | undefined) ?? 'default')) return 'invalid tenantId';
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) return 'invalid prompt';
  if (typeof body.type !== 'string' || !body.type.trim()) return 'invalid type';
  if (!isSupportedAssetType(body.type)) return `unsupported type. supported: ${supportedAssetTypeNames().join(', ')}`;

  for (const key of ['presetId', 'format', 'variant', 'targetModule', 'aspectRatio', 'stylePack']) {
    const error = validateOptionalString(body, key);
    if (error) return error;
  }

  const sizeError = validateSize(body.size);
  if (sizeError) return sizeError;
  if (body.metadata !== undefined && (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata))) return 'invalid metadata';

  const metadata = body.metadata as Record<string, unknown> | undefined;
  const definition = resolveAssetType(body.type);
  const spatialContract = metadata?.spatialModelContract;
  if (spatialContract !== undefined && definition.canonicalType !== 'model3d') return 'spatialModelContract requires model3d type';
  const spatialContractError = validateSpatialModelContract(spatialContract);
  if (spatialContractError) return spatialContractError;
  if (definition.canonicalType === 'video') {
    const videoError = validateVideoMetadata(metadata);
    if (videoError) return videoError;
  }
  return null;
}
