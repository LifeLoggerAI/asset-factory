export const URAI_TIER_ONE_CANON_VERSION = "tier-1-lock-v1";

export type TierOneFeatureStatus =
  | "safe_core"
  | "demo_only"
  | "disabled"
  | "tier_2_candidate"
  | "legal_safety_hold"
  | "do_not_ship";

export type TierOneRiskLevel = "low" | "medium" | "high" | "critical";

export interface TierOneFeaturePolicy {
  id: string;
  label: string;
  status: TierOneFeatureStatus;
  riskLevel: TierOneRiskLevel;
  publicLaunchAllowed: boolean;
  requiresExplicitConsent: boolean;
  requiresServerSideGate: boolean;
  requiresSafetyCopy: boolean;
  notes: string;
}

export const TIER_ONE_SAFE_CORE: TierOneFeaturePolicy[] = [
  {
    id: "auth_demo_entry",
    label: "Auth and Demo Entry",
    status: "safe_core",
    riskLevel: "low",
    publicLaunchAllowed: true,
    requiresExplicitConsent: false,
    requiresServerSideGate: true,
    requiresSafetyCopy: false,
    notes: "Users may enter through authenticated account flow or synthetic-data demo mode.",
  },
  {
    id: "privacy_first_onboarding",
    label: "Privacy-First Onboarding",
    status: "safe_core",
    riskLevel: "medium",
    publicLaunchAllowed: true,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Must explain what URAI collects, why it collects it, how it is used, and how users can revoke access.",
  },
  {
    id: "consent_ledger",
    label: "Consent Ledger",
    status: "safe_core",
    riskLevel: "medium",
    publicLaunchAllowed: true,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Sensitive processing must reference a consent snapshot and preserve grant/revoke history.",
  },
  {
    id: "calm_today",
    label: "Calm Today Screen",
    status: "safe_core",
    riskLevel: "low",
    publicLaunchAllowed: true,
    requiresExplicitConsent: false,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Primary Tier 1 surface should feel calm, explainable, and non-clinical.",
  },
  {
    id: "emotional_weather",
    label: "Emotional Weather",
    status: "safe_core",
    riskLevel: "medium",
    publicLaunchAllowed: true,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Must be framed as reflective trend language, not diagnosis, prediction, or clinical assessment.",
  },
  {
    id: "timeline_life_map",
    label: "Timeline and Life Map",
    status: "safe_core",
    riskLevel: "medium",
    publicLaunchAllowed: true,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Must distinguish factual events from symbolic interpretation. Demo mode must use synthetic data only.",
  },
  {
    id: "safe_narrator",
    label: "Safe Narrator Insight",
    status: "safe_core",
    riskLevel: "high",
    publicLaunchAllowed: true,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Must avoid clinical, manipulative, accusatory, certainty, deception, crisis-prediction, or diagnosis language.",
  },
  {
    id: "export_delete",
    label: "Export and Delete Data",
    status: "safe_core",
    riskLevel: "medium",
    publicLaunchAllowed: true,
    requiresExplicitConsent: false,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Required for user control, privacy posture, trust, and launch readiness.",
  },
  {
    id: "feature_flags",
    label: "Feature Flags",
    status: "safe_core",
    riskLevel: "medium",
    publicLaunchAllowed: true,
    requiresExplicitConsent: false,
    requiresServerSideGate: true,
    requiresSafetyCopy: false,
    notes: "Must prevent disabled systems from appearing in UI, routes, Cloud Functions, demo mode, or launch copy.",
  },
  {
    id: "firebase_rules_tests_ci",
    label: "Firebase Rules, Tests, and CI",
    status: "safe_core",
    riskLevel: "high",
    publicLaunchAllowed: true,
    requiresExplicitConsent: false,
    requiresServerSideGate: true,
    requiresSafetyCopy: false,
    notes: "Firestore rules, Storage rules, emulator tests, typecheck, build, and CI must pass before Tier 1 can lock.",
  },
  {
    id: "synthetic_public_demo",
    label: "Synthetic Public Demo",
    status: "safe_core",
    riskLevel: "medium",
    publicLaunchAllowed: true,
    requiresExplicitConsent: false,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Public demo must use synthetic data only and must not access or expose real user data.",
  },
];

export const TIER_ONE_DISABLED_FEATURES: TierOneFeaturePolicy[] = [
  {
    id: "deception_detection",
    label: "Deception Detection",
    status: "do_not_ship",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "False accusations can cause relationship harm, legal exposure, and trust collapse. Not allowed in Tier 1.",
  },
  {
    id: "trust_scoring",
    label: "Trust Scoring",
    status: "do_not_ship",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Should not be exposed as a user-facing relationship judgment or score.",
  },
  {
    id: "facial_intelligence",
    label: "Facial Intelligence",
    status: "legal_safety_hold",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Biometric, bias, app-store, consent, and legal risk. Not allowed in Tier 1.",
  },
  {
    id: "voiceprints",
    label: "Voiceprints and Speaker Identity Graph",
    status: "legal_safety_hold",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Biometric and third-party consent risk. Defer until strict opt-in, consent, and deletion controls exist.",
  },
  {
    id: "data_marketplace",
    label: "Data Marketplace",
    status: "do_not_ship",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Do not include in Tier 1 product, launch copy, onboarding, app-store copy, or monetization flows.",
  },
  {
    id: "crisis_prediction",
    label: "Crisis Prediction",
    status: "legal_safety_hold",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Do not present predictive mental-health, crisis, diagnosis, or emergency claims.",
  },
  {
    id: "adolescent_self_harm_prediction",
    label: "Adolescent Self-Harm Prediction",
    status: "do_not_ship",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Requires clinical, legal, child-safety, escalation, and crisis-response infrastructure. Not Tier 1.",
  },
  {
    id: "employer_individual_analytics",
    label: "Employer Individual Analytics",
    status: "do_not_ship",
    riskLevel: "critical",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "Creates surveillance, workplace harm, privacy, and trust-collapse risk. Not allowed in Tier 1.",
  },
  {
    id: "deep_shadow_mode",
    label: "Deep Shadow Mode",
    status: "tier_2_candidate",
    riskLevel: "high",
    publicLaunchAllowed: false,
    requiresExplicitConsent: true,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "May be explored later only as explicit opt-in reflection. Not public Tier 1.",
  },
  {
    id: "ar_vr_core_launch",
    label: "AR/VR Core Launch",
    status: "demo_only",
    riskLevel: "medium",
    publicLaunchAllowed: false,
    requiresExplicitConsent: false,
    requiresServerSideGate: true,
    requiresSafetyCopy: true,
    notes: "May appear as future vision or controlled demo only. Not required for Tier 1 lock.",
  },
];

export const TIER_ONE_PUBLIC_COPY_BANS = [
  "lie detection",
  "betrayal detection",
  "trust score",
  "predicts crisis",
  "diagnoses mood",
  "detects mental illness",
  "reads your face",
  "knows if someone is lying",
  "sells your emotional data",
  "AI therapist",
];

export const TIER_ONE_SAFE_LANGUAGE = {
  emotionalWeather:
    "URAI shows gentle patterns from your recent activity. These are reflective signals, not medical or psychological diagnoses.",
  narrator:
    "This is an AI-generated reflection based on available signals. You can dismiss, correct, or turn this off anytime.",
  timeline:
    "Some timeline details are factual events; others are symbolic interpretations designed for reflection.",
  privacy: "You control what URAI can collect, process, export, and delete.",
} as const;

export const TIER_ONE_ALL_FEATURES: TierOneFeaturePolicy[] = [
  ...TIER_ONE_SAFE_CORE,
  ...TIER_ONE_DISABLED_FEATURES,
];

export function getTierOneFeaturePolicy(featureId: string): TierOneFeaturePolicy | undefined {
  return TIER_ONE_ALL_FEATURES.find((feature) => feature.id === featureId);
}

export function isTierOnePublicFeatureAllowed(featureId: string): boolean {
  return Boolean(getTierOneFeaturePolicy(featureId)?.publicLaunchAllowed);
}

export function requiresConsentSnapshot(featureId: string): boolean {
  return Boolean(getTierOneFeaturePolicy(featureId)?.requiresExplicitConsent);
}

export function requiresServerSideGate(featureId: string): boolean {
  return Boolean(getTierOneFeaturePolicy(featureId)?.requiresServerSideGate);
}

export function assertTierOnePublicFeatureAllowed(featureId: string): void {
  const feature = getTierOneFeaturePolicy(featureId);

  if (!feature) {
    throw new Error(`URAI Tier 1 Canon violation: unknown feature "${featureId}".`);
  }

  if (!feature.publicLaunchAllowed) {
    throw new Error(`URAI Tier 1 Canon violation: "${featureId}" is not allowed in public Tier 1.`);
  }
}

export function assertNoBannedTierOneCopy(copy: string): void {
  const normalizedCopy = copy.toLowerCase();
  const bannedPhrase = TIER_ONE_PUBLIC_COPY_BANS.find((phrase) =>
    normalizedCopy.includes(phrase.toLowerCase()),
  );

  if (bannedPhrase) {
    throw new Error(
      `URAI Tier 1 Canon copy violation: public copy contains banned phrase "${bannedPhrase}".`,
    );
  }
}
