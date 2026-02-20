const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.createAssetJob = functions.https.onCall(async (data, context) => {

  // 1. Authentication Check
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication is required.");
  }
  const ownerId = context.auth.uid;

  // 2. Subscription Gating Check
  const tenantRef = db.collection("tenants").doc(ownerId);
  const tenantSnap = await tenantRef.get();

  if (!tenantSnap.exists || tenantSnap.data().subscriptionStatus !== "active") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "An active subscription is required to create assets."
    );
  }

  // 3. Monthly Usage Limit Check
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthTimestamp = admin.firestore.Timestamp.fromDate(startOfMonth);

  const usageSnap = await db.collection("usage")
    .where("ownerId", "==", ownerId)
    .where("createdAt", ">=", startOfMonthTimestamp)
    .get();

  // TODO: Make this limit configurable from admin settings (e.g., system/config)
  if (usageSnap.size >= 100) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "You have reached your monthly asset generation limit."
    );
  }

  // 4. Rate Limiting (per minute)
  const recentJobs = await db.collection("jobs")
    .where("ownerId", "==", ownerId)
    .where("createdAt", ">", admin.firestore.Timestamp.fromMillis(Date.now() - 60000))
    .get();

  // TODO: Make this configurable
  if (recentJobs.size > 10) { 
    throw new functions.https.HttpsError("resource-exhausted", "Rate limit exceeded. Please try again in a minute.");
  }

  // 5. Create the Job
  const jobRef = await db.collection("jobs").add({
    ownerId,
    type: data.type || 'default',
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    params: data.params || {}
  });

  return { jobId: jobRef.id };
});
