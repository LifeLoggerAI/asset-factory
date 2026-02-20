
// This is a placeholder for a real database connection
const FAKE_FIRESTORE_DB = {
    collections: {},
    collection: function(name) {
        if (!this.collections[name]) this.collections[name] = { docs: {} };
        const docs = this.collections[name].docs;
        return {
            doc: function(id) {
                if (!docs[id]) docs[id] = {};
                const doc = docs[id];
                return {
                    update: async (data) => {
                        for (const key in data) {
                            if (data[key].__type === 'FieldValue.increment') {
                                doc[key] = (doc[key] || 0) + data[key].value;
                            } else {
                                doc[key] = data[key];
                            }
                        }
                    },
                };
            },
            add: async (data) => {
                const id = `entry-${Date.now()}`;
                docs[id] = data;
                return { id };
            }
        };
    },
};

// A simplified FieldValue object to simulate Firestore's atomic increments
const FieldValue = {
    increment: (value) => ({ __type: 'FieldValue.increment', value }),
};

const db = FAKE_FIRESTORE_DB;

/**
 * Allocates a portion of revenue to the capital reserve.
 * @param {number} revenue - The total revenue from a transaction.
 * @param {object} transaction - The Firestore transaction object.
 */
async function allocateCapital(revenue) {
  const reserve = revenue * 0.05; // 5% reserve allocation
  console.log(`[Ledger] Allocating ${reserve} to capital reserve.`);

  await db.collection("system")
    .doc("capitalReserve")
    .update({
      liquidBalance: FieldValue.increment(reserve)
    });
}

/**
 * Posts a new entry to the financial ledger.
 * This function is designed to be called within other transactions.
 * @param {string} tenantId - The ID of the tenant.
 * @param {number} amount - The amount of the transaction.
 * @param {number} revenue - The portion of the amount that is revenue.
 * @param {object} metadata - Additional metadata for the ledger entry.
 */
async function postLedgerEntry(tenantId, amount, revenue, metadata) {
    console.log(`[Ledger] Posting entry for tenant ${tenantId}: amount=${amount}, revenue=${revenue}`);

    await db.collection("ledger").add({
        tenantId,
        amount,
        revenue,
        ...metadata,
        createdAt: new Date().toISOString(),
    });

    if (revenue > 0) {
        await allocateCapital(revenue);
    }
    console.log(`[Ledger] ✅ Ledger entry posted and capital allocated.`);
}

module.exports = {
    postLedgerEntry,
};
