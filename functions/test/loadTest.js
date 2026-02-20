
const admin = require("firebase-admin");

// Initialize the Admin SDK
// Make sure to use a service account with the necessary permissions
try {
  admin.initializeApp();
} catch (e) {
  console.log("Initialization failed, perhaps already initialized?");
}

const db = admin.firestore();

const TEST_CONFIG = {
    TARGET_USER_UID: process.env.TARGET_USER_UID, // The UID of the test user
    NUM_JOBS_TO_CREATE: 100, // Simulate a 10x spike (adjust as needed)
    CONCURRENT_REQUESTS: 10,  // Number of parallel requests
};

async function runLoadTest() {
    if (!TEST_CONFIG.TARGET_USER_UID) {
        console.error("CRITICAL: TARGET_USER_UID environment variable is not set.");
        console.error("Please set this to the Firebase UID of the test user with an active subscription.");
        process.exit(1);
    }

    console.log(`--- Starting 10x Traffic Spike Test ---`);
    console.log(`Target User: ${TEST_CONFIG.TARGET_USER_UID}`);
    console.log(`Jobs to Create: ${TEST_CONFIG.NUM_JOBS_TO_CREATE}`);
    console.log(`----------------------------------------`);

    const promises = [];
    const jobsCollection = db.collection("jobs");

    for (let i = 0; i < TEST_CONFIG.NUM_JOBS_TO_CREATE; i++) {
        const jobData = {
            ownerId: TEST_CONFIG.TARGET_USER_UID,
            status: "pending",
            type: "image",
            prompt: `Load test job #${i+1}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            retryCount: 0,
            maxRetries: 3,
        };
        promises.push(jobsCollection.add(jobData));
    }

    try {
        const results = await Promise.all(promises);
        console.log(`SUCCESS: ${results.length} jobs created successfully.`);
        console.log("--- Load Test Initiated --- ");
        console.log("Monitor Firestore and Cloud Functions for processing.");
        console.log("Check system_metrics for results after a few minutes.");

    } catch (error) {
        console.error("ERROR: Failed to create all jobs.", error);
    }
}

runLoadTest();
