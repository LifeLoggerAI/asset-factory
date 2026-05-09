import {
  TIER_ONE_ALL_FEATURES,
  TIER_ONE_DISABLED_FEATURES,
  TIER_ONE_SAFE_CORE,
  assertTierOnePublicFeatureAllowed,
  getTierOneFeaturePolicy,
  isTierOnePublicFeatureAllowed,
  type TierOneFeaturePolicy,
} from "../tier-locks/tier-one-canon";

export type UraiRuntimeEnvironment = "demo" | "development" | "staging" | "production" | "test";

export interface UraiFeatureFlag {
  featureId: string;
  enabled: boolean;
  publicLaunchAllowed: boolean;
  environment: UraiRuntimeEnvironment;
  serverSideGateRequired: boolean;
  reason: string;
}

export const TIER_ONE_ALLOWED_FEATURE_IDS = TIER_ONE_SAFE_CORE.map((feature) => feature.id);
export const TIER_ONE_BLOCKED_FEATURE_IDS = TIER_ONE_DISABLED_FEATURES.map((feature) => feature.id);

export function normalizeRuntimeEnvironment(value?: string): UraiRuntimeEnvironment {
  if (value === "demo" || value === "development" || value === "staging" || value === "production" || value === "test") {
    return value;
  }

  if (value === "prod") {
    return "production";
  }

  return "development";
}

export function createTierOneFeatureFlag(
  feature: TierOneFeaturePolicy,
  environment: UraiRuntimeEnvironment,
): UraiFeatureFlag {
  const enabled = feature.publicLaunchAllowed && !TIER_ONE_BLOCKED_FEATURE_IDS.includes(feature.id);

  return {
    featureId: feature.id,
    enabled,
    publicLaunchAllowed: feature.publicLaunchAllowed,
    environment,
    serverSideGateRequired: feature.requiresServerSideGate,
    reason: enabled
      ? "Allowed by URAI Tier 1 canon."
      : `Blocked by URAI Tier 1 canon: ${feature.status}.`,
  };
}

export function getTierOneFeatureFlags(environment: UraiRuntimeEnvironment = "production"): Record<string, UraiFeatureFlag> {
  return TIER_ONE_ALL_FEATURES.reduce<Record<string, UraiFeatureFlag>>((flags, feature) => {
    flags[feature.id] = createTierOneFeatureFlag(feature, environment);
    return flags;
  }, {});
}

export const URAI_TIER_ONE_PRODUCTION_FLAGS = getTierOneFeatureFlags("production");
export const URAI_TIER_ONE_DEMO_FLAGS = getTierOneFeatureFlags("demo");

export function isFeatureEnabled(
  featureId: string,
  environment: UraiRuntimeEnvironment = "production",
): boolean {
  const feature = getTierOneFeaturePolicy(featureId);

  if (!feature) {
    return false;
  }

  if (environment === "production" && !isTierOnePublicFeatureAllowed(featureId)) {
    return false;
  }

  return createTierOneFeatureFlag(feature, environment).enabled;
}

export function assertFeatureEnabled(
  featureId: string,
  environment: UraiRuntimeEnvironment = "production",
): void {
  const feature = getTierOneFeaturePolicy(featureId);

  if (!feature) {
    throw new Error(`URAI feature flag violation: unknown feature "${featureId}".`);
  }

  if (!isFeatureEnabled(featureId, environment)) {
    throw new Error(`URAI feature flag violation: "${featureId}" is disabled in ${environment}.`);
  }
}

export function assertPublicLaunchAllowed(featureId: string): void {
  assertTierOnePublicFeatureAllowed(featureId);
}

export function assertServerSideGate(featureId: string, gateWasChecked: boolean): void {
  const feature = getTierOneFeaturePolicy(featureId);

  if (!feature) {
    throw new Error(`URAI server gate violation: unknown feature "${featureId}".`);
  }

  if (feature.requiresServerSideGate && !gateWasChecked) {
    throw new Error(`URAI server gate violation: "${featureId}" requires a server-side gate.`);
  }
}

export function assertNoBlockedFeatureIds(featureIds: string[]): void {
  const blocked = featureIds.filter((featureId) => TIER_ONE_BLOCKED_FEATURE_IDS.includes(featureId));

  if (blocked.length > 0) {
    throw new Error(`URAI Tier 1 blocked feature violation: ${blocked.join(", ")}.`);
  }
}
