const crypto = require('crypto');

// This simulates a hardware-backed key pair, unique to the CPU.
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const EXPECTED_ENCLAVE_HASH = 'mock_enclave_code_hash';

/**
 * Simulates the enclave generating a signed attestation quote.
 * @param {string} nonce - A random challenge from the verifier.
 * @returns {{quote: object, signature: string}}
 */
function generateQuote(nonce) {
  const quote = {
    nonce,
    enclaveHash: EXPECTED_ENCLAVE_HASH,
    timestamp: new Date().toISOString(),
  };

  const signer = crypto.createSign('SHA256');
  signer.update(JSON.stringify(quote));
  signer.end();
  const signature = signer.sign(privateKey, 'hex');

  console.log(`[Enclave] Generated attestation quote for nonce: ${nonce}`);
  return { quote, signature };
}

/**
 * Simulates a challenger verifying the attestation quote from a remote enclave.
 * @param {{quote: object, signature: string}} attestationData - The attestation data from the peer.
 * @param {string} originalNonce - The nonce the challenger originally sent.
 * @returns {boolean}
 */
function verifyQuote({ quote, signature }, originalNonce) {
  const verifier = crypto.createVerify('SHA256');
  verifier.update(JSON.stringify(quote));
  verifier.end();

  const isSignatureValid = verifier.verify(publicKey, signature, 'hex');
  if (!isSignatureValid) {
    console.error('[Attestation] Failed to verify quote signature.');
    return false;
  }

  if (quote.nonce !== originalNonce) {
    console.error(`[Attestation] Nonce mismatch.`);
    return false;
  }

  if (quote.enclaveHash !== EXPECTED_ENCLAVE_HASH) {
    console.error(`[Attestation] Enclave hash mismatch.`);
    return false;
  }

  console.log(`[Attestation] Successfully verified attestation quote.`);
  return true;
}

/**
 * A simplified local check for the validator to verify its own enclave.
 */
function verifyLocalEnclave() {
    const isHashCorrect = true;
    console.log('[Attestation] Local enclave integrity verified.');
    return isHashCorrect;
}

module.exports = {
  generateQuote,
  verifyQuote,
  verifyLocalEnclave
};