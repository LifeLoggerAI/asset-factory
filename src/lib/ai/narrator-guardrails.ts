import {
  TIER_ONE_SAFE_LANGUAGE,
  assertTierOnePublicFeatureAllowed,
} from "../tier-locks/tier-one-canon";
import {
  URAI_AI_SAFETY_POLICY_VERSION,
  assertNarratorOutputSafe,
  type NarratorSafetyMetadata,
} from "./safety-policy";

export interface SafeNarratorReflection {
  featureId: "safe_narrator";
  text: string;
  metadata: NarratorSafetyMetadata;
  disclaimer: string;
  safetyPolicyVersion: typeof URAI_AI_SAFETY_POLICY_VERSION;
}

export function buildNarratorSafetyMetadata(input: Partial<NarratorSafetyMetadata> = {}): NarratorSafetyMetadata {
  return {
    modelVersion: input.modelVersion ?? "unconfigured-model",
    promptVersion: input.promptVersion ?? "tier-1-narrator-v1",
    confidenceLevel: input.confidenceLevel ?? "low",
    safetyLevel: input.safetyLevel ?? "safe",
    sourceSignalCategories: input.sourceSignalCategories ?? ["synthetic_demo"],
    includesSymbolicInterpretation: input.includesSymbolicInterpretation ?? true,
    includesFactualEvents: input.includesFactualEvents ?? false,
    userDismissable: input.userDismissable ?? true,
  };
}

export function createSafeNarratorReflection(
  text: string,
  metadataInput: Partial<NarratorSafetyMetadata> = {},
): SafeNarratorReflection {
  assertTierOnePublicFeatureAllowed("safe_narrator");

  const metadata = buildNarratorSafetyMetadata(metadataInput);
  const guardedText = `${text}\n\n${TIER_ONE_SAFE_LANGUAGE.narrator}`;

  assertNarratorOutputSafe(guardedText, metadata);

  return {
    featureId: "safe_narrator",
    text: guardedText,
    metadata,
    disclaimer: TIER_ONE_SAFE_LANGUAGE.narrator,
    safetyPolicyVersion: URAI_AI_SAFETY_POLICY_VERSION,
  };
}

export function assertNarratorDoesNotClaimClinicalCertainty(text: string): void {
  assertNarratorOutputSafe(text, buildNarratorSafetyMetadata({ sourceSignalCategories: ["manual_check"] }));
}
