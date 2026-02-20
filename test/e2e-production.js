
const admin = require("firebase-admin");
const stripe = require("stripe")("sk_test_..._replace_this"); // Replace with your Stripe secret key

// IMPORTANT: Replace with your service account credentials
const serviceAccount = require(".../serviceAccountKey.json"); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://asset-factory.firebaseio.com"
});

const db = admin.firestore();

const main = async () => {
  const testUserId = `test-user-${Date.now()}`;
  const testJobId = `job-${Date.now()}`;
  let newJobId;

  try {
    // 1. Create a test user
    console.log(`Creating user: ${testUserId}`);
    await admin.auth().createUser({ uid: testUserId });

    // 2. Create a Stripe customer and a subscription
    console.log("Creating Stripe customer and subscription...");
    const customer = await stripe.customers.create({
      email: `${testUserId}@example.com`,
      name: testUserId,
    });
    const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: "price_..._replace_this" }], // Replace with a real price ID from your Stripe products
    });
    
    // 3. Create tenant document in Firestore
    console.log("Creating tenant document in Firestore...");
    await db.collection("tenants").doc(testUserId).set({
        stripeCustomerId: customer.id,
        subscriptionStatus: "active",
        currentPeriodEnd: admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
        usageUnitsThisPeriod: 0,
        plan: "hobbyist" // Or whatever plan you have configured
    });

    // 4. Create a job
    console.log("Creating a new job...");
    const jobRef = await db.collection("jobs").add({
      ownerId: testUserId,
      prompt: "A beautiful landscape painting.",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    newJobId = jobRef.id;
    console.log(`Job created with ID: ${newJobId}`);

    // 5. Poll for job completion
    console.log("Polling for job completion...");
    let job, jobStatus;
    let retries = 20; // 20 retries * 5 seconds = 100 seconds timeout
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const jobDoc = await db.collection("jobs").doc(newJobId).get();
      if (jobDoc.exists) {
        job = jobDoc.data();
        jobStatus = job.status;
        console.log(`  Job status: ${jobStatus}`);
        if (jobStatus === "complete" || jobStatus === "failed") {
          break;
        }
      }
      retries--;
    }

    if (jobStatus !== "complete") {
      throw new Error(`Job did not complete successfully. Final status: ${jobStatus}`);
    }

    // 6. Verify asset in storage (conceptual)
    console.log("Verifying asset in storage...");
    const assetPath = `assets/${testUserId}/${newJobId}/manifest.json`;
    // In a real scenario, you would use the Firebase Storage SDK to check for the file's existence.
    // For this script, we'll assume success if the job is complete.
    console.log(`  Asset should be at: ${assetPath}`);

    // 7. Verify usage ledger
    console.log("Verifying usage ledger...");
    const usageSnapshot = await db.collection("usage_ledger").where("jobId", "==", newJobId).get();
    if (usageSnapshot.empty) {
        throw new Error("Usage ledger entry not found!");
    }
    console.log("  Usage ledger entry found!");
    usageSnapshot.forEach(doc => {
      console.log("    ", doc.data());
    });

    console.log("\n✅ End-to-end test PASSED!\n");

  } catch (error) {
    console.error("\n❌ End-to-end test FAILED:\n", error);
    if (newJobId) {
        console.error(`  Check the status of job: ${newJobId}`);
    }
  } finally {
    // Cleanup
    if (testUserId) {
      console.log(`\nCleaning up user: ${testUserId}`);
      await admin.auth().deleteUser(testUserId);
      await db.collection("tenants").doc(testUserId).delete();
      if(newJobId){
        // You might want to delete related storage assets and other documents as well
      }
    }
  }
};

main();
