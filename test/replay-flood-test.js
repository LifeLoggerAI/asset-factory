
const { processAssetJob } = require("../functions/processAssetJob");

// Conceptual Test: Replay Flood
describe("Infrastructure Validation: Replay Flood Test", () => {

  const JOB_ID = "replay-flood-job";
  const MOCK_USER_ID = "test-user-replay";
  const FLOOD_COUNT = 20;

  beforeAll(async () => {
    await admin.firestore().collection("jobs").doc(JOB_ID).set({ ownerId: MOCK_USER_ID, status: "pending" });
    await admin.firestore().collection("tenants").doc(MOCK_USER_ID).set({ subscriptionStatus: "active" });
  });

  test("it should withstand a flood of replays without duplicate processing or billing", async () => {
    const event = { params: { jobId: JOB_ID } };

    const promises = [];
    for (let i = 0; i < FLOOD_COUNT; i++) {
      promises.push(processAssetJob(event));
    }

    await Promise.all(promises);

    // ASSERT: Job is completed
    const jobSnap = await admin.firestore().collection("jobs").doc(JOB_ID).get();
    expect(jobSnap.data().status).toBe("completed");

    // ASSERT: Billing is recorded only once
    const usageSnapshot = await admin.firestore().collection("usage_ledger").where("jobId", "==", JOB_ID).get();
    expect(usageSnapshot.size).toBe(1);
  });
});
