
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(functions.config().stripe.secret);
const db = admin.firestore();

exports.monthlyReconciliation = functions.pubsub.schedule('0 0 1 * *').onRun(async (context) => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const startOfMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
  const endOfMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

  const auditRef = db.collection("billing_audit").doc(`${lastMonth.getFullYear()}-${lastMonth.getMonth() + 1}`);

  try {
    const [usageSnaps, stripeInvoices] = await Promise.all([
      db.collection("usage_ledger")
        .where("createdAt", ">=", startOfMonth)
        .where("createdAt", "<=", endOfMonth)
        .get(),
      stripe.invoices.list({
        created: {
          gte: Math.floor(startOfMonth.getTime() / 1000),
          lte: Math.floor(endOfMonth.getTime() / 1000),
        },
        status: "paid",
      })
    ]);

    let totalUsageUSD = 0;
    usageSnaps.forEach(doc => {
      totalUsageUSD += doc.data().costUSD;
    });

    let totalStripeRevenue = 0;
    stripeInvoices.data.forEach(invoice => {
      totalStripeRevenue += invoice.amount_paid / 100;
    });

    const discrepancy = totalStripeRevenue - totalUsageUSD;

    await auditRef.set({
      period: `${lastMonth.getFullYear()}-${lastMonth.getMonth() + 1}`,
      totalUsageUSD,
      totalStripeRevenue,
      discrepancy,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (Math.abs(discrepancy) > 0.01) {
      console.error(`Billing reconciliation discrepancy detected for ${lastMonth.getFullYear()}-${lastMonth.getMonth() + 1}: ${discrepancy}`);
    }

  } catch (error) {
    console.error("Error running monthly reconciliation job", error);
    await auditRef.set({
      error: error.message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
});
