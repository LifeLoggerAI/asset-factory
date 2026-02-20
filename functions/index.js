
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {FirestoreAdminClient} = require('@google-cloud/firestore');
const firestoreClient = new FirestoreAdminClient();
admin.initializeApp();

const db = admin.firestore();
const stripe = functions.config().stripe ? require("stripe")(functions.config().stripe.secret) : null;
const { getCostForJobType } = require("./cost-model");
const { createDeterministicZip } = require("../assetfactory-studio/lib/packaging");

exports.createAssetJob = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const ownerId = context.auth.uid;

  if (data.clientRequestId) {
    const existing = await db.collection("jobs")
      .where("ownerId", "==", ownerId)
      .where("input.clientRequestId", "==", data.clientRequestId)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log(`[Idempotency] Found existing job ${existing.docs[0].id} for clientRequestId ${data.clientRequestId}`);
      return { jobId: existing.docs[0].id, wasReused: true };
    }
  }

  const tenantDoc = await db.collection("tenants").doc(ownerId).get();
  if (!tenantDoc.exists || tenantDoc.data().subscriptionStatus !== "active") {
    throw new functions.https.HttpsError("permission-denied", "Active subscription required.");
  }

  const now = new Date();
  const startOfMonth = admin.firestore.Timestamp.fromDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const usageSnap = await db.collection("usage").where("ownerId", "==", ownerId).where("createdAt", ">=", startOfMonth).get();
  if (usageSnap.size >= 100) {
    throw new functions.https.HttpsError("resource-exhausted", "Monthly asset generation limit reached.");
  }

  const startOfMinute = admin.firestore.Timestamp.fromMillis(Date.now() - 60000);
  const recentJobs = await db.collection("jobs").where("ownerId", "==", ownerId).where("createdAt", ">", startOfMinute).get();
  if (recentJobs.size > 10) {
    throw new functions.https.HttpsError("resource-exhausted", "Rate limit exceeded. Please wait a minute.");
  }

  const job = await db.collection("jobs").add({
    ownerId,
    input: data,
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    retryCount: 0,
    maxRetries: 3,
  });

  return { jobId: job.id, wasReused: false };
});

exports.processAssetJob = functions.firestore
  .document("jobs/{jobId}")
  .onCreate(async (snap, context) => {
    const job = snap.data();
    const { jobId } = context.params;
    const { ownerId, input, createdAt } = job;
    const type = input.type || 'default';

    if (job.status !== "pending") return null;

    const startTime = Date.now();

    try {
      if (input.forceFail) {
        throw new Error("Chaos Test: Intentional Failure");
      }

      await snap.ref.update({ status: "processing" });

      const bucket = admin.storage().bucket();
      const jobFolder = `assets/${ownerId}/${jobId}`;

      await snap.ref.update({ status: "packaging" });
      const manifest = { jobId, ownerId, type, createdAt: createdAt.toDate().toISOString() };
      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
      const generatedBuffer = Buffer.from(`Simulated asset data for job: ${jobId}`);
      
      const filesForZip = [
        { path: 'manifest.json', data: manifestBuffer },
        { path: 'asset.png', data: generatedBuffer }
      ];
      const zipBuffer = await createDeterministicZip(filesForZip);
      const outputHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
      
      const bundleFile = bucket.file(`${jobFolder}/bundle.zip`);
      await bundleFile.save(zipBuffer, { metadata: { contentType: 'application/zip' } });
      const [bundleUrl] = await bundleFile.getSignedUrl({ action: "read", expires: "03-01-2500" });

      await snap.ref.update({ status: "verifying" });
      const processingTimeMs = Date.now() - startTime;

      await db.collection("assets").add({
        ownerId, createdAt: admin.firestore.FieldValue.serverTimestamp(), type, jobId, bundleUrl, outputHash, processingTimeMs
      });

      const costUnits = getCostForJobType(type);
      await db.collection("usage").add({
        ownerId, type, costUnits, createdAt: admin.firestore.FieldValue.serverTimestamp(), jobId,
      });

      await snap.ref.update({ status: "completed", bundleUrl, outputHash, processingTimeMs });
      return null;

    } catch (err) {
        console.error(`Job ${jobId} failed for user ${ownerId}:`, err);
        const jobRef = snap.ref;
        await db.runTransaction(async (transaction) => {
            const jobDoc = await transaction.get(jobRef);
            if (!jobDoc.exists) return;
            const jobData = jobDoc.data();
            if ((jobData.retryCount || 0) >= (jobData.maxRetries || 3)) {
                const deadJobRef = db.collection('dead_jobs').doc(jobId);
                transaction.set(deadJobRef, { ...jobData, status: 'dead', finalError: err.message, failedAt: admin.firestore.FieldValue.serverTimestamp() });
                transaction.delete(jobRef);
            } else {
                transaction.update(jobRef, { status: 'failed', error: err.message, retryCount: admin.firestore.FieldValue.increment(1) });
            }
        });
        return null;
    }
  });

exports.rebuildJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Login required");
    }
    const ownerId = context.auth.uid;
    const { jobId } = data;

    if (!jobId) {
        throw new functions.https.HttpsError("invalid-argument", "A jobId must be provided.");
    }

    const jobRef = db.collection("jobs").doc(jobId);
    const jobDoc = await jobRef.get();

    if (!jobDoc.exists) {
        throw new functions.https.HttpsError("not-found", `Job with ID ${jobId} not found.`);
    }

    const jobData = jobDoc.data();

    if (jobData.ownerId !== ownerId) {
        throw new functions.https.HttpsError("permission-denied", "You are not authorized to rebuild this job.");
    }

    if (jobData.status !== 'completed') {
        throw new functions.https.HttpsError("failed-precondition", `Job ${jobId} is not in 'completed' state.`);
    }

    const { input, outputHash: originalOutputHash, createdAt } = jobData;
    const type = input.type || 'default';

    const manifest = { jobId, ownerId, type, createdAt: createdAt.toDate().toISOString() };
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
    const generatedBuffer = Buffer.from(`Simulated asset data for job: ${jobId}`);

    const filesForZip = [
        { path: 'manifest.json', data: manifestBuffer },
        { path: 'asset.png', data: generatedBuffer }
    ];
    const newZipBuffer = await createDeterministicZip(filesForZip);
    const newOutputHash = crypto.createHash('sha256').update(newZipBuffer).digest('hex');

    const isVerified = newOutputHash === originalOutputHash;

    await jobRef.collection('verifications').add({
        isVerified,
        newOutputHash,
        originalOutputHash,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { isVerified, newOutputHash, originalOutputHash };
});

exports.runIntegrityChecks = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfDay = admin.firestore.Timestamp.fromDate(yesterday);

    const completedJobs = await db.collection('jobs')
                                .where('status', '==', 'completed')
                                .where('createdAt', '>=', startOfDay)
                                .get();

    if (completedJobs.empty) {
        return null;
    }

    for (const jobDoc of completedJobs.docs) {
        const jobId = jobDoc.id;
        const jobData = jobDoc.data();
        const { input, outputHash: originalOutputHash, createdAt, ownerId } = jobData;
        const type = input.type || 'default';

        try {
            const manifest = { jobId, ownerId, type, createdAt: createdAt.toDate().toISOString() };
            const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
            const generatedBuffer = Buffer.from(`Simulated asset data for job: ${jobId}`);

            const filesForZip = [
                { path: 'manifest.json', data: manifestBuffer },
                { path: 'asset.png', data: generatedBuffer }
            ];
            const newZipBuffer = await createDeterministicZip(filesForZip);
            const newOutputHash = crypto.createHash('sha256').update(newZipBuffer).digest('hex');

            if (newOutputHash !== originalOutputHash) {
                await db.collection('integrity_mismatches').add({
                    jobId,
                    originalOutputHash,
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

exports.calculateDashboardMetrics = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const timestamp = admin.firestore.Timestamp.fromDate(now);
    const startOfPeriod = admin.firestore.Timestamp.fromDate(yesterday);

    const completedJobsSnap = await db.collection('jobs').where('status', '==', 'completed').where('createdAt', '>=', startOfPeriod).get();
    const failedJobsSnap = await db.collection('dead_jobs').where('failedAt', '>=', startOfPeriod).get();
    const activeTenantsSnap = await db.collection('tenants').where('subscriptionStatus', '==', 'active').get();

    const totalCompletedJobs = completedJobsSnap.size;
    const totalFailedJobs = failedJobsSnap.size;
    const totalJobs = totalCompletedJobs + totalFailedJobs;

    const successRate = totalJobs > 0 ? (totalCompletedJobs / totalJobs) * 100 : 100;
    const failureRate = totalJobs > 0 ? (totalFailedJobs / totalJobs) * 100 : 0;

    let totalProcessingTime = 0;
    completedJobsSnap.forEach(doc => {
        totalProcessingTime += doc.data().processingTimeMs || 0;
    });
    const avgProcessingTimeMs = totalCompletedJobs > 0 ? totalProcessingTime / totalCompletedJobs : 0;

    const metrics = {
        timestamp,
        totalCompletedJobs,
        totalFailedJobs,
        totalJobs,
        successRate,
        failureRate,
        avgProcessingTimeMs,
        activeSubscriptions: activeTenantsSnap.size
    };

    await db.collection('system_metrics').add(metrics);
    return null;
});

exports.scheduledFirestoreExport = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const databaseName = firestoreClient.databasePath(projectId, '(default)');
    const bucket = `gs://${projectId}-firestore-backups`;

    try {
        const responses = await firestoreClient.exportDocuments({
            name: databaseName,
            outputUriPrefix: bucket,
            collectionIds: []
        });
        const response = responses[0];
        console.log(`Successfully started export operation: ${response['name']}`);
        return null;
    } catch (err) {
        console.error(`Failed to start Firestore export:`, err);
        throw new functions.https.HttpsError('internal', 'Could not start Firestore export.');
    }
});

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (!stripe) {
      res.status(500).send("Stripe not configured.");
      return;
  }
  const event = req.body;
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const uid = session.client_reference_id;
      if (uid) {
          await db.collection("tenants").doc(uid).set({ stripeCustomerId: session.customer, subscriptionStatus: "active" }, { merge: true });
      }
    } else if (event.type === "invoice.paid") {
        const query = await db.collection('tenants').where('stripeCustomerId', '==', event.data.object.customer).get();
        if(!query.empty) await query.docs[0].ref.update({ subscriptionStatus: 'active' });
    } else if (event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
        const query = await db.collection('tenants').where('stripeCustomerId', '==', event.data.object.customer).get();
        if(!query.empty) await query.docs[0].ref.update({ subscriptionStatus: 'inactive' });
    }
    res.status(200).send("ok");
  } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
  }
});
