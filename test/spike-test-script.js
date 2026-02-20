
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const main = async () => {
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(
      db.collection("jobs").add({
        ownerId: "test-user",
        status: "pending",
        type: "image",
        prompt: `test prompt ${i}`,
        createdAt: admin.firestore.Timestamp.now(),
        retryCount: 0,
        maxRetries: 3,
      })
    );
  }
  await Promise.all(promises);
  console.log("100 jobs created");
};

main();
