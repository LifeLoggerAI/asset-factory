import { assertFeatureEnabled } from "../feature-flags/urai-feature-flags";

export const URAI_EXPORT_DELETE_VERSION = "export-delete-tier-1-v1";

export type DataControlRequestType = "export" | "delete";
export type DataControlRequestStatus = "requested" | "processing" | "completed" | "failed";

export interface DataControlRequest {
  requestId: string;
  ownerId: string;
  targetUserId: string;
  type: DataControlRequestType;
  status: DataControlRequestStatus;
  requestedAt: string;
  completedAt?: string;
  version: typeof URAI_EXPORT_DELETE_VERSION;
  includesDataCategories: string[];
}

export function createExportRequest(input: {
  requestId: string;
  userId: string;
  requestedAt?: string;
  includesDataCategories?: string[];
}): DataControlRequest {
  assertFeatureEnabled("export_delete", "production");

  return {
    requestId: input.requestId,
    ownerId: input.userId,
    targetUserId: input.userId,
    type: "export",
    status: "requested",
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    version: URAI_EXPORT_DELETE_VERSION,
    includesDataCategories: input.includesDataCategories ?? ["account", "jobs", "assets", "timeline", "narrator", "consent"],
  };
}

export function createDeleteRequest(input: {
  requestId: string;
  userId: string;
  requestedAt?: string;
  includesDataCategories?: string[];
}): DataControlRequest {
  assertFeatureEnabled("export_delete", "production");

  return {
    requestId: input.requestId,
    ownerId: input.userId,
    targetUserId: input.userId,
    type: "delete",
    status: "requested",
    requestedAt: input.requestedAt ?? new Date().toISOString(),
    version: URAI_EXPORT_DELETE_VERSION,
    includesDataCategories: input.includesDataCategories ?? ["account", "jobs", "assets", "timeline", "narrator", "consent"],
  };
}

export function assertDataControlRequestOwnedByUser(request: DataControlRequest, userId: string): void {
  if (request.ownerId !== userId || request.targetUserId !== userId) {
    throw new Error(`URAI export/delete violation: request "${request.requestId}" does not belong to user "${userId}".`);
  }
}

export function assertDataControlRequestSafe(request: DataControlRequest): void {
  assertFeatureEnabled("export_delete", "production");

  if (request.version !== URAI_EXPORT_DELETE_VERSION) {
    throw new Error(`URAI export/delete violation: request "${request.requestId}" has invalid version.`);
  }

  if (request.status !== "requested" && request.status !== "processing" && request.status !== "completed" && request.status !== "failed") {
    throw new Error(`URAI export/delete violation: request "${request.requestId}" has invalid status.`);
  }

  if (!request.includesDataCategories.length) {
    throw new Error(`URAI export/delete violation: request "${request.requestId}" does not declare data categories.`);
  }

  assertDataControlRequestOwnedByUser(request, request.ownerId);
}
