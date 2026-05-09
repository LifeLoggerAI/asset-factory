import {
  assertConsentRevocationPath,
  assertSensitiveProcessingAllowed,
  createConsentSnapshot,
  hasActiveConsent,
  revokeConsentSnapshot,
} from "../../src/lib/privacy/consent-ledger";

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

const snapshot = createConsentSnapshot({
  userId: "user_123",
  featureId: "safe_narrator",
  source: "privacy_onboarding",
  dataCategories: ["narrator_reflection", "emotional_weather"],
  processingPurposes: ["narrator", "reflection"],
  policyTextVersion: "privacy-v1",
  timestamp: "2026-05-09T00:00:00.000Z",
});

assertConsentRevocationPath(snapshot);

assert(
  hasActiveConsent(snapshot, {
    userId: "user_123",
    featureId: "safe_narrator",
    dataCategories: ["narrator_reflection"],
    processingPurpose: "narrator",
    consentSnapshot: snapshot,
  }),
  "active consent should allow matching sensitive processing.",
);

assertSensitiveProcessingAllowed({
  userId: "user_123",
  featureId: "safe_narrator",
  dataCategories: ["narrator_reflection"],
  processingPurpose: "narrator",
  consentSnapshot: snapshot,
});

mustThrow(
  () =>
    assertSensitiveProcessingAllowed({
      userId: "user_123",
      featureId: "safe_narrator",
      dataCategories: ["audio"],
      processingPurpose: "narrator",
      consentSnapshot: snapshot,
    }),
  "unscoped data category should be denied.",
);

const revoked = revokeConsentSnapshot(snapshot, "2026-05-09T01:00:00.000Z");
mustThrow(
  () =>
    assertSensitiveProcessingAllowed({
      userId: "user_123",
      featureId: "safe_narrator",
      dataCategories: ["narrator_reflection"],
      processingPurpose: "narrator",
      consentSnapshot: revoked,
    }),
  "revoked consent should be denied.",
);
