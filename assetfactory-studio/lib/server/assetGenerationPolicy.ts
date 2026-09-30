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
  video: { maxPromptChars: 4000, maxWidth: 4096, maxHeight: 4096, maxDurationSeconds: 20, allowedFormats: ['mp4', 'webm'] },
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

function positiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function budgetDecision(canonicalType: string, estimatedUnits: number, estimatedCostCents: number): PolicyDecision {
  const maxJobCost = positiveEnvNumber('ASSET_FACTORY_MAX_JOB_ESTIMATED_COST_CENTS', 500);
  if (estimatedCostCents > maxJobCost) {
    return {
      ok: false,
      error: `estimated job cost ${estimatedCostCents} cents exceeds per-job ceiling ${maxJobCost} cents`,
      canonicalType,
      estimatedUnits,
      estimatedCostCents,
    };
  }
  return { ok: true, canonicalType, estimatedUnits, estimatedCostCents };
}

export function evaluateGenerationPolicy(input: GenerateRequest): PolicyDecision {
  const definition = resolveAssetType(input.type);
  const canonicalType = definition.canonicalType;
  const limit = limits[canonicalType];
  const promptLength = input.prompt.trim().length;
  const format = String(input.format ?? definition.defaultFormat).toLowerCase();

  if (promptLength > limit.maxPromptChars) return { ok: false, error: `prompt exceeds ${limit.maxPromptChars} characters`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
  if (!limit.allowedFormats.includes(format)) return { ok: false, error: `format ${format} is not allowed for ${canonicalType}`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
  if (limit.maxWidth && input.size?.width && input.size.width > limit.maxWidth) return { ok: false, error: `width exceeds ${limit.maxWidth} for ${canonicalType}`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
  if (limit.maxHeight && input.size?.height && input.size.height > limit.maxHeight) return { ok: false, error: `height exceeds ${limit.maxHeight} for ${canonicalType}`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };

  if (canonicalType === 'audio') {
    const durationSeconds = numberFromMetadata(input.metadata, 'durationSeconds', 2);
    if (limit.maxDurationSeconds && durationSeconds > limit.maxDurationSeconds) return { ok: false, error: `durationSeconds exceeds ${limit.maxDurationSeconds} for audio`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
    const rawType = String(input.type ?? '').trim().toLowerCase();
    const centsPerSecond = rawType === 'music'
      ? positiveEnvNumber('ASSET_FACTORY_MUSIC_ESTIMATED_COST_CENTS_PER_SECOND', 10)
      : ['sfx', 'sound', 'ambience'].includes(rawType)
        ? positiveEnvNumber('ASSET_FACTORY_SFX_ESTIMATED_COST_CENTS_PER_SECOND', 5)
        : positiveEnvNumber('ASSET_FACTORY_SPEECH_ESTIMATED_COST_CENTS_PER_SECOND', 3);
    return budgetDecision(canonicalType, Math.ceil(durationSeconds), Math.ceil(durationSeconds * centsPerSecond));
  }

  if (canonicalType === 'video') {
    const durationSeconds = numberFromMetadata(input.metadata, 'durationSeconds', definition.defaultDurationSeconds ?? 4);
    if (limit.maxDurationSeconds && durationSeconds > limit.maxDurationSeconds) return { ok: false, error: `durationSeconds exceeds ${limit.maxDurationSeconds} for video`, canonicalType, estimatedUnits: 0, estimatedCostCents: 0 };
    const width = input.size?.width ?? definition.defaultSize?.width ?? 1080;
    const height = input.size?.height ?? definition.defaultSize?.height ?? 1920;
    const resolutionFactor = Math.max(1, Math.ceil((width * height) / (1080 * 1920)));
    const units = Math.max(1, Math.ceil(durationSeconds * resolutionFactor));
    const centsPerSecond1080 = positiveEnvNumber('ASSET_FACTORY_VIDEO_ESTIMATED_COST_CENTS_PER_SECOND', 100);
    return budgetDecision(canonicalType, units, Math.ceil(durationSeconds * resolutionFactor * centsPerSecond1080));
  }

  if (canonicalType === 'graphic') {
    const width = input.size?.width ?? definition.defaultSize?.width ?? 1440;
    const height = input.size?.height ?? definition.defaultSize?.height ?? 1440;
    const megapixels = Math.max(1, Math.ceil((width * height) / 1_000_000));
    const centsPerMegapixel = positiveEnvNumber('ASSET_FACTORY_IMAGE_ESTIMATED_COST_CENTS_PER_MEGAPIXEL', 10);
    return budgetDecision(canonicalType, megapixels, megapixels * centsPerMegapixel);
  }

  if (canonicalType === 'model3d') {
    return budgetDecision(canonicalType, 1, positiveEnvNumber('ASSET_FACTORY_MODEL3D_ESTIMATED_COST_CENTS_PER_JOB', 100));
  }
  return budgetDecision(canonicalType, 1, 1);
}
