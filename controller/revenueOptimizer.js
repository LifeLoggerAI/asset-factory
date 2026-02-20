
const { admin } = require('../assetfactory-studio/lib/firebase-admin');
const { getLiveCostModel } = require('../economics/simulator');
const { logger } = require('../assetfactory-studio/lib/logger'); // IMPORT THE CENTRAL LOGGER

const db = admin.firestore();

const LOW_MARGIN_THRESHOLD = 0.20; // 20%
const HIGH_MARGIN_THRESHOLD = 0.70; // 70%

async function calculateTenantMetrics(tenantId) {
    logger.info(`Calculating live metrics for tenant.`, { tenantId });

    const costModel = await getLiveCostModel();
    const tenantRef = db.collection('tenants').doc(tenantId);
    
    const tenantDoc = await tenantRef.get();
    if (!tenantDoc.exists) {
        throw new Error(`Tenant ${tenantId} not found.`);
    }

    const revenuePerUnit = tenantDoc.data().revenuePerUnit || 0.001;
    const jobsSnapshot = await db.collection('jobs').where('tenantId', '==', tenantId).get();
    const usageVolume = jobsSnapshot.size;

    const totalCost = costModel.providerCostPerUnit * usageVolume;
    const totalRevenue = revenuePerUnit * usageVolume;
    const grossMargin = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0;

    const metrics = { tenantId, grossMargin, totalCost, totalRevenue, usageVolume };
    logger.info(`Live metrics for tenant calculated.`, { tenantId, metrics });
    return metrics;
}

async function throttleTenant(tenantId) {
    logger.warn(`ACTION: Throttling low-margin tenant.`, { tenantId });
    const tenantRef = db.collection('tenants').doc(tenantId);
    await tenantRef.update({ status: 'THROTTLED', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
}

async function suggestTierUpgrade(tenantId) {
    logger.info(`ACTION: Suggesting tier upgrade for tenant.`, { tenantId });
    const notificationRef = db.collection('notifications').doc();
    await notificationRef.set({
        tenantId,
        type: 'TIER_UPGRADE_SUGGESTION',
        message: 'Your usage patterns suggest you could benefit from a higher tier.',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
    });
}

async function logPriceOptimizationStrategy(tenantId, metrics) {
    logger.info(`STRATEGY: Logging price optimization opportunity.`, { tenantId, metrics });
    await db.collection('optimizer_logs').add({
        type: 'HIGH_MARGIN_STRATEGY',
        tenantId,
        metrics,
        log_time: admin.firestore.FieldValue.serverTimestamp(),
        notes: 'High margin suggests potential for price optimization or feature upsell.'
    });
}

async function runOptimizer(tenantId, isAutonomousMode = false) {
    logger.info(`Running optimizer for tenant.`, { tenantId, isAutonomousMode });

    try {
        const metrics = await calculateTenantMetrics(tenantId);

        if (metrics.grossMargin < LOW_MARGIN_THRESHOLD) {
            logger.warn(`Tenant is UNPROFITABLE.`, { tenantId, grossMargin: metrics.grossMargin });
            if (isAutonomousMode) {
                await throttleTenant(tenantId);
            } else {
                await suggestTierUpgrade(tenantId);
            }
        } else if (metrics.grossMargin > HIGH_MARGIN_THRESHOLD) {
            logger.info(`Tenant is HIGH-MARGIN.`, { tenantId, grossMargin: metrics.grossMargin });
            await logPriceOptimizationStrategy(tenantId, metrics);
        } else {
            logger.info(`Tenant is PROFITABLE. No action needed.`, { tenantId, grossMargin: metrics.grossMargin });
        }
    } catch (error) {
        logger.error(`Failed to run optimizer for tenant.`, { tenantId, error: error.message });
    }
}

module.exports = { runOptimizer };
