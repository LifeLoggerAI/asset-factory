const axios = require('axios');
const crypto = require('crypto');
const admin = require('firebase-admin');

// --- Firebase Setup ---
const serviceAccount = require('../engine/service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// --- Configuration ---
const VALIDATOR_URL = 'http://localhost:9000';
const POLLING_INTERVAL = 2000; // 2 seconds
const POLLING_TIMEOUT = 30000; // 30 seconds

// --- Helper Functions ---

/**
 * Generates a key pair for signing transactions.
 */
function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/**
 * Polls the eventConfirmations collection until the event is marked as FINAL.
 * @param {string} eventId - The ID of the event to poll for.
 * @returns {Promise<object>} The final confirmation data.
 */
function pollForQuorum(eventId) {
  return new Promise((resolve, reject) => {
    const unsubscribe = db.collection('eventConfirmations').doc(eventId)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data();
          if (data.status === 'FINAL') {
            unsubscribe();
            resolve(data);
          }
        }
      });

    // Timeout to prevent the test from running indefinitely
    setTimeout(() => {
      unsubscribe();
      reject(new Error(`Polling timed out for event ${eventId}`));
    }, POLLING_TIMEOUT);
  });
}

// --- Main Test Logic ---

(async () => {
  try {
    console.log('--- E2E Test: Validator Quorum Integration ---');

    // 1. Generate a new transaction
    const { privateKey, publicKey } = generateKeyPair();
    const transaction = {
      payload: {
        tenantId: `tenant-${Date.now()}`,
        data: 'This is a test transaction for quorum validation.'
      },
      timestamp: new Date().toISOString(),
    };
    const signature = crypto.createSign('SHA256').update(JSON.stringify(transaction)).end().sign(privateKey, 'hex');
    const transactionHash = crypto.createHash('sha256').update(JSON.stringify(transaction)).digest('hex');

    console.log(`Generated transaction with hash: ${transactionHash}`)

    // 2. Submit the transaction to the validator
    console.log(`Submitting transaction to ${VALIDATOR_URL}/submit...`);
    const submitResponse = await axios.post(`${VALIDATOR_URL}/submit`, { transaction, signature, publicKey });
    
    if (submitResponse.status !== 202) {
        throw new Error(`Failed to submit transaction: ${submitResponse.status} ${submitResponse.data.message}`);
    }
    console.log('Transaction submitted successfully.');

    // 3. Poll for the quorum to be reached
    console.log(`Polling for quorum on event ${transactionHash}...`);
    const confirmation = await pollForQuorum(transactionHash);

    // 4. Assert the results
    console.log('Quorum reached! Verifying results...');

    if (!confirmation.quorumReached) {
      throw new Error(`Assertion failed: quorumReached is false.`);
    }
    
    if (confirmation.status !== 'FINAL') {
        throw new Error(`Assertion failed: status is ${confirmation.status}, expected FINAL.`);
    }

    console.log('\n✅ --- All Assertions Passed! ---\n');
    console.log('Final Confirmation State:', confirmation);

  } catch (error) {
    console.error('\n❌ --- E2E Test Failed ---');
    console.error(error);
    process.exit(1);
  } finally {
      // The onSnapshot listener might keep the process alive, so we exit explicitly.
      process.exit(0);
  }
})();
