import {
  URAI_EXPORT_DELETE_VERSION,
  assertDataControlRequestOwnedByUser,
  assertDataControlRequestSafe,
  createDeleteRequest,
  createExportRequest,
} from "../../src/lib/privacy/export-delete-verification";

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

const exportRequest = createExportRequest({
  requestId: "export_123",
  userId: "user_123",
  requestedAt: "2026-05-09T00:00:00.000Z",
});

assert(exportRequest.type === "export", "export request should have export type.");
assert(exportRequest.version === URAI_EXPORT_DELETE_VERSION, "export request should carry current version.");
assertDataControlRequestSafe(exportRequest);
assertDataControlRequestOwnedByUser(exportRequest, "user_123");

const deleteRequest = createDeleteRequest({
  requestId: "delete_123",
  userId: "user_123",
  requestedAt: "2026-05-09T00:00:00.000Z",
});

assert(deleteRequest.type === "delete", "delete request should have delete type.");
assert(deleteRequest.version === URAI_EXPORT_DELETE_VERSION, "delete request should carry current version.");
assertDataControlRequestSafe(deleteRequest);

mustThrow(
  () => assertDataControlRequestOwnedByUser({ ...deleteRequest, targetUserId: "other_user" }, "user_123"),
  "cross-user delete request should fail ownership check.",
);

mustThrow(
  () => assertDataControlRequestSafe({ ...exportRequest, includesDataCategories: [] }),
  "export/delete request without data categories should fail.",
);
