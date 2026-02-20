
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const main = async () => {
  // Give the system time to process the jobs
  await new Promise(resolve => setTimeout(resolve, 30000));

  const jobsSnapshot = await db.collection("jobs").where("ownerId", "==", "test-user").get();
  const deadJobsSnapshot = await db.collection("dead_jobs").where("ownerId", "==", "test-user").get();
  const usageLedgerSnapshot = await db.collection("usage_ledger").where("ownerId", "==", "test-user").get();

  const jobCount = jobsSnapshot.size;
  const deadJobCount = deadJobsSnapshot.size;
  const usageCount = usageLedgerSnapshot.size;

  const deadJobRate = jobCount > 0 ? (deadJobCount / jobCount) * 100 : 0;

  console.log(`Spike Test Verification Results:`);
  console.log(`- Total jobs created: ${jobCount}`);
  console.log(`- Dead jobs: ${deadJobCount}`);
  console.log(`- Dead job rate: ${deadJobRate.toFixed(2)}%`);
  console.log(`- Usage ledger entries: ${usageCount}`);

  let stuckJobs = 0;
  jobsSnapshot.forEach(doc => {
    const job = doc.data();
    if (job.status === "processing" || job.status === "pending" || job.status === "retrying") {
      stuckJobs++;
    }
  });

  console.log(`- Stuck jobs (still processing/pending/retrying): ${stuckJobs}`);

  const jobIds = new Set();
  let duplicateBilling = false;
  usageLedgerSnapshot.forEach(doc => {
    const usage = doc.data();
    if (jobIds.has(usage.jobId)) {
      duplicateBilling = true;
      console.error(`ERROR: Duplicate billing detected for jobId: ${usage.jobId}`);
    }
    jobIds.add(usage.jobId);
  });

  if (!duplicateBilling) {
    console.log("- No duplicate billing detected.");
  }

  if (deadJobRate > 1) {
    console.error("ERROR: Dead job rate exceeds 1% threshold.");
  } else {
    console.log("- Dead job rate is within acceptable limits.");
  }
  
  if (stuckJobs > 0) {
      console.warn("WARNING: Some jobs appear to be stuck. This may be due to processing time. Re-run verification shortly.");
  } else {
      console.log("- No stuck jobs detected.");
  }

};

main();
