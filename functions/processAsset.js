
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// --- Hardened Configuration ---
const MAX_RETRIES = 3;
const COST_TABLE = {
  image: 1,
  video: 5,
  code: 2,
  bundle: 3,
  default: 1
};
const USD_PER_COST_UNIT = 0.02; // Example: 2 cents per unit

exports.processAssetJob = functions.firestore
  .document("jobs/{jobId}")
  .onCreate(async (snap, context) => {
    const { jobId } = context.params;
    const jobRef = snap.ref;

    // --- Transactional Idempotency Lock ---
    try {
      await db.runTransaction(async (tx) => {
        const freshSnap = await tx.get(jobRef);
        const jobData = freshSnap.data();

        if (jobData.status !== "pending") {
          // Job already claimed, log and exit.
          console.log(JSON.stringify({
            severity: "INFO",
            message: `Job ${jobId} was already claimed. Current status: ${jobData.status}`,
            jobId: jobId,
            type: "job_claim_skipped"
          }));
          return;
        }

        tx.update(jobRef, {
          status: "processing",
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(JSON.stringify({
            severity: "INFO",
            message: `Acquired lock for job ${jobId}.`,
            jobId: jobId,
            type: "job_state_change",
            status: "processing"
        }));
      });
    } catch (e) {
      console.error(JSON.stringify({
        severity: "CRITICAL",
        message: `Failed to acquire transaction lock for job ${jobId}. Function will terminate.`,
        jobId: jobId,
        type: "job_lock_failure",
        error: e.message
      }));
      return;
    }

    const job = (await jobRef.get()).data();
    const { ownerId, type } = job;

    try {
      // --- Financial Integrity Protection ---
      const tenantSnap = await db.collection("tenants").doc(ownerId).get();
      if (!tenantSnap.exists || tenantSnap.data().subscriptionStatus !== 'active') {
        const reason = !tenantSnap.exists ? "Tenant not found" : `Subscription inactive (status: ${tenantSnap.data().subscriptionStatus})`;
        console.error(JSON.stringify({
          severity: "ERROR",
          message: `Halting job ${jobId} due to invalid tenant state: ${reason}`,
          jobId: jobId,
          ownerId: ownerId,
          type: "job_halted",
          reason: reason
        }));
        await db.collection("dead_jobs").doc(jobId).set({ ...job, finalError: reason, failedAt: admin.firestore.FieldValue.serverTimestamp() });
        await jobRef.update({ status: "failed" });
        return;
      }

      // --- Main Processing Logic --- 
      // 🔥 TODO: Replace with your actual asset generation.
      const simulatedOutputHash = `sha256-placeholder-${jobId}`;

      // --- Financial-Grade Ledger ---
      const usageQuery = await db.collection("usage_ledger").where("jobId", "==", jobId).limit(1).get();
      if (usageQuery.empty) {
        const weightedCost = COST_TABLE[type] || COST_TABLE.default;
        const costUSD = weightedCost * USD_PER_COST_UNIT;
        await db.collection("usage_ledger").add({
          ownerId, jobId, type,
          costUnits: weightedCost,
          costUSD: costUSD,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(JSON.stringify({
            severity: "INFO",
            message: `Recorded ${weightedCost} cost units ($${costUSD}) for job ${jobId}.`,
            jobId: jobId,
            ownerId: ownerId,
            type: "billing_recorded"
        }));
      }
      
      // --- Finalize Asset Record ---
      await db.collection("assets").add({ ownerId, jobId, type, outputHash: simulatedOutputHash, url: `https://storage.fake/${ownerId}/${jobId}.zip`, createdAt: admin.firestore.FieldValue.serverTimestamp() });

      // Mark job as completed
      await jobRef.update({ status: "completed", completedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(JSON.stringify({
        severity: "INFO",
        message: `Job ${jobId} completed successfully.`,
        jobId: jobId,
        ownerId: ownerId,
        type: "job_state_change",
        status: "completed"
      }));

    } catch (err) {
      // --- Retry & Dead-Letter Logic ---
      const currentRetry = job.retryCount || 0;
      if (currentRetry < MAX_RETRIES) {
        console.warn(JSON.stringify({
          severity: "WARNING",
          message: `Job ${jobId} failed, scheduling for retry (${currentRetry + 1}/${MAX_RETRIES}).`,
          jobId: jobId, ownerId: ownerId, type: "job_retrying", error: err.message
        }));
        await jobRef.update({ status: "pending", retryCount: currentRetry + 1, lastError: err.message });
      } else {
        console.error(JSON.stringify({
          severity: "CRITICAL",
          message: `Job ${jobId} failed after ${MAX_RETRIES} retries. Moving to dead-letter queue.`,
          jobId: jobId, ownerId: ownerId, type: "job_dead", error: err.message
        }));
        await db.collection("dead_jobs").doc(jobId).set({ ...job, finalError: err.message, failedAt: admin.firestore.FieldValue.serverTimestamp() });
        await jobRef.update({ status: "failed" });
      }
    }
  });
