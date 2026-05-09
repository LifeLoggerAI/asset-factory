import {
  TIER_ONE_DISABLED_FEATURES,
  TIER_ONE_PUBLIC_COPY_BANS,
  TIER_ONE_SAFE_CORE,
  assertNoBannedTierOneCopy,
  assertTierOnePublicFeatureAllowed,
  isTierOnePublicFeatureAllowed,
  requiresConsentSnapshot,
} from "../../src/lib/tier-locks/tier-one-canon";

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
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

for (const feature of TIER_ONE_SAFE_CORE) {
  assert(feature.publicLaunchAllowed, `${feature.id} should be public-launch allowed.`);
  assertTierOnePublicFeatureAllowed(feature.id);
}

for (const feature of TIER_ONE_DISABLED_FEATURES) {
  assert(!isTierOnePublicFeatureAllowed(feature.id), `${feature.id} should be blocked in public Tier 1.`);
  mustThrow(() => assertTierOnePublicFeatureAllowed(feature.id), `${feature.id} should throw when asserted.`);
}

assert(requiresConsentSnapshot("emotional_weather"), "emotional weather must require consent.");
assert(requiresConsentSnapshot("safe_narrator"), "safe narrator must require consent.");
assert(!requiresConsentSnapshot("auth_demo_entry"), "auth/demo entry should not require explicit consent.");

for (const phrase of TIER_ONE_PUBLIC_COPY_BANS) {
  mustThrow(
    () => assertNoBannedTierOneCopy(`URAI includes ${phrase} for users.`),
    `banned phrase should fail: ${phrase}`,
  );
}

assertNoBannedTierOneCopy("URAI shows gentle reflective patterns you can dismiss anytime.");
