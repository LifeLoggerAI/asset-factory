
const admin = require("firebase-admin");
const { runOptimizer } = require("../controller/revenueOptimizer");

// IMPORTANT: Path to your service account key
const serviceAccount = require("../service-account.json"); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// --- CONFIGURATION ---
const TEST_USER_ID = "chaos-test-user";
const TOTAL_JOBS = 20; // Flood with 20 jobs for a controlled test
const FAILURE_RATE = 0.25; // 25% of jobs will be forced to fail
const PROCESSING_TIMEOUT_MS = 60 * 1000; // 60 seconds to process
// ---------------------

async function runChaosTest() {
    console.log("🔥 Starting Chaos Test...");

    // 1. Ensure a valid test tenant exists with an active subscription
    console.log(`[SETUP] Ensuring test tenant '${TEST_USER_ID}' exists and is active.`);
    await db.collection("tenants").doc(TEST_USER_ID).set({
        stripeCustomerId: `cus_chaos_${Date.now()}`,
        subscriptionStatus: "active",
    }, { merge: true });

    // 2. Flood the system with jobs
    console.log(`[CHAOS] Creating ${TOTAL_JOBS} jobs with a ${FAILURE_RATE * 100}% failure rate...`);
    const expectedSuccess = [];
    const expectedFailures = [];

    for (let i = 0; i < TOTAL_JOBS; i++) {
        const shouldFail = Math.random() < FAILURE_RATE;
        const jobInput = {
            type: shouldFail ? 'chaotic-fail' : 'chaotic-success',
            forceFail: shouldFail,
            seed: Math.floor(Math.random() * 1000000000)
        };

        const docRef = await db.collection("jobs").add({
            ownerId: TEST_USER_ID,
            input: jobInput,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            retryCount: 0,
            maxRetries: 3,
        });

        if (shouldFail) {
            expectedFailures.push(docRef.id);
        } else {
            expectedSuccess.push(docRef.id);
        }
    }
    console.log(`[CHAOS] ${expectedSuccess.length} success jobs and ${expectedFailures.length} failure jobs created.`);

    // 3. Wait for processing
    console.log(`[INFO] Waiting ${PROCESSING_TIMEOUT_MS / 1000} seconds for jobs to process...`);
    await new Promise(resolve => setTimeout(resolve, PROCESSING_TIMEOUT_MS));

    // 4. Verify the results
    console.log("[VERIFY] Verifying job outcomes...");
    let verifiedSuccess = 0;
    let verifiedFailures = 0;
    let assetMismatches = 0;

    // Check successful jobs
    for (const jobId of expectedSuccess) {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        const assetQuery = await db.collection('assets').where('jobId', '==', jobId).get();

        if (jobDoc.exists && jobDoc.data().status === 'completed' && assetQuery.size === 1) {
            verifiedSuccess++;
        } else {
            console.error(`[FAIL] Verification failed for successful job: ${jobId}`);
        }
        if(assetQuery.size !== 1) assetMismatches++;
    }

    // Check failed jobs
    for (const jobId of expectedFailures) {
        const jobDoc = await db.collection('jobs').doc(jobId).get();
        const deadJobDoc = await db.collection('dead_jobs').doc(jobId).get();

        if (!jobDoc.exists && deadJobDoc.exists && deadJobDoc.data().status === 'dead') {
            verifiedFailures++;
        } else {
             console.error(`[FAIL] Verification failed for failed job: ${jobId}`);
        }
    }

    // 5. Report Summary
    console.log("\n--- CHAOS TEST SUMMARY ---");
    console.log(`Total Jobs Injected: ${TOTAL_JOBS}`);
    console.log(`  - Expected to Succeed: ${expectedSuccess.length}`);
    console.log(`  - Expected to Fail:    ${expectedFailures.length}`);
    console.log("\n--- VERIFICATION RESULTS ---");
    console.log(`Verified Successes (completed & asset created): ${verifiedSuccess} / ${expectedSuccess.length}`);
    console.log(`Verified Failures (moved to dead-letter):     ${verifiedFailures} / ${expectedFailures.length}`);
    console.log(`Asset Creation Mismatches: ${assetMismatches}`);

    const isTestSuccessful = verifiedSuccess === expectedSuccess.length && verifiedFailures === expectedFailures.length;

    if (isTestSuccessful) {
        console.log("\n✅ ✅ ✅  Chaos test PASSED. The system is resilient.  ✅ ✅ ✅");
    } else {
        console.log("\n❌ ❌ ❌  Chaos test FAILED. System integrity compromised. ❌ ❌ ❌");
    }

    // 6. Run the Autonomous Revenue Optimizer
    await runOptimizer(TEST_USER_ID, false); // Run in suggestion mode first
    await runOptimizer(TEST_USER_ID, true); // Run in autonomous mode to take action
}

runChaosTest().catch(err => {
    console.error("An unexpected error occurred during the chaos test:", err);
});
