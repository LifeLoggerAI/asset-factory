export const URAI_CONSENT_SCHEMA_VERSION = "consent-ledger-v1";

export type ConsentGrantStatus = "granted" | "revoked" | "expired";

export type ConsentSource =
  | "privacy_onboarding"
  | "settings"
  | "feature_gate"
  | "demo_mode"
  | "admin_import";

export type ConsentDataCategory =
  | "account"
  | "profile"
  | "audio"
  | "transcript"
  | "location"
  | "device_activity"
  | "emotional_weather"
  | "timeline_event"
  | "narrator_reflection"
  | "export_delete"
  | "synthetic_demo";

export type ConsentProcessingPurpose =
  | "auth"
  | "demo"
  | "reflection"
  | "timeline"
  | "narrator"
  | "export"
  | "delete"
  | "safety"
  | "product_operations";

export interface ConsentScope {
  featureId: string;
  dataCategories: ConsentDataCategory[];
  processingPurposes: ConsentProcessingPurpose[];
}

export interface ConsentSnapshot {
  consentVersion: typeof URAI_CONSENT_SCHEMA_VERSION;
  consentSnapshotId: string;
  userId: string;
  featureId: string;
  status: ConsentGrantStatus;
  source: ConsentSource;
  scope: ConsentScope;
  grantedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
  revocationPath: string;
  policyTextVersion: string;
  notes?: string;
}

export interface ConsentLedgerEntry extends ConsentSnapshot {
  ledgerEntryId: string;
  previousConsentSnapshotId?: string;
  eventType: "grant" | "revoke" | "expire";
}

export interface SensitiveProcessingRequest {
  userId: string;
  featureId: string;
  dataCategories: ConsentDataCategory[];
  processingPurpose: ConsentProcessingPurpose;
  consentSnapshot?: ConsentSnapshot;
}
