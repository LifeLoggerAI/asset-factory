
const { db } = require('./firebase');
const { recordBillingEvent } = require('./billing'); // Import the new billing function

/**
 * Logs a usage event for a specific tenant and job.
 * This function is now a bridge between job completion and the billing system.
 *
 * @param {string} tenantId - The ID of the tenant.
 * @param {string} jobId - The ID of the job.
 * @param {number} computeUnits - The number of compute units used.
 * @param {number} costEstimate - The estimated cost of the job.
 * @returns {Promise<void>}
 */
async function logUsage(tenantId, jobId, computeUnits, costEstimate) {
    const usageLog = {
        tenantId,
        jobId,
        computeUnits,
        costEstimate,
        timestamp: new Date().toISOString(),
    };

    try {
        // 1. Log the raw usage event to Firestore for auditing and analytics.
        const docRef = await db.collection('usage_logs').add(usageLog);
        console.log(`[Usage] Logged usage for tenant ${tenantId}, job ${jobId}. Doc ID: ${docRef.id}`);

        // 2. Trigger the billing event.
        // This is the critical link to the monetization engine.
        await recordBillingEvent(tenantId, jobId, costEstimate, computeUnits);

    } catch (error) {
        console.error(`[Usage] Failed to log usage for tenant ${tenantId}, job ${jobId}.`, error);
        // This is a high-severity error. If usage isn't logged, it can't be billed.
        // A robust system would have retry logic or a fallback mechanism here.
    }
}

module.exports = { logUsage };
