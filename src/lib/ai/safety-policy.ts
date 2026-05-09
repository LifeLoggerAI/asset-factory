import { assertNoBannedTierOneCopy } from "../tier-locks/tier-one-canon";

export const URAI_AI_SAFETY_POLICY_VERSION = "ai-safety-tier-1-v1";

export type NarratorSafetyLevel = "safe" | "needs_review" | "blocked";
export type NarratorConfidenceLevel = "low" | "medium" | "high";

export interface NarratorSafetyMetadata {
  modelVersion: string;
  promptVersion: string;
  confidenceLevel: NarratorConfidenceLevel;
  safetyLevel: NarratorSafetyLevel;
  sourceSignalCategories: string[];
  includesSymbolicInterpretation: boolean;
  includesFactualEvents: boolean;
  userDismissable: boolean;
}

export interface NarratorSafetyCheckResult {
  allowed: boolean;
  safetyLevel: NarratorSafetyLevel;
  violations: string[];
}

export const NARRATOR_BLOCKED_PHRASES = [
  "diagnosed",
  "you have depression",
  "you have anxiety",
  "you are bipolar",
  "you are mentally ill",
  "definitely",
  "certainly",
  "without a doubt",
  "they are lying",
  "they lied",
  "liar",
  "trust score",
  "betrayal detected",
  "crisis predicted",
  "you will hurt yourself",
  "you need me",
  "do not tell anyone",
  "medical advice",
];

export function findNarratorSafetyViolations(copy: string): string[] {
  const normalized = copy.toLowerCase();
  const violations = NARRATOR_BLOCKED_PHRASES.filter((phrase) => normalized.includes(phrase));

  try {
    assertNoBannedTierOneCopy(copy);
  } catch (error) {
    violations.push(error instanceof Error ? error.message : "Tier 1 public copy violation.");
  }

  return violations;
}

export function evaluateNarratorSafety(copy: string, metadata: NarratorSafetyMetadata): NarratorSafetyCheckResult {
  const violations = findNarratorSafetyViolations(copy);

  if (!metadata.modelVersion) {
    violations.push("Missing model version.");
  }

  if (!metadata.promptVersion) {
    violations.push("Missing prompt version.");
  }

  if (!metadata.userDismissable) {
    violations.push("Narrator output must be dismissable by the user.");
  }

  if (metadata.includesSymbolicInterpretation && metadata.includesFactualEvents) {
    const normalized = copy.toLowerCase();
    if (!normalized.includes("symbolic") && !normalized.includes("reflection")) {
      violations.push("Mixed factual and symbolic output must label symbolic interpretation.");
    }
  }

  if (violations.length > 0) {
    return { allowed: false, safetyLevel: "blocked", violations };
  }

  return { allowed: true, safetyLevel: metadata.safetyLevel, violations: [] };
}

export function assertNarratorOutputSafe(copy: string, metadata: NarratorSafetyMetadata): void {
  const result = evaluateNarratorSafety(copy, metadata);

  if (!result.allowed) {
    throw new Error(`URAI narrator safety violation: ${result.violations.join("; ")}`);
  }
}
