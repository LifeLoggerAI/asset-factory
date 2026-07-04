export const spatialModelRoles = ['environment', 'portal', 'prop', 'avatar', 'orb', 'workforce', 'memory', 'navigation', 'unspecified'] as const;
export const spatialReleaseVersions = ['v1', 'v2', 'v3', 'v4', 'v5', 'unassigned'] as const;
export const spatialCollisionModes = ['none', 'box', 'convex-hull', 'mesh', 'navmesh', 'unspecified'] as const;
export const spatialCompressionStates = ['not-evaluated', 'draco-ready', 'meshopt-ready', 'compressed'] as const;
export const spatialPlatformTargets = ['web', 'mobile', 'quest', 'ar', 'vr'] as const;
export const spatialProofStates = ['draft', 'deterministic-proof', 'provider-rendered', 'device-verified'] as const;
export const spatialPromotionStates = ['review-required', 'approved', 'promoted'] as const;
