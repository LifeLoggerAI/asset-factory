
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// Placeholder for provider cost, this should be a more sophisticated calculation
const PROVIDER_COST_PER_JOB_USD = 0.01;

exports.updateSystemMetrics = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    console.log('Starting hourly system metrics update.');

    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(now.toMillis() - 3600000);

    // 1. Query for recent jobs
    const jobsSnapshot = await db.collection('jobs').where('createdAt', '>=', oneHourAgo).get();
    const jobsCreated = jobsSnapshot.size;

    let jobsCompleted = 0;
    let jobsFailed = 0;
    let totalProcessingTime = 0;

    jobsSnapshot.forEach(doc => {
        const job = doc.data();
        if (job.status === 'completed') {
            jobsCompleted++;
            if (job.completedAt && job.startedAt) {
                totalProcessingTime += job.completedAt.toMillis() - job.startedAt.toMillis();
            }
        } else if (job.status === 'failed') {
            jobsFailed++;
        }
    });

    const avgProcessingTime = jobsCompleted > 0 ? totalProcessingTime / jobsCompleted : 0;

    // 2. Query for dead jobs
    const deadJobsSnapshot = await db.collection('dead_jobs').where('failedAt', '>=', oneHourAgo).get();
    const deadJobs = deadJobsSnapshot.size;

    // 3. Query for recent usage
    const usageSnapshot = await db.collection('usage_ledger').where('createdAt', '>=', oneHourAgo).get();
    
    let totalCostUnits = 0;
    let totalRevenueUSD = 0;

    usageSnapshot.forEach(doc => {
        const usage = doc.data();
        totalCostUnits += usage.costUnits;
        totalRevenueUSD += usage.costUSD;
    });

    // 4. Calculate provider cost and margin
    const totalProviderCostUSD = (jobsCreated * PROVIDER_COST_PER_JOB_USD);
    const marginUSD = totalRevenueUSD - totalProviderCostUSD;

    // 5. Write metrics to a new document
    const metrics = {
        timestamp: now,
        period: 'hourly',
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

    await db.collection('system_metrics').add(metrics);
    console.log('Successfully updated system metrics.', metrics);
    return null;
});
