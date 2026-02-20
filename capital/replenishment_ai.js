const treasury = require('./treasury');
const costMonitor = require('./cost_monitor');
const defi = require('./defi_protocol');

const RESERVE_THRESHOLD_MONTHS = 3;
const REPLENISHMENT_DEPLOYMENT_RATIO = 0.1; // Use 10% of the current balance for replenishment

/**
 * The core AI logic for monitoring the treasury and replenishing funds.
 */
async function checkAndReplenish() {
    console.log('[ReplenishmentAI] Running financial check...');

    const currentBalance = treasury.getBalance();
    const projectedMonthlyCost = costMonitor.getProjectedMonthlyCost();
    const reserveThreshold = projectedMonthlyCost * RESERVE_THRESHOLD_MONTHS;

    console.log(`[ReplenishmentAI] Current Balance: $${currentBalance.toFixed(2)} | Reserve Threshold: $${reserveThreshold.toFixed(2)}`);

    if (currentBalance < reserveThreshold) {
        console.log('[ReplenishmentAI] Balance is below reserve threshold. Initiating replenishment protocol.');
        
        const amountToDeploy = currentBalance * REPLENISHMENT_DEPLOYMENT_RATIO;
        if (amountToDeploy < 100) { // Don't bother with very small amounts
            console.log('[ReplenishmentAI] Deployment amount too small. Skipping cycle.');
            return;
        }

        try {
            // Use the DeFi simulation to generate yield
            const yieldEarned = await defi.simulateYieldFarming(amountToDeploy);
            
            // Credit the treasury with the earned yield
            treasury.credit(yieldEarned, 'Automated Yield Farming Rewards');

        } catch (error) {
            console.error('[ReplenishmentAI] Error during replenishment cycle:', error);
        }

    } else {
        console.log('[ReplenishmentAI] Treasury balance is healthy. No action needed.');
    }
}

/**
 * Simulates the monthly deduction of operational costs.
 */
function simulateMonthlyCostDeduction() {
    const monthlyCost = costMonitor.getProjectedMonthlyCost();
    treasury.debit(monthlyCost, 'Monthly Operational Costs');
}

module.exports = {
    checkAndReplenish,
    simulateMonthlyCostDeduction,
};