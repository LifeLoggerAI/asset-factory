import { isSupportedAssetType, supportedAssetTypeNames } from './assetTypeCatalog';

const safePathSegment = /^[a-zA-Z0-9._/-]+$/;
const safeTenant = /^[a-zA-Z0-9._:-]+$/;

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
  return (
    typeof value === 'string' &&
    value.length > 2 &&
    value.length < 128 &&
    safePathSegment.test(value) &&
    !value.includes('..')
  );
}

export function validateTenantId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length < 128 &&
    safeTenant.test(value) &&
    !value.includes('..')
  );
}

export function validateFileName(value: unknown): value is string {
  return typeof value === 'string' && safePathSegment.test(value) && !value.includes('..');
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
    if (dimension !== undefined && (!Number.isFinite(dimension) || Number(dimension) <= 0 || Number(dimension) > 8192)) {
      return `invalid size.${key}`;
    }
  }
  return null;
}

export function validateGenerateRequest(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return 'body required';
  }

  const body = value as Record<string, unknown>;

  if (!validateJobId(body.jobId)) {
    return 'invalid jobId';
  }

  if (!validateTenantId((body.tenantId as string | undefined) ?? 'default')) {
    return 'invalid tenantId';
  }

  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 4000) {
    return 'invalid prompt';
  }

  if (typeof body.type !== 'string' || !body.type.trim()) {
    return 'invalid type';
  }

  if (!isSupportedAssetType(body.type)) {
    return `unsupported type. supported: ${supportedAssetTypeNames().join(', ')}`;
  }

  for (const key of ['presetId', 'format', 'variant', 'targetModule', 'aspectRatio', 'stylePack']) {
    const error = validateOptionalString(body, key);
    if (error) return error;
  }

  const sizeError = validateSize(body.size);
  if (sizeError) return sizeError;

  if (body.metadata !== undefined && (typeof body.metadata !== 'object' || body.metadata === null || Array.isArray(body.metadata))) {
    return 'invalid metadata';
  }

  return null;
}
