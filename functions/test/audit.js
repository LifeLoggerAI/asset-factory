
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// --- CONFIGURATION ---
// Manually set the UID of the test run you want to audit.
const TEST_UID_TO_AUDIT = '...'; // <--- ⚠️ IMPORTANT: SET THE UID FROM THE TEST RUN OUTPUT
// --- END CONFIGURATION ---

async function runAudit() {
    if (TEST_UID_TO_AUDIT === '...') {
        console.error('🔥 ERROR: Please set the TEST_UID_TO_AUDIT variable in this script before running the audit.');
        return;
    }

    console.log(`
🔎 Initializing Post-Test Audit for UID: ${TEST_UID_TO_AUDIT}...`);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
    const db = admin.firestore();

    try {
        console.log('  - Fetching created jobs and usage ledger entries...');
        const jobsSnapshot = await db.collection('jobs').where('ownerId', '==', TEST_UID_TO_AUDIT).get();
        const usageSnapshot = await db.collection('usage_ledger').where('ownerId', '==', TEST_UID_TO_AUDIT).get();

        const jobIds = new Set(jobsSnapshot.docs.map(doc => doc.id));
        const usageJobIds = usageSnapshot.docs.map(doc => doc.data().jobId);

        // --- AUDIT CHECKS ---
        const totalJobsCreated = jobIds.size;
        const totalUsageEntries = usageSnapshot.size;

        // Critical Check: Find duplicates
        const usageIdCounts = usageJobIds.reduce((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {});
        const duplicateBillingEntries = Object.entries(usageIdCounts).filter(([id, count]) => count > 1);

        // --- REPORTING ---
        console.log(`
📋 Post-Test Audit Report`);
        console.log(`------------------------------------------`);
        console.log(`  Jobs Created in DB: ${totalJobsCreated}`);
        console.log(`  Usage Ledger Entries: ${totalUsageEntries}`);
        console.log(`------------------------------------------`);

        // RESULT 1: Financial Integrity (Billing)
        if (duplicateBillingEntries.length > 0) {
            console.error('  ❌ FAILED: Duplicate billing detected!');
            duplicateBillingEntries.forEach(([id, count]) => {
                console.error(`    - Job ID ${id} was billed ${count} times.`);
            });
        } else {
            console.log('  ✅ PASSED: No duplicate billing detected.');
        }

        // RESULT 2: Financial Integrity (Completeness)
        if (totalJobsCreated !== totalUsageEntries) {
             console.error(`  ❌ FAILED: Mismatch between jobs created (${totalJobsCreated}) and usage entries (${totalUsageEntries}). Potential for revenue leakage.`);
        } else {
             console.log('  ✅ PASSED: Job creation and usage logging are consistent.');
        }

        if (duplicateBillingEntries.length === 0 && totalJobsCreated === totalUsageEntries) {
            console.log('\n🎉 System financial integrity is nominal under load.');
        }

    } catch (error) {
        console.error('🔥 A critical error occurred during the audit:', error);
    }
}

runAudit().catch(console.error);
