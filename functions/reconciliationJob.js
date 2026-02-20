
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// NOTE: This is a placeholder for a real Stripe integration.
// In a real system, you would use the Stripe Node.js library to fetch invoice data.

/**
 * A scheduled function to reconcile our internal usage ledger against Stripe's invoices.
 * This is a critical business control to ensure revenue integrity.
 */
exports.reconciliationJob = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {

  console.log("Starting daily billing reconciliation job.");

  // In a real implementation, you would determine the relevant period to check,
  // for example, the previous day or the just-closed billing cycle for all tenants.
  const reconciliationPeriod = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      end: new Date()
  };

  try {
    // --- 1. Calculate Internal Usage ---
    const usageLedgerQuery = await db.collection('usage_ledger')
      .where('createdAt', '>=', reconciliationPeriod.start)
      .where('createdAt', '<', reconciliationPeriod.end)
      .get();

    let internalTotalCostUSD = 0;
    usageLedgerQuery.forEach(doc => {
        internalTotalCostUSD += doc.data().costUSD || 0;
    });
    internalTotalCostUSD = parseFloat(internalTotalCostUSD.toFixed(2));

    // --- 2. Fetch External (Stripe) Invoice Data (Simulated) ---
    // In a real-world scenario, you would query the Stripe API for invoices
    // within the reconciliation period and sum their totals.
    // This is a placeholder value.
    const stripeTotalBilledUSD = parseFloat((internalTotalCostUSD * 1.02).toFixed(2)); // Simulate a 2% discrepancy for testing

    // --- 3. Compare and Log Audit Record ---
    const discrepancy = parseFloat((stripeTotalBilledUSD - internalTotalCostUSD).toFixed(2));
    const status = (discrepancy === 0) ? 'SUCCESS' : 'DISCREPANCY_DETECTED';

    const auditLog = {
        reconciliationPeriod,
        status,
        internalTotalCostUSD,
        stripeTotalBilledUSD,
        discrepancy,
        runAt: admin.firestore.FieldValue.serverTimestamp(),
        details: `Simulated reconciliation. Discrepancy of $${discrepancy} found.`
    };

    await db.collection('billing_audit').add(auditLog);

    console.log(`Reconciliation complete. Status: ${status}, Discrepancy: $${discrepancy}`);

    // If a discrepancy is found, you could also trigger an alert here.
    if (status === 'DISCREPANCY_DETECTED') {
        // Example: Send an email or a Slack message to the finance team.
        console.error(`ALERT: Billing discrepancy detected! Check the billing_audit collection.`);
    }

  } catch (error) {
    console.error("Billing reconciliation job failed", error);
    // Log the failure to the audit collection for visibility
    await db.collection('billing_audit').add({
        status: 'FAILED',
        runAt: admin.firestore.FieldValue.serverTimestamp(),
        error: error.message
    });
  }
});
