const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { defineString, defineBoolean } = require('firebase-functions/params');

db = admin.firestore();

// --- Production Safety Controls ---
const SYSTEM_LOCKDOWN = defineBoolean('SYSTEM_LOCKDOWN', false);
const BETA_ACCESS_REQUIRED = defineBoolean('BETA_ACCESS_REQUIRED', true);
const MONTHLY_USAGE_LIMIT = defineString('MONTHLY_USAGE_LIMIT', '100');
const RATE_LIMIT_PER_MINUTE = defineString('RATE_LIMIT_PER_MINUTE', '10');

exports.createAssetJob = functions.https.onCall(async (data, context) => {

  // Global Kill Switch
  if (SYSTEM_LOCKDOWN.value()) {
      throw new functions.https.HttpsError("unavailable", "The system is currently undergoing maintenance. Please try again later.");
  }

  // 1. Authentication Check
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication is required.");
  }
  const ownerId = context.auth.uid;

  // 2. Subscription & Access Control
  const tenantRef = db.collection("tenants").doc(ownerId);
  const tenantSnap = await tenantRef.get();
  const tenant = tenantSnap.data();

  if (!tenantSnap.exists) {
      throw new functions.https.HttpsError("permission-denied", "Tenant account not found.");
  }

  // Enforce Beta Access if Required
  if (BETA_ACCESS_REQUIRED.value() && tenant.betaAccess !== true) {
      throw new functions.https.HttpsError("permission-denied", "This feature is currently in private beta.");
  }
  
  // Enforce Active Subscription
  if (tenant.subscriptionStatus !== "active") {
    throw new functions.https.HttpsError("permission-denied", "An active subscription is required.");
  }

  // Enforce Billing Period
  const now = admin.firestore.Timestamp.now();
  if (!tenant.currentPeriodEnd || tenant.currentPeriodEnd <= now) {
      throw new functions.https.HttpsError("permission-denied", "Your billing period has expired. Please update your subscription.");
  }

  // 3. Monthly Usage Limit Check
  const periodStart = new Date(tenant.currentPeriodEnd.toDate());
  periodStart.setMonth(periodStart.getMonth() - 1);
  const periodStartTimestamp = admin.firestore.Timestamp.fromDate(periodStart);

  const usageSnap = await db.collection("usage_ledger")
    .where("ownerId", "==", ownerId)
    .where("createdAt", ">=", periodStartTimestamp)
    .get();

  if (usageSnap.size >= parseInt(MONTHLY_USAGE_LIMIT.value())) {
    throw new functions.https.HttpsError("resource-exhausted", "You have reached your monthly usage limit.");
  }

  // 4. Rate Limiting (per minute)
  const recentJobs = await db.collection("jobs")
    .where("ownerId", "==", ownerId)
    .where("createdAt", ">", admin.firestore.Timestamp.fromMillis(Date.now() - 60000))
    .get();

  if (recentJobs.size > parseInt(RATE_LIMIT_PER_MINUTE.value())) {
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
