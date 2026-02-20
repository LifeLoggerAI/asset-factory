
const { processAssetJob } = require("../functions/processAssetJob");

// Conceptual Test: Corrupted Job Document
describe("Infrastructure Validation: Corrupted Job Document Test", () => {

  const JOB_ID = "corrupted-job";
  const MOCK_USER_ID = "test-user-corrupted";

  beforeAll(async () => {
    // Create a job with missing/invalid fields
    await admin.firestore().collection("jobs").doc(JOB_ID).set({
      ownerId: MOCK_USER_ID,
      status: "pending",
      // Missing 'type' and 'prompt' which the function might expect
    });
  });

  test("it should fail gracefully and move the job to the dead-letter queue", async () => {
    const event = { params: { jobId: JOB_ID } };

    await processAssetJob(event);

    // ASSERT: Original job should be marked as 'dead'
    const jobSnap = await admin.firestore().collection("jobs").doc(JOB_ID).get();
    expect(jobSnap.data().status).toBe("dead");

    // ASSERT: A copy should exist in the 'dead_jobs' collection
    const deadJobSnap = await admin.firestore().collection("dead_jobs").doc(JOB_ID).get();
    expect(deadJobSnap.exists).toBe(true);
    expect(deadJobSnap.data().reason).toBe("Corrupted or invalid job data.");
  });
});
