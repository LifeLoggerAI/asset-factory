import { resolveAssetType } from './assetTypeCatalog';
import type { GenerateRequest } from './assetFactoryValidation';

type PolicyLimit = {
  maxPromptChars: number;
  maxWidth?: number;
  maxHeight?: number;
  maxDurationSeconds?: number;
  allowedFormats: string[];
};

const limits: Record<string, PolicyLimit> = {
  graphic: { maxPromptChars: 4000, maxWidth: 4096, maxHeight: 4096, allowedFormats: ['svg', 'png', 'webp', 'json'] },
  model3d: { maxPromptChars: 4000, maxWidth: 2048, maxHeight: 2048, allowedFormats: ['gltf', 'glb', 'json'] },
  audio: { maxPromptChars: 4000, maxDurationSeconds: 30, allowedFormats: ['wav', 'mp3', 'json'] },
  bundle: { maxPromptChars: 4000, allowedFormats: ['json'] },
};

export type PolicyDecision = {
  ok: boolean;
  error?: string;
  canonicalType: string;
  estimatedUnits: number;
  estimatedCostCents: number;
};

function numberFromMetadata(metadata: Record<string, unknown> | undefined, key: string, fallback: number) {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function evaluateGenerationPolicy(input: GenerateRequest): PolicyDecision {
  const definition = resolveAssetType(input.type);
  const canonicalType = definition.canonicalType;
  const limit = limits[canonicalType];
  const promptLength = input.prompt.trim().length;
  const format = String(input.format ?? definition.defaultFormat).toLowerCase();

  if (promptLength > limit.maxPromptChars) {
    return { ok: false, error: `prompt exceeds ${limit.maxPromptChars} characters`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
  }

  if (!limit.allowedFormats.includes(format)) {
    return { ok: false, error: `format ${format} is not allowed for ${canonicalType}`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
  }

  if (limit.maxWidth && input.size?.width && input.size.width > limit.maxWidth) {
    return { ok: false, error: `width exceeds ${limit.maxWidth} for ${canonicalType}`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
  }

  if (limit.maxHeight && input.size?.height && input.size.height > limit.maxHeight) {
    return { ok: false, error: `height exceeds ${limit.maxHeight} for ${canonicalType}`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
  }

  if (canonicalType === 'audio') {
    const durationSeconds = numberFromMetadata(input.metadata, 'durationSeconds', 2);
    if (limit.maxDurationSeconds && durationSeconds > limit.maxDurationSeconds) {
      return { ok: false, error: `durationSeconds exceeds ${limit.maxDurationSeconds} for audio`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
    }
    return { ok: true, canonicalType, estimatedUnits: Math.ceil(durationSeconds), estimatedCostCents: Math.ceil(durationSeconds) };
  }

  if (canonicalType === 'graphic') {
    const width = input.size?.width ?? definition.defaultSize?.width ?? 1440;
    const height = input.size?.height ?? definition.defaultSize?.height ?? 1440;
    const megapixels = Math.max(1, Math.ceil((width * height) / 1_000_000));
    return { ok: true, canonicalType, estimatedUnits: megapixels, estimatedCostCents: megapixels * 2 };
  }

  if (canonicalType === 'model3d') {
    return { ok: true, canonicalType, estimatedUnits: 1, estimatedCostCents: 25 };
  }

  return { ok: true, canonicalType, estimatedUnits: 1, estimatedCostCents: 1 };
}
