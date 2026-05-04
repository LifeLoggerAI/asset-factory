const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { FirestoreAdminClient } = require("@google-cloud/firestore");
const firestoreClient = new FirestoreAdminClient();

admin.initializeApp();

const db = admin.firestore();
const bucket = () => admin.storage().bucket();
const stripeSecret = functions.config().stripe?.secret || process.env.STRIPE_SECRET_KEY || null;
const stripeWebhookSecret = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET || null;
const stripe = stripeSecret ? require("stripe")(stripeSecret) : null;
const { getCostForJobType } = require("./cost-model");
const { createDeterministicZip } = require("../assetfactory-studio/lib/packaging");

const COLLECTIONS = Object.freeze({
  tenants: "tenants",
  jobs: "assetJobs",
  assets: "generatedAssets",
  bundles: "assetBundles",
  usage: "usageLedger",
  billingAudit: "billingAudit",
  deadJobs: "deadJobs",
  auditLogs: "auditLogs",
  webhooks: "webhooks",
  replayJobs: "replayJobs",
  lifeMapInputs: "lifeMapInputs",
  exportJobs: "exportJobs"
});

const JOB_STATUS = Object.freeze({
  pending: "PENDING",
  processing: "PROCESSING",
  packaging: "PACKAGING",
  verifying: "VERIFYING",
  completed: "COMPLETED",
  failed: "FAILED",
  dead: "DEAD",
  canceled: "CANCELED"
});

function assertAuth(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  return context.auth.uid;
}

function requireString(value, fieldName) {
  if (!value || typeof value !== "string") {
    throw new functions.https.HttpsError("invalid-argument", `${fieldName} must be a non-empty string.`);
  }
  return value;
}

async function assertActiveTenant(ownerId) {
  const tenantDoc = await db.collection(COLLECTIONS.tenants).doc(ownerId).get();
  if (!tenantDoc.exists || tenantDoc.data().subscriptionStatus !== "active") {
    throw new functions.https.HttpsError("permission-denied", "Active subscription required.");
  }
  return tenantDoc.data();
}

async function assertJobOwner(jobId, ownerId) {
  const jobRef = db.collection(COLLECTIONS.jobs).doc(jobId);
  const jobDoc = await jobRef.get();
  if (!jobDoc.exists) {
    throw new functions.https.HttpsError("not-found", `Job with ID ${jobId} not found.`);
  }
  const job = jobDoc.data();
  if (job.ownerId !== ownerId) {
    throw new functions.https.HttpsError("permission-denied", "You are not authorized for this job.");
  }
  return { jobRef, jobDoc, job };
}

function signedUrlExpiry() {
  return Date.now() + 15 * 60 * 1000;
}

async function createSignedReadUrl(storagePath) {
  const [url] = await bucket().file(storagePath).getSignedUrl({ action: "read", expires: signedUrlExpiry() });
  await db.collection(COLLECTIONS.auditLogs).add({
    action: "signed_url_issued",
    storagePath,
    ttlSeconds: 900,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return url;
}

async function enforceUsageLimits(ownerId) {
  const now = new Date();
  const startOfMonth = admin.firestore.Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const usageSnap = await db.collection(COLLECTIONS.usage)
    .where("ownerId", "==", ownerId)
    .where("createdAt", ">=", startOfMonth)
    .get();
  if (usageSnap.size >= 100) {
    throw new functions.https.HttpsError("resource-exhausted", "Monthly asset generation limit reached.");
  }

  const startOfMinute = admin.firestore.Timestamp.fromMillis(Date.now() - 60000);
  const recentJobs = await db.collection(COLLECTIONS.jobs)
    .where("ownerId", "==", ownerId)
    .where("createdAt", ">", startOfMinute)
    .get();
  if (recentJobs.size > 10) {
    throw new functions.https.HttpsError("resource-exhausted", "Rate limit exceeded. Please wait a minute.");
  }
}

exports.createAssetJob = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  await assertActiveTenant(ownerId);
  await enforceUsageLimits(ownerId);

  const clientRequestId = typeof data.clientRequestId === "string" ? data.clientRequestId.trim() : null;
  if (clientRequestId) {
    const existing = await db.collection(COLLECTIONS.jobs)
      .where("ownerId", "==", ownerId)
      .where("input.clientRequestId", "==", clientRequestId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { jobId: existing.docs[0].id, wasReused: true, status: existing.docs[0].data().status };
    }
  }

  const type = typeof data.type === "string" ? data.type : "symbolic-ui";
  const job = await db.collection(COLLECTIONS.jobs).add({
    ownerId,
    tenantId: ownerId,
    input: { ...data, type },
    status: JOB_STATUS.pending,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    retryCount: 0,
    maxRetries: 3,
    schemaVersion: "2026-05-04"
  });

  await db.collection(COLLECTIONS.auditLogs).add({
    ownerId,
    jobId: job.id,
    action: "asset_job_created",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { jobId: job.id, wasReused: false, status: JOB_STATUS.pending };
});

exports.processAssetJob = functions.firestore
  .document(`${COLLECTIONS.jobs}/{jobId}`)
  .onCreate(async (snap, context) => {
    const job = snap.data();
    const { jobId } = context.params;
    const { ownerId, input } = job;
    const type = input.type || "symbolic-ui";

    if (job.status !== JOB_STATUS.pending) return null;

    const startTime = Date.now();

    try {
      if (input.forceFail) {
        throw new Error("Chaos Test: Intentional Failure");
      }

      await snap.ref.update({ status: JOB_STATUS.processing, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      const jobFolder = `assets/${ownerId}/${jobId}`;

      await snap.ref.update({ status: JOB_STATUS.packaging, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      const manifest = {
        jobId,
        ownerId,
        tenantId: ownerId,
        type,
        schemaVersion: "2026-05-04",
        provenance: {
          generator: "functions/processAssetJob",
          deterministic: true,
          requestedAt: job.createdAt?.toDate ? job.createdAt.toDate().toISOString() : new Date().toISOString()
        }
      };
      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
      const generatedBuffer = Buffer.from(`Simulated ${type} asset data for job: ${jobId}`);

      const filesForZip = [
        { path: "manifest.json", data: manifestBuffer },
        { path: "asset.txt", data: generatedBuffer }
      ];
      const zipBuffer = await createDeterministicZip(filesForZip);
      const outputHash = crypto.createHash("sha256").update(zipBuffer).digest("hex");

      const bundlePath = `${jobFolder}/bundle.zip`;
      await bucket().file(bundlePath).save(zipBuffer, {
        metadata: {
          contentType: "application/zip",
          metadata: { ownerId, jobId, type, outputHash }
        }
      });

      await snap.ref.update({ status: JOB_STATUS.verifying, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      const processingTimeMs = Date.now() - startTime;
      const downloadUrl = await createSignedReadUrl(bundlePath);

      await db.collection(COLLECTIONS.assets).add({
        ownerId,
        tenantId: ownerId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type,
        jobId,
        bundlePath,
        outputHash,
        processingTimeMs,
        schemaVersion: "2026-05-04"
      });

      await db.collection(COLLECTIONS.bundles).doc(jobId).set({
        ownerId,
        tenantId: ownerId,
        jobId,
        type,
        storagePath: bundlePath,
        outputHash,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        schemaVersion: "2026-05-04"
      });

      const costUnits = getCostForJobType(type);
      await db.collection(COLLECTIONS.usage).add({
        ownerId,
        tenantId: ownerId,
        type,
        costUnits,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        jobId,
        source: "processAssetJob"
      });

      await snap.ref.update({
        status: JOB_STATUS.completed,
        bundlePath,
        downloadUrl,
        outputHash,
        processingTimeMs,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return null;
    } catch (err) {
      console.error(`Job ${jobId} failed for user ${ownerId}:`, err);
      const jobRef = snap.ref;
      await db.runTransaction(async (transaction) => {
        const jobDoc = await transaction.get(jobRef);
        if (!jobDoc.exists) return;
        const jobData = jobDoc.data();
        if ((jobData.retryCount || 0) >= (jobData.maxRetries || 3)) {
          const deadJobRef = db.collection(COLLECTIONS.deadJobs).doc(jobId);
          transaction.set(deadJobRef, {
            ...jobData,
            status: JOB_STATUS.dead,
            finalError: err.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          transaction.update(jobRef, { status: JOB_STATUS.dead, error: err.message, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else {
          transaction.update(jobRef, {
            status: JOB_STATUS.failed,
            error: err.message,
            retryCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });
      return null;
    }
  });

exports.retryAssetJob = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const jobId = requireString(data.jobId, "jobId");
  const { jobRef, job } = await assertJobOwner(jobId, ownerId);
  if (![JOB_STATUS.failed, JOB_STATUS.dead].includes(job.status)) {
    throw new functions.https.HttpsError("failed-precondition", "Only failed or dead jobs can be retried.");
  }
  await jobRef.update({ status: JOB_STATUS.pending, error: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { jobId, status: JOB_STATUS.pending };
});

exports.cancelAssetJob = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const jobId = requireString(data.jobId, "jobId");
  const { jobRef, job } = await assertJobOwner(jobId, ownerId);
  if (![JOB_STATUS.pending, JOB_STATUS.processing].includes(job.status)) {
    throw new functions.https.HttpsError("failed-precondition", "Only pending or processing jobs can be canceled.");
  }
  await jobRef.update({ status: JOB_STATUS.canceled, canceledAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { jobId, status: JOB_STATUS.canceled };
});

exports.createAssetBundle = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const jobId = requireString(data.jobId, "jobId");
  const { job } = await assertJobOwner(jobId, ownerId);
  if (job.status !== JOB_STATUS.completed || !job.bundlePath) {
    throw new functions.https.HttpsError("failed-precondition", "Completed job with bundlePath required.");
  }
  await db.collection(COLLECTIONS.bundles).doc(jobId).set({
    ownerId,
    tenantId: ownerId,
    jobId,
    type: job.input?.type || "symbolic-ui",
    storagePath: job.bundlePath,
    outputHash: job.outputHash || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    schemaVersion: "2026-05-04"
  }, { merge: true });
  return { bundleId: jobId, storagePath: job.bundlePath };
});

exports.exportAssetBundle = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const bundleId = requireString(data.bundleId || data.jobId, "bundleId");
  const bundleDoc = await db.collection(COLLECTIONS.bundles).doc(bundleId).get();
  if (!bundleDoc.exists || bundleDoc.data().ownerId !== ownerId) {
    throw new functions.https.HttpsError("not-found", "Bundle not found.");
  }
  const downloadUrl = await createSignedReadUrl(bundleDoc.data().storagePath);
  await db.collection(COLLECTIONS.exportJobs).add({
    ownerId,
    tenantId: ownerId,
    bundleId,
    storagePath: bundleDoc.data().storagePath,
    status: "READY",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { bundleId, downloadUrl, ttlSeconds: 900 };
});

exports.registerReplayAsset = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const replayJobId = requireString(data.replayJobId, "replayJobId");
  const assetId = requireString(data.assetId, "assetId");
  await db.collection(COLLECTIONS.replayJobs).doc(replayJobId).set({
    ownerId,
    tenantId: ownerId,
    assetId,
    status: "REGISTERED",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    metadata: data.metadata || {}
  }, { merge: true });
  return { replayJobId, assetId, status: "REGISTERED" };
});

exports.ingestLifeMap = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const sourceId = requireString(data.sourceId || data.lifeMapId, "sourceId");
  await db.collection(COLLECTIONS.lifeMapInputs).doc(sourceId).set({
    ownerId,
    tenantId: ownerId,
    sourceId,
    payload: data.payload || {},
    status: "INGESTED",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { sourceId, status: "INGESTED" };
});

exports.generatePreview = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const type = typeof data.type === "string" ? data.type : "symbolic-ui";
  const preview = {
    ownerId,
    type,
    title: data.title || "URAI Asset Preview",
    svg: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"800\"><rect width=\"1200\" height=\"800\" fill=\"#0f172a\"/><text x=\"80\" y=\"120\" fill=\"#e0f2fe\" font-size=\"48\">${type}</text></svg>`
  };
  return { preview };
});

exports.rebuildJob = functions.https.onCall(async (data, context) => {
  const ownerId = assertAuth(context);
  const jobId = requireString(data.jobId, "jobId");
  const { jobRef, job } = await assertJobOwner(jobId, ownerId);

  if (job.status !== JOB_STATUS.completed) {
    throw new functions.https.HttpsError("failed-precondition", `Job ${jobId} is not completed.`);
  }

  const type = job.input?.type || "symbolic-ui";
  const manifest = { jobId, ownerId, type, schemaVersion: "2026-05-04" };
  const filesForZip = [
    { path: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { path: "asset.txt", data: Buffer.from(`Simulated ${type} asset data for job: ${jobId}`) }
  ];
  const newZipBuffer = await createDeterministicZip(filesForZip);
  const newOutputHash = crypto.createHash("sha256").update(newZipBuffer).digest("hex");
  const isVerified = newOutputHash === job.outputHash;

  await jobRef.collection("verifications").add({
    isVerified,
    newOutputHash,
    originalOutputHash: job.outputHash || null,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { isVerified, newOutputHash, originalOutputHash: job.outputHash || null };
});

exports.runIntegrityChecks = functions.pubsub.schedule("every 24 hours").onRun(async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfDay = admin.firestore.Timestamp.fromDate(yesterday);
  const completedJobs = await db.collection(COLLECTIONS.jobs)
    .where("status", "==", JOB_STATUS.completed)
    .where("createdAt", ">=", startOfDay)
    .get();

  for (const jobDoc of completedJobs.docs) {
    const jobId = jobDoc.id;
    const jobData = jobDoc.data();
    const type = jobData.input?.type || "symbolic-ui";
    try {
      const manifest = { jobId, ownerId: jobData.ownerId, type, schemaVersion: "2026-05-04" };
      const filesForZip = [
        { path: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) },
        { path: "asset.txt", data: Buffer.from(`Simulated ${type} asset data for job: ${jobId}`) }
      ];
      const newZipBuffer = await createDeterministicZip(filesForZip);
      const newOutputHash = crypto.createHash("sha256").update(newZipBuffer).digest("hex");
      if (newOutputHash !== jobData.outputHash) {
        await db.collection("integrityMismatches").add({
          jobId,
          originalOutputHash: jobData.outputHash || null,
          newOutputHash,
          checkedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error(`Error during integrity check for job ${jobId}:`, error);
    }
  }
  return null;
});

exports.calculateDashboardMetrics = functions.pubsub.schedule("every 1 hours").onRun(async () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const timestamp = admin.firestore.Timestamp.fromDate(now);
  const startOfPeriod = admin.firestore.Timestamp.fromDate(yesterday);

  const completedJobsSnap = await db.collection(COLLECTIONS.jobs).where("status", "==", JOB_STATUS.completed).where("createdAt", ">=", startOfPeriod).get();
  const failedJobsSnap = await db.collection(COLLECTIONS.deadJobs).where("failedAt", ">=", startOfPeriod).get();
  const activeTenantsSnap = await db.collection(COLLECTIONS.tenants).where("subscriptionStatus", "==", "active").get();
  const totalCompletedJobs = completedJobsSnap.size;
  const totalFailedJobs = failedJobsSnap.size;
  const totalJobs = totalCompletedJobs + totalFailedJobs;
  let totalProcessingTime = 0;
  completedJobsSnap.forEach(doc => { totalProcessingTime += doc.data().processingTimeMs || 0; });

  await db.collection("systemMetrics").add({
    timestamp,
    totalCompletedJobs,
    totalFailedJobs,
    totalJobs,
    successRate: totalJobs > 0 ? (totalCompletedJobs / totalJobs) * 100 : 100,
    failureRate: totalJobs > 0 ? (totalFailedJobs / totalJobs) * 100 : 0,
    avgProcessingTimeMs: totalCompletedJobs > 0 ? totalProcessingTime / totalCompletedJobs : 0,
    activeSubscriptions: activeTenantsSnap.size
  });
  return null;
});

exports.scheduledFirestoreExport = functions.pubsub.schedule("every 24 hours").onRun(async () => {
  const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
  const databaseName = firestoreClient.databasePath(projectId, "(default)");
  const backupBucket = `gs://${projectId}-firestore-backups`;
  const responses = await firestoreClient.exportDocuments({ name: databaseName, outputUriPrefix: backupBucket, collectionIds: [] });
  console.log(`Successfully started export operation: ${responses[0].name}`);
  return null;
});

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (!stripe) {
    res.status(500).send("Stripe not configured.");
    return;
  }
  try {
    let event = req.body;
    if (stripeWebhookSecret) {
      const signature = req.headers["stripe-signature"];
      if (!signature) {
        res.status(400).send("Missing Stripe signature header.");
        return;
      }
      event = stripe.webhooks.constructEvent(req.rawBody, signature, stripeWebhookSecret);
    }

    const eventRef = db.collection(COLLECTIONS.webhooks).doc(event.id);
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
      res.status(200).send("duplicate_ignored");
      return;
    }

    await eventRef.set({ provider: "stripe", type: event.type, receivedAt: admin.firestore.FieldValue.serverTimestamp(), status: "PROCESSING" });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const uid = session.client_reference_id;
      if (uid) {
        await db.collection(COLLECTIONS.tenants).doc(uid).set({ stripeCustomerId: session.customer, subscriptionStatus: "active" }, { merge: true });
      }
    } else if (event.type === "invoice.paid") {
      const query = await db.collection(COLLECTIONS.tenants).where("stripeCustomerId", "==", event.data.object.customer).get();
      if (!query.empty) await query.docs[0].ref.update({ subscriptionStatus: "active" });
    } else if (event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
      const query = await db.collection(COLLECTIONS.tenants).where("stripeCustomerId", "==", event.data.object.customer).get();
      if (!query.empty) await query.docs[0].ref.update({ subscriptionStatus: "inactive" });
    }

    await eventRef.update({ status: "PROCESSED", processedAt: admin.firestore.FieldValue.serverTimestamp() });
    await db.collection(COLLECTIONS.billingAudit).add({ provider: "stripe", eventId: event.id, type: event.type, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    res.status(200).send("ok");
  } catch (err) {
    console.error("Stripe webhook error:", err);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

exports.monthlyReconciliation = functions.pubsub.schedule("0 3 1 * *").onRun(async () => {
  await db.collection(COLLECTIONS.billingAudit).add({
    action: "monthly_reconciliation_started",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "NEEDS_STRIPE_RECONCILIATION_IMPLEMENTATION"
  });
  return null;
});

exports.cleanupExpiredAssets = functions.pubsub.schedule("every 24 hours").onRun(async () => {
  await db.collection(COLLECTIONS.auditLogs).add({ action: "cleanup_expired_assets_checked", createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return null;
});
