
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(functions.config().stripe.secret);

const db = admin.firestore();

exports.reconciliationJob = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {

    console.log('Starting daily billing reconciliation job.');

    const activeTenants = await db.collection('tenants').where('subscriptionStatus', '==', 'active').get();

    if (activeTenants.empty) {
        console.log('No active tenants to reconcile. Exiting job.');
        return null;
    }

    for (const tenantDoc of activeTenants.docs) {
        const tenant = tenantDoc.data();
        const tenantId = tenantDoc.id;

        if (!tenant.stripeSubscriptionId || !tenant.currentPeriodEnd) {
            console.warn(`Tenant ${tenantId} is active but missing Stripe data. Skipping.`);
            continue;
        }

        try {
            // 1. Calculate Firebase-side usage for the current period
            const periodStart = new Date(tenant.currentPeriodEnd.toDate());
            periodStart.setMonth(periodStart.getMonth() - 1);
            const periodStartTimestamp = admin.firestore.Timestamp.fromDate(periodStart);

            const usageRecords = await db.collection('usage_ledger')
                .where('ownerId', '==', tenantId)
                .where('createdAt', '>=', periodStartTimestamp)
                .where('createdAt', '<=', tenant.currentPeriodEnd)
                .get();

            let totalCostUnits = 0;
            usageRecords.forEach(doc => {
                totalCostUnits += doc.data().costUnits;
            });
            const totalCostUSD = totalCostUnits * 0.02; // Assuming USD_PER_COST_UNIT is $0.02

            // 2. Fetch the latest invoice from Stripe for the subscription
            const subscription = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
            const latestInvoiceId = subscription.latest_invoice;

            if (!latestInvoiceId) {
                console.log(`No invoice found for tenant ${tenantId} yet. Skipping.`);
                continue;
            }
            
            const invoice = await stripe.invoices.retrieve(latestInvoiceId);

            // 3. Compare and Log the Audit
            const stripeAmount = invoice.amount_due / 100; // Amount is in cents

            const auditEntry = {
                tenantId,
                checkedAt: admin.firestore.FieldValue.serverTimestamp(),
                firebaseCalculatedUSD: totalCostUSD,
                stripeInvoiceAmountUSD: stripeAmount,
                discrepancy: stripeAmount - totalCostUSD,
                stripeInvoiceId: latestInvoiceId,
                billingPeriodStart: admin.firestore.Timestamp.fromMillis(invoice.period_start * 1000),
                billingPeriodEnd: admin.firestore.Timestamp.fromMillis(invoice.period_end * 1000),
                status: Math.abs(stripeAmount - totalCostUSD) < 0.01 ? 'reconciled' : 'discrepancy_found'
            };

            await db.collection('billing_audit').add(auditEntry);
            console.log(`Reconciliation for tenant ${tenantId} completed. Status: ${auditEntry.status}`);

        } catch (error) {
            console.error(`Failed to reconcile billing for tenant ${tenantId}.`, error);
            await db.collection('billing_audit').add({
                tenantId,
                checkedAt: admin.firestore.FieldValue.serverTimestamp(),
                status: 'error',
                errorMessage: error.message,
            });
        }
    }

    console.log('Finished daily billing reconciliation job.');
    return null;
});
