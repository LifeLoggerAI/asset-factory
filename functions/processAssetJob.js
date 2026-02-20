const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");

const { defineInt } = require('firebase-functions/params');
const db = admin.firestore();
const bucket = admin.storage().bucket();

// --- Production Safety Controls ---
const MAX_WORKER_CONCURRENCY = defineInt('MAX_WORKER_CONCURRENCY', 20);

// --- Hardened Configuration ---
const MAX_RETRIES = 3;
const COST_TABLE = {
  image: 1, video: 5, code: 2, bundle: 3, default: 1
};
const USD_PER_COST_UNIT = 0.02;

// --- Structured Logger ---
const log = (severity, jobId, message, context = {}) => {
    console.log(JSON.stringify({ severity, jobId, message, ...context }));
};


exports.processAssetJob = functions
  .runWith({ maxInstances: MAX_WORKER_CONCURRENCY.value() })
  .firestore.document("jobs/{jobId}")
  .onCreate(async (snap, context) => {

    const { jobId } = context.params;
    const jobRef = snap.ref;

    log('INFO', jobId, 'Job processing initiated.');

    // 🔐 TRANSACTIONAL STATUS LOCK
    let job;
    try {
        await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(jobRef);
          const jobData = freshSnap.data();

          if (!jobData || !["pending", "retrying"].includes(jobData.status)) {
            job = null;
            return;
          }
          job = jobData;
          tx.update(jobRef, {
            status: "processing",
            startedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
    } catch (error) {
        log('ERROR', jobId, 'Transactional lock failed.', { errorMessage: error.message });
        return;
    }

    if (!job) {
        log('WARNING', jobId, 'Skipping execution: Job not in a processable state.');
        return;
    }

    log('INFO', jobId, 'Job processing started.', { ownerId: job.ownerId, type: job.type });

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const generatedBuffer = Buffer.from(`Asset for job ${jobId} of type ${job.type}`);

      const outputHash = crypto.createHash("sha256").update(generatedBuffer).digest("hex");
      const basePath = `assets/${job.ownerId}/${jobId}`;

      const file = bucket.file(`${basePath}/files/output.txt`);
      await file.save(generatedBuffer, { metadata: { contentType: "text/plain" } });

      const manifest = {
        jobId,
        buildVersion: "1.0.0",
        files: [{ path: `files/output.txt`, sha256: outputHash }]
      };

      await bucket.file(`${basePath}/manifest.json`).save(JSON.stringify(manifest, null, 2), { metadata: { contentType: "application/json" } });

      await jobRef.update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        outputHash
      });

      log('INFO', jobId, 'Job processing completed successfully.');

      // 💰 ATOMIC FINANCIAL UPDATE
      const usageLedgerColRef = db.collection("usage_ledger");
      const existingUsage = await usageLedgerColRef.where("jobId", "==", jobId).limit(1).get();

      if (existingUsage.empty) {
        const tenantRef = db.collection("tenants").doc(job.ownerId);
        const tenantSnap = await tenantRef.get();

        if (!tenantSnap.exists) {
            throw new Error(`CRITICAL: Tenant ${job.ownerId} not found for job ${jobId}.`);
        }
        const tenantData = tenantSnap.data();

        const weightedCost = COST_TABLE[job.type] || COST_TABLE.default;
        const costUSD = weightedCost * USD_PER_COST_UNIT;
        const stripePeriod = tenantData.currentPeriodEnd || null;

        const batch = db.batch();
        const newUsageRef = usageLedgerColRef.doc();

        batch.set(newUsageRef, {
            ownerId: job.ownerId,
            jobId,
            costUnits: weightedCost,
            costUSD,
            stripePeriod: stripePeriod,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        batch.update(tenantRef, {
            usageUnitsThisPeriod: admin.firestore.FieldValue.increment(weightedCost)
        });

        await batch.commit();
        log('INFO', jobId, 'Billing write successful.', { costUSD, costUnits: weightedCost });
      } else {
        log('WARNING', jobId, 'Duplicate billing attempt detected and prevented.');
      }

    } catch (err) {
        const retryCount = (job.retryCount || 0);

        if (retryCount < MAX_RETRIES) {
          log('WARNING', jobId, 'Job processing failed. Scheduling retry.', { retryCount, errorMessage: err.message });
          await jobRef.update({
            status: "retrying",
            retryCount: admin.firestore.FieldValue.increment(1),
            lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: err.message,
          });
        } else {
            log('ERROR', jobId, 'Job failed after max retries.', { errorMessage: err.message });
            await db.collection("dead_jobs").doc(jobId).set({
              ...job,
              failedAt: admin.firestore.FieldValue.serverTimestamp(),
              error: err.message,
              reason: "Max retries exceeded."
            });
            await jobRef.update({
              status: "dead"
            });
        }
    }
  });
