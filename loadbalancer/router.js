/**
 * Selects the best cloud to route a request to based on health metrics.
 * This is the core logic of the Global Load Balancing Fabric.
 * @param {Array<object>} regionMetrics - An array of health metrics for each region/cloud.
 * @returns {object | null} - The best cloud to route to, or null if no healthy clouds are available.
 */
function selectCloud(regionMetrics) {
    // Filter out any regions that are not reported as healthy.
    const healthy = regionMetrics.filter(r => r.status === 'healthy');

    if (healthy.length === 0) {
        console.warn('[Router] No healthy clouds available!');
        return null; // No healthy options
    }

    // Sort the healthy regions based on a combined score of latency and load.
    // Lower scores are better, indicating a more optimal target.
    healthy.sort((a, b) => {
        const scoreA = (a.latency || 500) + (a.load || 1.0); // Default to high values if missing
        const scoreB = (b.latency || 500) + (b.load || 1.0);
        return scoreA - scoreB;
    });

    const bestCloud = healthy[0];
    console.log(`[Router] Best cloud selected: ${bestCloud.cloud} (Score: ${(bestCloud.latency || 500) + (bestCloud.load || 1.0)})`);

    return bestCloud;
}

module.exports = {
    selectCloud,
};