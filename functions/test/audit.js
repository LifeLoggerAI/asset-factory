const admin = require('firebase-admin');

// Post-test audit is intentionally credential-keyless. The operator must use
// supported Application Default Credentials / workload identity. Do not load
// service-account JSON or private-key material from the repository.
const TEST_UID_TO_AUDIT = process.env.ASSET_FACTORY_TEST_UID || '';

async function runAudit() {
  if (!TEST_UID_TO_AUDIT) {
    throw new Error('Set ASSET_FACTORY_TEST_UID before running the post-test audit.');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  const db = admin.firestore();
  console.log(`Initializing post-test audit for UID: ${TEST_UID_TO_AUDIT}`);

  const jobsSnapshot = await db.collection('jobs').where('ownerId', '==', TEST_UID_TO_AUDIT).get();
  const usageSnapshot = await db.collection('usage_ledger').where('ownerId', '==', TEST_UID_TO_AUDIT).get();

  const jobIds = new Set(jobsSnapshot.docs.map((doc) => doc.id));
  const usageJobIds = usageSnapshot.docs.map((doc) => doc.data().jobId);
  const usageIdCounts = usageJobIds.reduce(
    (acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }),
    {},
  );
  const duplicateBillingEntries = Object.entries(usageIdCounts).filter(([, count]) => count > 1);

  const totalJobsCreated = jobIds.size;
  const totalUsageEntries = usageSnapshot.size;

  if (duplicateBillingEntries.length > 0) {
    throw new Error(
      `Duplicate billing detected for job IDs: ${duplicateBillingEntries.map(([id]) => id).join(', ')}`,
    );
  }

  if (totalJobsCreated !== totalUsageEntries) {
    throw new Error(
      `Usage mismatch: jobs=${totalJobsCreated}, usage_entries=${totalUsageEntries}`,
    );
  }

  console.log(JSON.stringify({
    ok: true,
    testUid: TEST_UID_TO_AUDIT,
    jobsCreated: totalJobsCreated,
    usageEntries: totalUsageEntries,
    duplicateBillingEntries: 0,
  }, null, 2));
}

runAudit().catch((error) => {
  console.error('Asset Factory post-test audit failed:', error);
  process.exitCode = 1;
});
