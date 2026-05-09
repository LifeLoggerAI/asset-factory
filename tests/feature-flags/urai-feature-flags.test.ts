import {
  TIER_ONE_ALLOWED_FEATURE_IDS,
  TIER_ONE_BLOCKED_FEATURE_IDS,
  assertFeatureEnabled,
  assertNoBlockedFeatureIds,
  assertPublicLaunchAllowed,
  getTierOneFeatureFlags,
  isFeatureEnabled,
} from "../../src/lib/feature-flags/urai-feature-flags";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const mustThrow = (callback: () => void, message: string): void => {
  let threw = false;
  try {
    callback();
  } catch {
    threw = true;
  }
  assert(threw, message);
};

const productionFlags = getTierOneFeatureFlags("production");

for (const featureId of TIER_ONE_ALLOWED_FEATURE_IDS) {
  assert(productionFlags[featureId]?.enabled, `${featureId} should be enabled in production.`);
  assertFeatureEnabled(featureId, "production");
  assertPublicLaunchAllowed(featureId);
}

for (const featureId of TIER_ONE_BLOCKED_FEATURE_IDS) {
  assert(!isFeatureEnabled(featureId, "production"), `${featureId} must be disabled in production.`);
  mustThrow(() => assertFeatureEnabled(featureId, "production"), `${featureId} should throw when enabled is asserted.`);
  mustThrow(() => assertPublicLaunchAllowed(featureId), `${featureId} should throw when public launch is asserted.`);
}

mustThrow(
  () => assertNoBlockedFeatureIds(["auth_demo_entry", "deception_detection"]),
  "blocked feature lists should throw.",
);

assertNoBlockedFeatureIds(["auth_demo_entry", "safe_narrator"]);
