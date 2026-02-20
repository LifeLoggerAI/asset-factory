
const functions = require("firebase-functions");
const { createJobLogic } = require("./lib/jobs");

/**
 * A secure HTTPS-callable function to create a new asset generation job.
 * This function primarily handles authentication and then passes control to the core logic.
 */
exports.createAssetJob = functions
  .runWith({
    enforceAppCheck: true, // Protect against client-side abuse
  })
  .https.onCall(async (data, context) => {
    // 1. Enforce authentication
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    const { uid } = context.auth;

    // 2. Delegate to the core, testable job creation logic
    try {
      const result = await createJobLogic(data, uid);
      return result;
    } catch (error) {
      // The core logic will throw specific HttpsError types which are passed to the client.
      // Log the original error for server-side debugging if it's not an HttpsError.
      if (!(error instanceof functions.https.HttpsError)) {
        console.error(`[createAssetJob] Unexpected error for user ${uid}:`, error);
        // Return a generic error to the client to avoid leaking implementation details.
        throw new functions.https.HttpsError("internal", "An unexpected error occurred.");
      }
      // Re-throw HttpsErrors to be sent to the client as is.
      throw error;
    }
  });
