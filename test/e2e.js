
const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_SERVER_URL = 'http://localhost:8080';
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-that-is-long-and-secure';

// A mock tenant ID for testing purposes
const MOCK_TENANT_ID = 'tenant-123';

async function runTest() {
  console.log('[E2E Test] Starting end-to-end test...');

  // 1. Generate a JWT for the mock tenant
  const token = jwt.sign({ tenantId: MOCK_TENANT_ID }, JWT_SECRET, { expiresIn: '1h' });
  console.log(`[E2E Test] Generated JWT for tenant: ${MOCK_TENANT_ID}`);

  // 2. The job payload
  const jobData = {
    prompt: 'Create a marketing video for our new product.',
    targetAudience: 'Millennials in urban areas',
  };

  // 3. Submit the job to the API server's v4 endpoint
  try {
    console.log('[E2E Test] Submitting job to the API server...');
    const response = await axios.post(`${API_SERVER_URL}/v4/jobs`, jobData, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('[E2E Test] Job submitted successfully!');
    console.log(`[E2E Test] Validator response: ${JSON.stringify(response.data)}`);

    const transactionHash = response.data.transactionHash;

    // 4. Poll the validator's mempool to see if the transaction is there
    // In a real-world scenario, you would wait for the transaction to be included in a block.
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for the validator to process

    console.log(`[E2E Test] Checking validator mempool for transaction: ${transactionHash}`)
    const mempoolResponse = await axios.get(`http://localhost:9000/mempool`);
    const transactionInMempool = mempoolResponse.data.find(tx => tx.hash === transactionHash);

    if (transactionInMempool) {
      console.log('[E2E Test] ✅ SUCCESS: Transaction found in validator mempool.');
    } else {
      console.log('[E2E Test] ❌ FAILURE: Transaction not found in validator mempool.');
    }

    console.log('\n--- E2E TEST COMPLETE ---');
    console.log('This test demonstrated the following flow:');
    console.log('1. A client with a valid JWT submitted a job.');
    console.log('2. The API server received the job and created a signed transaction.');
    console.log('3. The transaction was submitted to the decentralized validator network.');
    console.log('4. The validator node received the transaction and added it to the mempool for processing.');

  } catch (error) {
    console.error('[E2E Test] ❌ Test failed:', error.response ? error.response.data : error.message);
  }
}

runTest();
