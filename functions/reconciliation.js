
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// TODO: Initialize Stripe with your secret key
// const stripe = require("stripe")(functions.config().stripe.secret);

/**
 * A scheduled function that runs periodically to reconcile internal usage data
 * with external billing data from Stripe.
 */
exports.monthlyReconciliation = functions.pubsub
  .schedule("every 24 hours") // Runs once a day
  .onRun(async (context) => {
    console.log("Starting monthly reconciliation job...");

    const tenantsQuery = await db.collection("tenants").where("subscriptionStatus", "==", "active").get();

    for (const tenantDoc of tenantsQuery.docs) {
      const tenantId = tenantDoc.id;
      const tenantData = tenantDoc.data();

      try {
        // 1. Sum internal usage from our ledger for the current billing period
        // Note: For a real system, you'd scope this to the current billing cycle.
        const usageQuery = await db.collection("usage_ledger").where("ownerId", "==", tenantId).get();
        const internalCostUSD = usageQuery.docs.reduce((sum, doc) => sum + doc.data().costUSD, 0);

        // 2. Fetch the corresponding invoice data from Stripe (Simulated)
        // 🔥 TODO: Replace this with a real Stripe API call using tenantData.stripeSubscriptionId
        // const stripeInvoice = await stripe.invoices.retrieveUpcoming({ subscription: tenantData.stripeSubscriptionId });
        // const externalCostUSD = stripeInvoice.amount_due / 100;
        const simulatedExternalCostUSD = internalCostUSD; // Assuming they match for now

        // 3. Compare and log the reconciliation result
        const discrepancy = simulatedExternalCostUSD - internalCostUSD;

        await db.collection("billing_audit").add({
          tenantId,
          internalCostUSD,
          externalCostUSD: simulatedExternalCostUSD,
          discrepancy,
          isReconciled: discrepancy === 0,
          checkedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`Reconciliation for tenant ${tenantId} completed. Discrepancy: $${discrepancy}`);

      } catch (error) {
        console.error(`Reconciliation failed for tenant ${tenantId}`, error);
        // Optionally, create an alert or a failure record
        await db.collection("billing_audit").add({
          tenantId,
          error: error.message,
          checkedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    console.log("Reconciliation job finished.");
    return null;
  });
