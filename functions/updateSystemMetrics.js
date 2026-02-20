
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// --- Metrics Configuration ---
// This could be made configurable via firebase functions:config:set
const PROVIDER_COST_PER_UNIT = 0.005; // Example: $0.005 per cost unit

/**
 * A scheduled function that aggregates system-wide metrics for operational visibility.
 * Runs every 5 minutes.
 */
exports.updateSystemMetrics = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const fiveMinutesAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);

    // Use a single transaction to ensure a consistent snapshot of the system.
    try {
        const metrics = await db.runTransaction(async (tx) => {
            // 1. Get all jobs created in the last 5 minutes
            const jobsSnap = await tx.get(
                db.collection('jobs').where('createdAt', '>', fiveMinutesAgo)
            );

            let jobsCreated = jobsSnap.size;
            let jobsCompleted = 0;
            let jobsFailed = 0;
            let totalProcessingTime = 0;

            jobsSnap.forEach(doc => {
                const job = doc.data();
                if (job.status === 'completed' && job.completedAt && job.startedAt) {
                    jobsCompleted++;
                    totalProcessingTime += job.completedAt.toMillis() - job.startedAt.toMillis();
                }
                if (job.status === 'failed') {
                    jobsFailed++;
                }
            });

            // 2. Get dead jobs created in the last 5 minutes
            const deadJobsSnap = await tx.get(
                db.collection('dead_jobs').where('failedAt', '>', fiveMinutesAgo)
            );
            const deadJobs = deadJobsSnap.size;

            // 3. Get billing data from the last 5 minutes
            const usageSnap = await tx.get(
                db.collection('usage_ledger').where('createdAt', '>', fiveMinutesAgo)
            );

            let totalCostUnits = 0;
            let totalRevenueUSD = 0;
            usageSnap.forEach(doc => {
                const usage = doc.data();
                totalCostUnits += usage.costUnits || 0;
                totalRevenueUSD += usage.costUSD || 0;
            });

            // 4. Calculate derived metrics
            const avgProcessingTime = jobsCompleted > 0 ? totalProcessingTime / jobsCompleted : 0;
            const totalProviderCostUSD = totalCostUnits * PROVIDER_COST_PER_UNIT;
            const marginUSD = totalRevenueUSD - totalProviderCostUSD;

            return {
                timestamp: now,
                jobsCreated,
                jobsCompleted,
                jobsFailed,
                deadJobs,
                avgProcessingTime,
                totalCostUnits,
                totalRevenueUSD,
                totalProviderCostUSD,
                marginUSD
            };
        });

        // 5. Write metrics and check for alert conditions
        await db.collection('system_metrics').add(metrics);
        console.log("System metrics updated successfully.", metrics);

        // 🚨 CONFIGURE ALERT CONDITIONS (placeholder logging)
        if (metrics.jobsFailed / metrics.jobsCreated > 0.1 && metrics.jobsCreated > 10) {
            console.error("ALERT: High failure rate detected!", { failureRate: metrics.jobsFailed / metrics.jobsCreated });
        }
        if (metrics.deadJobs > 5) {
            console.error("ALERT: Spike in dead jobs detected!", { deadJobs: metrics.deadJobs });
        }
        if (metrics.avgProcessingTime > 10000) { // 10 seconds
            console.error("ALERT: High processing latency detected!", { avgProcessingTime: metrics.avgProcessingTime });
        }
        if (metrics.marginUSD < 0) {
            console.error("ALERT: Negative margin detected!", { marginUSD: metrics.marginUSD });
        }

    } catch (error) {
        console.error("Failed to update system metrics:", error);
    }
});
