
const admin = require('firebase-admin');

// Since firebase-admin is already initialized in identity/db.js,
// we can safely assume it's available here. If not, this will initialize it.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const CONFIRMATIONS_COLLECTION = 'eventConfirmations';

/**
 * Runs a Firestore transaction to safely update an event confirmation document.
 * This ensures atomic updates to prevent race conditions.
 *
 * @param {string} eventId - The ID of the event being confirmed.
 * @param {(transaction: FirebaseFirestore.Transaction, snap: FirebaseFirestore.DocumentSnapshot, docRef: FirebaseFirestore.DocumentReference) => Promise<any>} updateFunction
 *   A function that receives the transaction, a snapshot of the document, and the document reference.
 *   It should perform the get and set operations within the transaction.
 * @returns {Promise<any>} The result of the transaction.
 */
function runConfirmationTransaction(eventId, updateFunction) {
  const docRef = db.collection(CONFIRMATIONS_COLLECTION).doc(eventId);
  return db.runTransaction((tx) => {
    return tx.get(docRef).then(snap => {
        return updateFunction(tx, snap, docRef);
    });
  });
}

module.exports = {
  runConfirmationTransaction,
};
