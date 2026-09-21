const admin = require('firebase-admin');
const Stripe = require('stripe');

const stripeSecretKey = String(process.env.STRIPE_TEST_SECRET_KEY || '').trim();
const stripePriceId = String(process.env.ASSET_FACTORY_TEST_STRIPE_PRICE_ID || '').trim();

if (!stripeSecretKey.startsWith('sk_test_')) {
  throw new Error('STRIPE_TEST_SECRET_KEY must be an explicit Stripe TEST-mode secret key.');
}
if (!stripePriceId.startsWith('price_')) {
  throw new Error('ASSET_FACTORY_TEST_STRIPE_PRICE_ID must be an explicit TEST-mode price ID.');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const stripe = new Stripe(stripeSecretKey);
const db = admin.firestore();

const main = async () => {
  const testUserId = `asset-factory-e2e-${Date.now()}`;
  let newJobId;
  let stripeCustomerId;

  try {
    await admin.auth().createUser({ uid: testUserId });

    const customer = await stripe.customers.create({
      email: `${testUserId}@example.invalid`,
      name: testUserId,
      metadata: { purpose: 'asset-factory-e2e-test' },
    });
    stripeCustomerId = customer.id;

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: stripePriceId }],
    });

    await db.collection('tenants').doc(testUserId).set({
      stripeCustomerId: customer.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
      usageUnitsThisPeriod: 0,
      plan: 'test',
      e2eOnly: true,
    });

    const jobRef = await db.collection('jobs').add({
      ownerId: testUserId,
      prompt: 'Asset Factory E2E test fixture',
      status: 'pending',
      e2eOnly: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    newJobId = jobRef.id;

    let jobStatus;
    for (let retries = 20; retries > 0; retries -= 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const jobDoc = await db.collection('jobs').doc(newJobId).get();
      if (!jobDoc.exists) continue;
      jobStatus = jobDoc.data().status;
      if (jobStatus === 'complete' || jobStatus === 'failed') break;
    }

    if (jobStatus !== 'complete') {
      throw new Error(`Job did not complete successfully. Final status: ${jobStatus || 'unknown'}`);
    }

    const usageSnapshot = await db.collection('usage_ledger').where('jobId', '==', newJobId).get();
    if (usageSnapshot.empty) {
      throw new Error('Usage ledger entry not found.');
    }

    console.log(JSON.stringify({
      ok: true,
      testUserId,
      jobId: newJobId,
      usageEntries: usageSnapshot.size,
      stripeMode: 'test',
    }, null, 2));
  } finally {
    if (newJobId) {
      await db.collection('jobs').doc(newJobId).delete().catch(() => {});
    }
    await db.collection('tenants').doc(testUserId).delete().catch(() => {});
    await admin.auth().deleteUser(testUserId).catch(() => {});
    if (stripeCustomerId) {
      await stripe.customers.del(stripeCustomerId).catch(() => {});
    }
  }
};

main().catch((error) => {
  console.error('Asset Factory production-path E2E failed:', error);
  process.exitCode = 1;
});
