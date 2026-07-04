import {
  spatialCollisionModes,
  spatialCompressionStates,
  spatialModelRoles,
  spatialPlatformTargets,
  spatialProofStates,
  spatialPromotionStates,
  spatialReleaseVersions,
} from './assetSpatialContractTypes';

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function oneOf(values: readonly string[], value: unknown) {
  return typeof value === 'string' && values.includes(value);
}

function validBudget(value: unknown) {
  return value === undefined || value === null || (
    Number.isInteger(value) && Number(value) > 0 && Number(value) <= 10000000
  );
}

export function validateSpatialModelContract(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const input = objectValue(value);
  if (!input) return 'invalid spatialModelContract';

  const enumFields = [
    ['worldRole', spatialModelRoles],
    ['releaseVersion', spatialReleaseVersions],
    ['collisionMode', spatialCollisionModes],
    ['compressionState', spatialCompressionStates],
    ['proofState', spatialProofStates],
    ['promotionState', spatialPromotionStates],
  ] as const;
  for (const [field, allowed] of enumFields) {
    if (input[field] !== undefined && !oneOf(allowed, input[field])) {
      return `invalid spatialModelContract.${field}`;
    }
  }

  if (input.platformTargets !== undefined) {
    if (!Array.isArray(input.platformTargets)) return 'invalid spatialModelContract.platformTargets';
    if (new Set(input.platformTargets).size !== input.platformTargets.length) return 'invalid spatialModelContract.platformTargets';
    if (input.platformTargets.some((item) => !oneOf(spatialPlatformTargets, item))) return 'invalid spatialModelContract.platformTargets';
  }

  if (input.lodTriangleBudgets !== undefined) {
    const lod = objectValue(input.lodTriangleBudgets);
    if (!lod || !validBudget(lod.high) || !validBudget(lod.medium) || !validBudget(lod.low)) {
      return 'invalid spatialModelContract.lodTriangleBudgets';
    }
    const high = typeof lod.high === 'number' ? lod.high : null;
    const medium = typeof lod.medium === 'number' ? lod.medium : null;
    const low = typeof lod.low === 'number' ? lod.low : null;
    if (
      (high !== null && medium !== null && high < medium) ||
      (medium !== null && low !== null && medium < low) ||
      (high !== null && low !== null && high < low)
    ) {
      return 'invalid spatialModelContract.lodTriangleBudgets.order';
    }
  }
  return null;
}

export function normalizeSpatialModelContract(value: unknown) {
  const input = objectValue(value) ?? {};
  const lod = objectValue(input.lodTriangleBudgets) ?? {};
  const proofState = oneOf(spatialProofStates, input.proofState) ? input.proofState : 'draft';
  const promotionState = oneOf(spatialPromotionStates, input.promotionState) ? input.promotionState : 'review-required';
  const platformTargets = Array.isArray(input.platformTargets)
    ? [...new Set(input.platformTargets.filter((item) => oneOf(spatialPlatformTargets, item)))]
    : [];

  return {
    contractVersion: 1,
    worldRole: oneOf(spatialModelRoles, input.worldRole) ? input.worldRole : 'unspecified',
    releaseVersion: oneOf(spatialReleaseVersions, input.releaseVersion) ? input.releaseVersion : 'unassigned',
    lodTriangleBudgets: {
      high: typeof lod.high === 'number' ? lod.high : null,
      medium: typeof lod.medium === 'number' ? lod.medium : null,
      low: typeof lod.low === 'number' ? lod.low : null,
    },
    collisionMode: oneOf(spatialCollisionModes, input.collisionMode) ? input.collisionMode : 'unspecified',
    compressionState: oneOf(spatialCompressionStates, input.compressionState) ? input.compressionState : 'not-evaluated',
    platformTargets,
    proofState,
    promotionState,
    productionReady: proofState === 'device-verified' && promotionState === 'promoted',
  };
}
