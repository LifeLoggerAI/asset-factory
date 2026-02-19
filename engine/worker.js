
const { db } = require('../assetfactory-studio/lib/firebase');
const { hashFile, combineHashes } = require('../assetfactory-studio/lib/hashing');
const { logUsage } = require('../assetfactory-studio/lib/usage');
const fs = require('fs-extra');
const path = require('path');

const OUTPUTS_DIR = path.join(__dirname, 'outputs');
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const COST_PER_MS = 0.00001;
const MAX_JOB_COST = 1.00; // $1.00 cost ceiling

// --- Event Sourcing Helper ---
async function logJobEvent(jobId, tenantId, eventType, payload = {}) {
    try {
        await db.collection('job_events').add({
            jobId,
            tenantId,
            eventType,
            timestamp: new Date().toISOString(),
            ...payload,
        });
    } catch (error) {
        console.error(`[Worker] Failed to log event ${eventType} for job ${jobId}:`, error);
    }
}

// --- Mock LLM Call ---
async function getNarrativeFromLLM(prompt) {
    // In a real scenario, this would be a call to a large language model (e.g., Gemini)
    // For now, we'll simulate the output.
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                theme: "Corporate Explainer",
                scenes: [
                    { scene: 1, description: "A logo appears on a clean, white background.", duration: 2 },
                    { scene: 2, description: "A team of diverse professionals collaborates in a modern office.", duration: 5 },
                    { scene: 3, description: "A user smiles while using the product on their tablet.", duration: 3 },
                ],
                music: {
                    style: "Uplifting and optimistic corporate track.",
                    tempo: "120bpm"
                }
            });
        }, 200);
    });
}

function watchForJobs() {
    const query = db.collection('jobs').where('status', '==', 'queued');

    query.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const job = change.doc.data();
                const jobId = change.doc.id;
                if (!job.tenantId) {
                    console.warn(`[Worker] Job ${jobId} is missing a tenantId. Skipping.`);
                    return;
                }
                console.log(`[Worker] Detected new job: ${jobId} for tenant: ${job.tenantId}`);
                logJobEvent(jobId, job.tenantId, 'JOB_QUEUED');
                
                // --- Cost Shield Check ---
                const estimatedCost = (job.input?.estimatedProcessingMs || 10000) * COST_PER_MS;
                if (estimatedCost > MAX_JOB_COST) {
                    console.warn(`[Worker] Job ${jobId} rejected due to exceeding cost ceiling. Est: $${estimatedCost.toFixed(4)}`);
                    logJobEvent(jobId, job.tenantId, 'JOB_REJECTED', { reason: 'Exceeds cost ceiling' });
                    db.collection('jobs').doc(jobId).update({ status: 'failed', lastError: 'Exceeds cost ceiling' });
                    return;
                }

                processJob(jobId, job);
            }
        });
    }, err => {
        console.error("[Worker] Error listening for jobs:", err);
    });
}

async function processJob(jobId, job) {
    const { tenantId } = job;
    const jobRef = db.collection('jobs').doc(jobId);
    const outputDir = path.join(OUTPUTS_DIR, tenantId, jobId);
    const startTime = Date.now();

    try {
        await jobRef.update({ status: 'processing', startedAt: new Date().toISOString() });
        await logJobEvent(jobId, tenantId, 'JOB_PROCESSING_STARTED');

        await fs.ensureDir(outputDir);

        if (Math.random() < 0.2) {
            throw new Error('Simulated transient processing error');
        }

        const prompt = job.input?.prompt || 'No prompt provided.';
        const narrative = await getNarrativeFromLLM(prompt);

        const fileContent = `Generated asset for job ${jobId}, tenant ${tenantId}.\nPrompt: "${prompt}"`;
        const outputFilePath = path.join(outputDir, 'asset.txt');
        await fs.writeFile(outputFilePath, fileContent);

        const storagePath = `https://storage.googleapis.com/asset-factory-outputs/${tenantId}/${jobId}`;
        const fileBuffer = await fs.readFile(outputFilePath);
        const fileHash = hashFile(fileBuffer);

        const outputFiles = [
            {
                type: 'text',
                url: `${storagePath}/asset.txt`,
                hash: fileHash,
            },
        ];

        const fullOutputHash = combineHashes(outputFiles.map(f => f.hash));

        const manifest = {
            jobId,
            tenantId,
            narrative, // Add the narrative to the manifest
            outputFiles,
            fullOutputHash,
            modelVersions: { 
                textModel: 'text-gen-v1.0.0',
                narrativeModel: 'narrative-gen-v1.2.0' // Added narrative model version
            }
        };
        const manifestRef = await db.collection('manifests').add(manifest);

        const processingTimeMs = Date.now() - startTime;
        const cost = processingTimeMs * COST_PER_MS;

        const batch = db.batch();

        batch.update(jobRef, {
            status: 'complete',
            outputManifestId: manifestRef.id,
            completedAt: new Date().toISOString(),
            cost: cost,
            processingTimeMs: processingTimeMs,
        });

        const debitRef = db.collection('ledger').doc();
        batch.set(debitRef, {
            tenantId,
            jobId,
            type: 'DEBIT',
            account: 'TENANT_USAGE',
            amount: cost,
            currency: 'USD',
            createdAt: new Date().toISOString(),
            description: `Asset generation job ${jobId}`
        });

        const creditRef = db.collection('ledger').doc();
        batch.set(creditRef, {
            tenantId,
            jobId,
            type: 'CREDIT',
            account: 'PLATFORM_REVENUE',
            amount: cost,
            currency: 'USD',
            createdAt: new Date().toISOString(),
            description: `Revenue from job ${jobId}`
        });

        await batch.commit();
        await logJobEvent(jobId, tenantId, 'JOB_COMPLETED', { cost, processingTimeMs });

        await logUsage(tenantId, jobId, Math.max(1, Math.floor(processingTimeMs / 1000)), cost);

        console.log(`[Worker] Successfully completed job: ${jobId} for tenant: ${tenantId} (Cost: $${cost.toFixed(4)}, Ledger entries created)`);

    } catch (error) {
        console.error(`[Worker] FAILURE processing job ${jobId} for tenant ${tenantId}:`, error.message);
        await logJobEvent(jobId, tenantId, 'JOB_FAILED', { error: error.message });
        handleJobFailure(jobId, job, error);
    }
}

async function handleJobFailure(jobId, job, error) {
    const jobRef = db.collection('jobs').doc(jobId);
    const retryCount = (job.retryCount || 0) + 1;

    if (retryCount > MAX_RETRIES) {
        console.error(`[Worker] Job ${jobId} has exceeded max retries. Moving to dead-letter queue.`);
        await logJobEvent(jobId, job.tenantId, 'JOB_MOVED_TO_DLQ', { finalError: error.message });
        await db.collection('dead_letter_jobs').doc(jobId).set({
            ...job,
            finalError: error.message,
            failedAt: new Date().toISOString(),
        });
        await jobRef.delete();
    } else {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount - 1);
        console.log(`[Worker] Retrying job ${jobId} in ${backoffMs}ms (attempt ${retryCount})`);
        await logJobEvent(jobId, job.tenantId, 'JOB_RETRY_QUEUED', { retryCount, backoffMs });
        await jobRef.update({
            status: 'queued',
            retryCount,
            lastError: error.message,
        });
    }
}

// --- Main ---
console.log('[Worker] Worker started with event sourcing, cost shield, and ledger logic.');
console.log('🔥 Listening for jobs in Firestore collection: jobs');
watchForJobs();
