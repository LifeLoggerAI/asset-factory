
const JOB_TYPE_COSTS = {
    'default': 1,  // Default fallback
    'image': 1,    // Base cost for static images
    'video': 5,    // Videos are 5x more expensive
    'code': 2,     // Code bundles are 2x
    'bundle': 3,   // Multi-file kits
};

/**
 * Calculates the cost units for a given job type.
 * @param {string} jobType The type of the job (e.g., 'image', 'video').
 * @returns {number} The cost in units for the job.
 */
function getCostForJobType(jobType) {
    return JOB_TYPE_COSTS[jobType] || 1;
}

module.exports = { getCostForJobType };
