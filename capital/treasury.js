/**
 * Manages the network's capital reserve.
 * Conceptually holds a balance of a stablecoin like USDC.
 */

const INITIAL_CAPITAL = 50000; // Start with $50,000 in the treasury
let currentBalance = INITIAL_CAPITAL;

const transactionHistory = [];

/**
 * Gets the current treasury balance.
 * @returns {number}
 */
function getBalance() {
    return currentBalance;
}

/**
 * Debits an amount from the treasury for operational costs.
 * @param {number} amount - The amount to debit.
 * @param {string} memo - A description of the transaction.
 */
function debit(amount, memo) {
    if (amount > currentBalance) {
        console.error('[Treasury] CRITICAL: Attempted to debit more than the current balance. Halting.');
        // In a real system, this would trigger emergency alerts.
        return;
    }
    currentBalance -= amount;
    const record = {
        type: 'DEBIT',
        amount,
        memo,
        timestamp: new Date().toISOString(),
        balanceAfter: currentBalance,
    };
    transactionHistory.push(record);
    console.log(`[Treasury] Debited $${amount}. New balance: $${currentBalance.toFixed(2)}`);
}

/**
 * Credits an amount to the treasury.
 * @param {number} amount - The amount to credit.
 * @param {string} memo - A description of the transaction.
 */
function credit(amount, memo) {
    currentBalance += amount;
    const record = {
        type: 'CREDIT',
        amount,
        memo,
        timestamp: new Date().toISOString(),
        balanceAfter: currentBalance,
    };
    transactionHistory.push(record);
    console.log(`[Treasury] Credited $${amount}. New balance: $${currentBalance.toFixed(2)}`);
}

/**
 * Gets the transaction history.
 * @returns {object[]}
 */
function getHistory() {
    return transactionHistory;
}

module.exports = {
    getBalance,
    debit,
    credit,
    getHistory,
};