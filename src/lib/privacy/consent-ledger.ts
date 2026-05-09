import { requiresConsentSnapshot } from "../tier-locks/tier-one-canon";
import {
  URAI_CONSENT_SCHEMA_VERSION,
  type ConsentDataCategory,
  type ConsentLedgerEntry,
  type ConsentProcessingPurpose,
  type ConsentSnapshot,
  type ConsentSource,
  type SensitiveProcessingRequest,
} from "./consent-types";

export function createConsentSnapshotId(userId: string, featureId: string, timestamp: string): string {
  return `consent_${userId}_${featureId}_${timestamp.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function createConsentSnapshot(input: {
  userId: string;
  featureId: string;
  source: ConsentSource;
  dataCategories: ConsentDataCategory[];
  processingPurposes: ConsentProcessingPurpose[];
  policyTextVersion: string;
  timestamp?: string;
  notes?: string;
}): ConsentSnapshot {
  const timestamp = input.timestamp ?? new Date().toISOString();

  return {
    consentVersion: URAI_CONSENT_SCHEMA_VERSION,
    consentSnapshotId: createConsentSnapshotId(input.userId, input.featureId, timestamp),
    userId: input.userId,
    featureId: input.featureId,
    status: "granted",
    source: input.source,
    scope: {
      featureId: input.featureId,
      dataCategories: [...input.dataCategories],
      processingPurposes: [...input.processingPurposes],
    },
    grantedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    revocationPath: `/settings/privacy/consent/${input.featureId}`,
    policyTextVersion: input.policyTextVersion,
    notes: input.notes,
  };
}

export function revokeConsentSnapshot(snapshot: ConsentSnapshot, timestamp = new Date().toISOString()): ConsentSnapshot {
  return {
    ...snapshot,
    status: "revoked",
    revokedAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createConsentLedgerEntry(input: {
  snapshot: ConsentSnapshot;
  eventType: ConsentLedgerEntry["eventType"];
  previousConsentSnapshotId?: string;
}): ConsentLedgerEntry {
  return {
    ...input.snapshot,
    ledgerEntryId: `ledger_${input.snapshot.consentSnapshotId}_${input.eventType}`,
    eventType: input.eventType,
    previousConsentSnapshotId: input.previousConsentSnapshotId,
  };
}

export function hasActiveConsent(snapshot: ConsentSnapshot | undefined, request: SensitiveProcessingRequest): boolean {
  if (!snapshot) {
    return false;
  }

  if (snapshot.status !== "granted") {
    return false;
  }

  if (snapshot.userId !== request.userId || snapshot.featureId !== request.featureId) {
    return false;
  }

  if (snapshot.consentVersion !== URAI_CONSENT_SCHEMA_VERSION) {
    return false;
  }

  const categoryAllowed = request.dataCategories.every((category) =>
    snapshot.scope.dataCategories.includes(category),
  );

  const purposeAllowed = snapshot.scope.processingPurposes.includes(request.processingPurpose);

  return categoryAllowed && purposeAllowed;
}

export function assertSensitiveProcessingAllowed(request: SensitiveProcessingRequest): void {
  const consentRequired = requiresConsentSnapshot(request.featureId);

  if (!consentRequired) {
    return;
  }

  if (!hasActiveConsent(request.consentSnapshot, request)) {
    throw new Error(
      `URAI consent violation: feature "${request.featureId}" cannot process sensitive data without an active consent snapshot.`,
    );
  }
}

export function assertConsentRevocationPath(snapshot: ConsentSnapshot): void {
  if (!snapshot.revocationPath || !snapshot.revocationPath.startsWith("/settings/privacy/consent/")) {
    throw new Error(`URAI consent violation: snapshot "${snapshot.consentSnapshotId}" has no valid revocation path.`);
  }
}
