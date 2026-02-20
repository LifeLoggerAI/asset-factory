
const fs = require('fs/promises');
const path = require('path');
const admin = require('firebase-admin');

// --- Initialize Firebase Admin SDK ---
// This assumes the service account credentials are set in the environment
// (e.g., GOOGLE_APPLICATION_CREDENTIALS)
try {
  admin.initializeApp();
} catch (e) {
  console.log('[Worker] Firebase Admin SDK already initialized.');
}
const db = admin.firestore();
console.log('[Worker] Connected to Firestore database.');

// --- Simulated Asset Generation (Unchanged) ---
// This function simulates the asset generation process. It remains a placeholder.
async function generateAssets(job) {
  console.log(`[Worker] Generating assets for job ${job.id}`);
  // Simulate a delay for asset generation
  await new Promise(resolve => setTimeout(resolve, 5000)); 

  const outputDir = path.join(__dirname, '..', 'outputs', job.id);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'final_asset.txt');
  // Use the actual prompt from the job data
  await fs.writeFile(outputPath, `Asset for prompt: \"${job.input.prompt}\"`);

  console.log(`[Worker] Finished generating assets for job ${job.id}`);
  return [{ type: 'text', path: `/outputs/${job.id}/final_asset.txt` }];
}


// --- Real Job Processing Logic ---
async function processJob(jobId) {
    console.log(`[Worker] Processing job ${jobId} from Firestore.`);
    const jobRef = db.collection('jobs').doc(jobId);
    
    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            console.error(`[Worker] CRITICAL: Job ${jobId} not found in Firestore.`);
            return;
        }

        // 1. Mark job as 'running' in Firestore
        await jobRef.update({ status: 'running', startedAt: new Date().toISOString() });
        console.log(`[Worker] Job ${jobId} status updated to 'running'.`);

        // 2. Generate the assets (using the existing simulation)
        const assets = await generateAssets({ id: jobId, ...jobDoc.data() });

        // 3. Mark job as 'completed' in Firestore
        await jobRef.update({
            status: 'completed',
            completedAt: new Date().toISOString(),
            assets: assets,
        });
        console.log(`[Worker] ✅ Job ${jobId} completed successfully.`);

    } catch (error) {
        // 4. Handle failures and update Firestore
        console.error(`[Worker] ❌ Job ${jobId} failed. Error: ${error.message}`);
        await jobRef.update({
            status: 'failed',
            failedAt: new Date().toISOString(),
            error: error.message,
        });
    }
}

// --- Firestore Real-time Listener ---
// This function listens for new documents in the 'jobs' collection where the status is 'queued'.
function listenForJobs() {
    console.log('[Worker] Listening for queued jobs in Firestore...');
    const query = db.collection('jobs').where('status', '==', 'queued');

    query.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const job = change.doc.data();
                console.log(`[Worker] Detected new queued job: ${change.doc.id}`);
                // Process the job. No 'await' here, to allow multiple jobs to be processed concurrently.
                processJob(change.doc.id);
            }
        });
    }, err => {
        console.error('[Worker] CRITICAL: Snapshot listener failed:', err);
        // In a production system, this should trigger a restart or an alert.
        process.exit(1);
    });
}

// Start the worker's main listener.
listenForJobs();
