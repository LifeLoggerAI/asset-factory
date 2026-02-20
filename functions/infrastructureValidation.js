const functions = require("firebase-functions");
const admin = require("firebase-admin");
db = admin.firestore();


// --- Test Runner ---
exports.infrastructureValidation = functions.https.onRequest(async (req, res) => {
    const { test, ownerId } = req.query;

    if (!test || !ownerId) {
        res.status(400).send("Missing required query parameters: 'test' and 'ownerId'");
        return;
    }

    console.log(`Running test: '${test}' for owner: '${ownerId}'`);

    try {
        let result;
        switch (test) {
            case 'spike':
                result = await runSpikeTest(ownerId);
                break;
            case 'duplication':
                result = await runDuplicationTest(ownerId);
                break;
            case 'corruption':
                result = await runCorruptionTest(ownerId);
                break;
            case 'cancellation':
                result = await runCancellationTest(ownerId);
                break;
            default:
                res.status(400).send(`Unknown test: ${test}`);
                return;
        }
        res.status(200).send({ success: true, test, result });
    } catch (error) {
        console.error(`Test '${test}' failed for owner '${ownerId}'`, error);
        res.status(500).send({ success: false, test, error: error.message });
    }
});

// --- Test Implementations ---

// 1. 10x Traffic Spike Test
async function runSpikeTest(ownerId) {
    const NUM_JOBS = 1000;
    const promises = [];
    for (let i = 0; i < NUM_JOBS; i++) {
        promises.push(db.collection("jobs").add({
            ownerId,
            type: 'image',
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            params: { test: 'spike', index: i }
        }));
    }
    await Promise.all(promises);
    return { message: `Queued ${NUM_JOBS} jobs successfully.` };
}

// 2. Event Duplication Test
async function runDuplicationTest(ownerId) {
    const jobId = `duplication-test-${Date.now()}`;
    const jobData = {
        ownerId,
        type: 'bundle',
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        params: { test: 'duplication' }
    };

    // Create two identical jobs back-to-back
    const ref1 = await db.collection("jobs").add(jobData);
    const ref2 = await db.collection("jobs").add(jobData);

    return { message: "Created two identical jobs.", jobIds: [ref1.id, ref2.id] };
}

// 3. Corrupted Job Document Test
async function runCorruptionTest(ownerId) {
    const corruptedJob = {
        // Missing ownerId and type
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        params: { test: 'corruption', isCorrupted: true }
    };
    const ref = await db.collection("jobs").add(corruptedJob);
    return { message: "Created a corrupted job document.", jobId: ref.id };
}

// 4. Subscription Cancellation Mid-Processing Test
async function runCancellationTest(ownerId) {
    const tenantRef = db.collection("tenants").doc(ownerId);

    // 1. Create a job
    const jobRef = await db.collection("jobs").add({
        ownerId,
        type: 'video',
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        params: { test: 'cancellation' }
    });

    // 2. Immediately "cancel" the subscription
    await tenantRef.update({ subscriptionStatus: 'cancelled' });

    return { 
        message: "Created a job and immediately set subscriptionStatus to 'cancelled'.",
        jobId: jobRef.id 
    };
}
