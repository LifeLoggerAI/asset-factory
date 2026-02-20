
const admin = require("firebase-admin");
const crypto = require("crypto");
const functions = require("firebase-functions");
const db = admin.firestore();

// --- Production Configuration ---
const { defineInt, defineString, defineBoolean } = require('firebase-functions/params');

const SYSTEM_LOCKDOWN = defineBoolean('SYSTEM_LOCKDOWN', false); // Global kill switch
const MAX_CALLS_PER_MINUTE = defineInt('MAX_CALLS_PER_MINUTE', 5);
const SYSTEM_BETA_ACCESS_REQUIRED = defineBoolean('SYSTEM_BETA_ACCESS_REQUIRED', false);
const USAGE_LIMIT_UNITS_PER_MONTH = defineInt('USAGE_LIMIT_UNITS_PER_MONTH', 1000);

const JOB_TYPE_DEFAULT = defineString('JOB_TYPE_DEFAULT', 'image');
const ENGINE_VERSION = defineString('ENGINE_VERSION', '1.0.0');
const MODEL_VERSION = defineString('MODEL_VERSION', 'default_model_v1');

async function createJobLogic(data, uid) {
  // 1. GLOBAL KILL SWITCH
  if (SYSTEM_LOCKDOWN.value()) {
      throw new functions.https.HttpsError("unavailable", "The system is currently undergoing maintenance. Please try again later.");
  }

  // --- Tenant, Subscription, and Rate Limiting Checks ---
  const tenantRef = db.collection("tenants").doc(uid);
  const [tenantSnap, recentJobs] = await Promise.all([
    tenantRef.get(),
    db.collection("jobs")
      .where("ownerId", "==", uid)
      .where("createdAt", ">", admin.firestore.Timestamp.fromMillis(Date.now() - 60000))
      .get()
  ]);

  if (!tenantSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Tenant record not found.");
  }
  const tenantData = tenantSnap.data();

  if (SYSTEM_BETA_ACCESS_REQUIRED.value() && tenantData.betaAccess !== true) {
      throw new functions.https.HttpsError("permission-denied", "This feature is currently in private beta and your account is not enabled.");
  }

  if (tenantData.testAccount !== true && recentJobs.size >= MAX_CALLS_PER_MINUTE.value()) {
    throw new functions.https.HttpsError("resource-exhausted", "Too many requests. Please wait a moment and try again.");
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const periodEnd = tenantData.currentPeriodEnd ? tenantData.currentPeriodEnd.seconds : 0;
  if (tenantData.subscriptionStatus !== "active" || (periodEnd && periodEnd < nowInSeconds)) {
    throw new functions.https.HttpsError("permission-denied", `Your subscription is not active or has expired. Please update your billing information.`);
  }

  const usageThisPeriod = tenantData.usageUnitsThisPeriod || 0;
  if (tenantData.testAccount !== true && usageThisPeriod >= USAGE_LIMIT_UNITS_PER_MONTH.value()) {
      throw new functions.https.HttpsError("resource-exhausted", "You have exceeded your usage limit for the current billing period.");
  }

  // --- Deterministic Fingerprinting (for idempotency and caching) ---
  const prompt = data.prompt || "";
  const engineVersion = ENGINE_VERSION.value();
  const modelVersion = MODEL_VERSION.value();
  const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");
  const deterministicFingerprint = crypto.createHash("sha256").update(promptHash + engineVersion + modelVersion).digest("hex");

  // --- Job Creation ---
  const jobData = {
    ownerId: uid,
    status: "pending",
    type: data.type || JOB_TYPE_DEFAULT.value(),
    prompt,
    createdAt: admin.firestore.Timestamp.now(),
    retryCount: 0,
    maxRetries: 3,
    engineVersion,
    modelVersion,
    promptHash,
    deterministicFingerprint,
  };

  const jobRef = await db.collection("jobs").add(jobData);

  return { jobId: jobRef.id };
}

module.exports = { createJobLogic };
