
const { db } = require('./firebase');

/**
 * Records a billing event in the `billing_events` collection.
 * In a real-world scenario, this function would also trigger an interaction
 * with a payment provider like Stripe to increment a usage-based subscription item.
 *
 * @param {string} tenantId - The ID of the tenant to bill.
 * @param {string} jobId - The ID of the job that incurred the charge.
 * @param {number} costEstimate - The estimated cost of the job in a currency unit (e.g., USD cents).
 * @param {number} computeUnits - The number of compute units the job consumed.
 * @returns {Promise<void>}
 */
async function recordBillingEvent(tenantId, jobId, costEstimate, computeUnits) {
    if (!tenantId || !jobId || costEstimate === undefined || computeUnits === undefined) {
        console.error("[Billing] Missing required parameters for billing event.");
        return;
    }

    const billingEvent = {
        tenantId,
        jobId,
        costEstimate,
        computeUnits,
        billedAt: new Date().toISOString(),
        status: 'pending', // The status could be 'pending', 'invoiced', 'paid'
    };

    try {
        // In a real system, this is where you would make an API call to Stripe:
        // await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, { quantity: computeUnits });
        console.log(`[Billing] SIMULATING billing event for tenant ${tenantId}: Charging ${costEstimate} for ${computeUnits} compute units on job ${jobId}.`);

        // Store a record of the billing event in Firestore for internal audit and reconciliation.
        const docRef = await db.collection('billing_events').add(billingEvent);
        console.log(`[Billing] Successfully recorded billing event with ID: ${docRef.id}`);

        // You could update the status after successful invoicing.
        // await docRef.update({ status: 'invoiced' });

    } catch (error) {
        console.error(`[Billing] CRITICAL: Failed to record billing event for tenant ${tenantId}, job ${jobId}. This is a revenue leakage event.`, error);
        // In a real system, you would need a dead-letter queue or a retry mechanism here.
    }
}

async function getSubscriptionStatus(tenantId) {
    const subscription = await db.collection('subscriptions').where('tenantId', '==', tenantId).limit(1).get();
    if (subscription.empty) {
        return { status: 'inactive', tier: 'free' };
    }
    return subscription.docs[0].data();
}

async function getCurrentUsage(tenantId) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const isoStartOfMonth = startOfMonth.toISOString();

    const jobsSnapshot = await db.collection('jobs')
        .where('tenantId', '==', tenantId)
        .where('createdAt', '>=', isoStartOfMonth)
        .get();

    return jobsSnapshot.size;
}

module.exports = { recordBillingEvent, getSubscriptionStatus, getCurrentUsage };
