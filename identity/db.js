
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

const NODES_COLLECTION = 'validatorNodes';

/**
 * Saves a validator node record to Firestore.
 *
 * @param {string} nodeId - The unique ID of the node.
 * @param {object} data - The node's data.
 * @returns {Promise<void>}
 */
async function saveValidator(nodeId, data) {
  const docRef = db.collection(NODES_COLLECTION).doc(nodeId);
  await docRef.set(data);
}

/**
 * Retrieves a validator node record from Firestore.
 *
 * @param {string} nodeId - The unique ID of the node.
 * @returns {Promise<object|null>} The node's data or null if not found.
 */
async function getValidator(nodeId) {
  const docRef = db.collection(NODES_COLLECTION).doc(nodeId);
  const doc = await docRef.get();
  if (!doc.exists) {
    return null;
  }
  return doc.data();
}

module.exports = {
  saveValidator,
  getValidator,
};
