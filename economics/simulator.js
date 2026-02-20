
const { admin } = require('../assetfactory-studio/lib/firebase-admin');

const db = admin.firestore();

/**
 * Fetches the current cost model from system configuration in Firestore.
 * @returns {Promise<object>} An object containing the current provider cost per unit.
 */
async function getLiveCostModel() {
    const configDoc = await db.collection('system_config').doc('cost_model').get();
    if (!configDoc.exists) {
        console.error('[Economics] ❌ Cost model not found in Firestore!');
        // Return a default/fallback cost model
        return { providerCostPerUnit: 0.00015 }; 
    }
    return configDoc.data();
}

/**
 * Fetches live usage metrics from the jobs collection in Firestore.
 * @returns {Promise<object>} An object containing the total usage volume.
 */
async function getLiveUsageMetrics() {
    // For this example, we'll define usage as "number of jobs created in the last 30 days"
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const jobsSnapshot = await db.collection('jobs')
        .where('createdAt', '>=', thirtyDaysAgo)
        .get();

    return { usageVolume: jobsSnapshot.size };
}

/**
 * Simulates a scenario based on live economic data from Firestore.
 * This is the core of the predictive cost modeling engine.
 *
 * @param {object} [overrides] - Optional parameters to override live data for sensitivity analysis.
 * @returns {Promise<object>} The projected cost, revenue, and margin.
 */
async function runLiveSimulation(overrides = {}) {
    console.log('[Economics] Running live simulation...');

    const costModel = await getLiveCostModel();
    const usageMetrics = await getLiveUsageMetrics();

    // Default revenue and penalty - in a real system, this would be more dynamic
    const defaults = {
        revenuePerUnit: 0.001,
        penaltyRate: 0.0
    };

    const params = {
        providerCost: costModel.providerCostPerUnit,
        usageVolume: usageMetrics.usageVolume,
        revenuePerUnit: defaults.revenuePerUnit,
        penaltyRate: defaults.penaltyRate,
        ...overrides, // Allow overriding live data for what-if scenarios
    };

    console.log('[Economics] Simulation parameters:', params);

    const projectedCost = params.providerCost * params.usageVolume;
    const projectedRevenue = params.revenuePerUnit * params.usageVolume;
    const penalty = projectedRevenue * params.penaltyRate;
    const projectedMargin = projectedRevenue > 0 ? (projectedRevenue - projectedCost - penalty) / projectedRevenue : 0;

    const result = {
        projectedCost,
        projectedRevenue,
        projectedMargin,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        params, // Record the parameters used for this simulation
    };

    // Persist the simulation result for historical analysis
    await db.collection('economic_simulations').add(result);

    console.log('[Economics] ✅ Live simulation result persisted:', result);
    return result;
}

module.exports = {
    runLiveSimulation,
    getLiveCostModel,
    getLiveUsageMetrics,
};
