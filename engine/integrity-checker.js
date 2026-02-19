
const { db } = require('../assetfactory-studio/lib/firebase');

/**
 * Reconstructs the state of a job by replaying its events.
 * @param {Array} events The array of event documents for a single job, sorted by timestamp.
 * @returns {Object} The reconstructed job state.
 */
function reconstructJobStateFromEvents(events) {
    const reconstructedState = {};

    for (const event of events) {
        switch (event.eventType) {
            case 'JOB_QUEUED':
                reconstructedState.status = 'queued';
                break;
            case 'JOB_PROCESSING_STARTED':
                reconstructedState.status = 'processing';
                break;
            case 'JOB_COMPLETED':
                reconstructedState.status = 'complete';
                reconstructedState.cost = event.cost;
                reconstructedState.processingTimeMs = event.processingTimeMs;
                break;
            case 'JOB_FAILED':
                reconstructedState.status = 'failed';
                reconstructedState.lastError = event.error;
                break;
            case 'JOB_RETRY_QUEUED':
                reconstructedState.status = 'queued';
                reconstructedState.retryCount = event.retryCount;
                break;
            case 'JOB_MOVED_TO_DLQ':
                 // In the main jobs collection, the job is deleted, so this is an end state.
                reconstructedState.status = 'dead-letter';
                break;
        }
    }
    return reconstructedState;
}

/**
 * Fetches a sample of recent jobs and verifies their snapshot integrity against the event log.
 */
async function verifySnapshotIntegrity() {
    console.log('[IntegrityChecker] Starting nightly snapshot integrity check...');
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Get a sample of jobs completed in the last 24 hours.
    const jobsSnapshot = await db.collection('jobs')
        .where('completedAt', '>', twentyFourHoursAgo)
        .limit(100) // Limit sample size to avoid excessive reads.
        .get();

    if (jobsSnapshot.empty) {
        console.log('[IntegrityChecker] No completed jobs found in the last 24 hours to verify.');
        return;
    }

    for (const jobDoc of jobsSnapshot.docs) {
        const jobId = jobDoc.id;
        const jobSnapshot = jobDoc.data();

        // 2. Fetch all events for this job.
        const eventsSnapshot = await db.collection('job_events')
            .where('jobId', '==', jobId)
            .orderBy('timestamp')
            .get();

        if (eventsSnapshot.empty) {
            console.warn(`[IntegrityChecker] Job ${jobId} has a snapshot but no events. Flagging for review.`);
            await logIntegrityAlert(jobId, jobSnapshot.tenantId, 'MissingEvents', { snapshot: jobSnapshot });
            continue;
        }

        // 3. Reconstruct the state from events.
        const events = eventsSnapshot.docs.map(doc => doc.data());
        const reconstructedState = reconstructJobStateFromEvents(events);

        // 4. Compare the snapshot with the reconstructed state.
        const discrepancies = [];
        if (jobSnapshot.status !== reconstructedState.status) {
            discrepancies.push({ field: 'status', snapshot: jobSnapshot.status, reconstructed: reconstructedState.status });
        }
        if (Math.abs((jobSnapshot.cost || 0) - (reconstructedState.cost || 0)) > 0.0001) {
            discrepancies.push({ field: 'cost', snapshot: jobSnapshot.cost, reconstructed: reconstructedState.cost });
        }

        if (discrepancies.length > 0) {
            console.error(`[IntegrityChecker] FAILED: Job ${jobId} has data divergence.`);
            await logIntegrityAlert(jobId, jobSnapshot.tenantId, 'DataDivergence', { discrepancies, snapshot: jobSnapshot, reconstructed: reconstructedState });
        } else {
            console.log(`[IntegrityChecker] PASSED: Job ${jobId} is consistent.`);
        }
    }
     console.log('[IntegrityChecker] Snapshot integrity check complete.');
}

/**
 * Logs an alert to a dedicated collection for manual review.
 */
async function logIntegrityAlert(jobId, tenantId, reason, details) {
    await db.collection('integrity_alerts').add({
        jobId,
        tenantId,
        reason,
        details,
        createdAt: new Date().toISOString(),
        status: 'new'
    });
}

// To run this manually for testing, you could export and call it from a script.
// For production, this would be triggered by a Cloud Scheduler job.
// For example, in your main application entry point (e.g., index.js for Cloud Functions):
// exports.nightlyIntegrityCheck = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
//   await verifySnapshotIntegrity();
// });

verifySnapshotIntegrity(); // For demonstration purposes, run it directly.
