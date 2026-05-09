import {
  assertNarratorOutputSafe,
  evaluateNarratorSafety,
  type NarratorSafetyMetadata,
} from "../../src/lib/ai/safety-policy";
import { createSafeNarratorReflection } from "../../src/lib/ai/narrator-guardrails";

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

const metadata: NarratorSafetyMetadata = {
  modelVersion: "test-model-v1",
  promptVersion: "tier-1-narrator-v1",
  confidenceLevel: "low",
  safetyLevel: "safe",
  sourceSignalCategories: ["synthetic_demo", "emotional_weather"],
  includesSymbolicInterpretation: true,
  includesFactualEvents: false,
  userDismissable: true,
};

assertNarratorOutputSafe("A gentle symbolic reflection: your recent rhythm looks quieter than usual.", metadata);

mustThrow(
  () => assertNarratorOutputSafe("They are lying and betrayal detected.", metadata),
  "deception and betrayal language should be blocked.",
);

mustThrow(
  () => assertNarratorOutputSafe("You have depression and this is medical advice.", metadata),
  "diagnostic and medical language should be blocked.",
);

const result = evaluateNarratorSafety("A symbolic reflection you can dismiss anytime.", {
  ...metadata,
  userDismissable: false,
});
assert(!result.allowed, "non-dismissable narrator output should be blocked.");

const reflection = createSafeNarratorReflection("A symbolic reflection: your day may be asking for a softer pace.", metadata);
assert(reflection.featureId === "safe_narrator", "reflection should be a safe narrator feature.");
assert(reflection.text.includes("AI-generated reflection"), "reflection should include safe narrator disclaimer.");
