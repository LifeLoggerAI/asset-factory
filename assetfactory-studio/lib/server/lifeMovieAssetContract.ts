export const LIFE_MOVIE_ASSET_TRUTH_CLASSES = [
  'RECORDED_SOURCE_TRUTH',
  'ATTRIBUTED_FAMILY_RECOLLECTION',
  'SPATIALLY_RECONSTRUCTABLE',
  'INTERPRETIVE_CINEMATIC_RECREATION',
  'UNKNOWN_UNRESOLVED',
] as const;

export type LifeMovieAssetTruthClass = typeof LIFE_MOVIE_ASSET_TRUTH_CLASSES[number];

export type LifeMovieAssetPromotion = {
  assetId: string;
  runtimeAssetKey: string;
  truthClass: LifeMovieAssetTruthClass;
  sourceTruth: boolean;
  syntheticSource: boolean;
  providerTaskId?: string;
  sourceAuthorityIds: string[];
  qa: {
    identityContinuity: boolean;
    motionNaturalness: boolean;
    anatomy: boolean;
    temporalFlicker: boolean;
    lightingContinuity: boolean;
    periodAccuracy: boolean;
    rightsBoundary: boolean;
    audioQc?: boolean;
  };
  artifact: {
    sha256: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
  };
};

const SAFE_TOKEN = /^[A-Za-z0-9._:-]{1,180}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function validateLifeMovieAssetPromotion(input: LifeMovieAssetPromotion) {
  if (!SAFE_TOKEN.test(input.assetId) || !SAFE_TOKEN.test(input.runtimeAssetKey)) return { ok: false as const, reason: 'invalid-identity' };
  if (!LIFE_MOVIE_ASSET_TRUTH_CLASSES.includes(input.truthClass)) return { ok: false as const, reason: 'invalid-truth-class' };
  if (!SHA256.test(input.artifact.sha256)) return { ok: false as const, reason: 'missing-artifact-hash' };
  if (input.providerTaskId && !SAFE_TOKEN.test(input.providerTaskId)) return { ok: false as const, reason: 'invalid-provider-task-id' };
  if (!input.sourceAuthorityIds.every((id) => SAFE_TOKEN.test(id))) return { ok: false as const, reason: 'invalid-source-authority' };

  const requiredQa = [
    input.qa.identityContinuity,
    input.qa.motionNaturalness,
    input.qa.anatomy,
    input.qa.temporalFlicker,
    input.qa.lightingContinuity,
    input.qa.periodAccuracy,
    input.qa.rightsBoundary,
  ];
  if (requiredQa.some((passed) => passed !== true)) return { ok: false as const, reason: 'qa-incomplete' };

  if (input.syntheticSource && input.sourceTruth) return { ok: false as const, reason: 'synthetic-cannot-be-recorded-source-truth' };
  if (input.syntheticSource && input.truthClass === 'RECORDED_SOURCE_TRUTH') return { ok: false as const, reason: 'synthetic-truth-class-conflict' };
  if (!input.syntheticSource && input.truthClass === 'INTERPRETIVE_CINEMATIC_RECREATION' && input.sourceTruth) {
    return { ok: false as const, reason: 'interpretive-cannot-be-source-truth' };
  }

  return {
    ok: true as const,
    promotion: {
      ...input,
      status: 'accepted-for-runtime' as const,
      provenanceRetained: true as const,
    },
  };
}
