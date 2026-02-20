
/**
 * @fileoverview A Byzantine Fault Simulation Harness to test the resilience of the quorum consensus mechanism.
 * This harness will simulate various network and node failure scenarios to ensure the system's invariants remain intact.
 */

const { v4: uuidv4 } = require('uuid');

console.log("Initializing Byzantine Fault Simulation Harness...");

// --- In-Memory State for Simulation ---
const mockDatabases = {
    eventConfirmations: {},
    validatorNodes: {},
};

// --- Simulated Validator Node Logic ---
class SimulatedValidator {
    constructor(id, isMalicious = false) {
        this.id = id;
        this.isMalicious = isMalicious;
        // In a real test, we would mock the crypto and identity functions properly
    }

    async processConfirmation(event) {
        // Simplified version of the real validator's logic for simulation purposes
        console.log(`[${this.id}] Processing confirmation for event: ${event.eventId}`);

        if (!mockDatabases.eventConfirmations[event.eventId]) {
            mockDatabases.eventConfirmations[event.eventId] = { confirmations: {}, hashes: [], status: 'pending' };
        }

        const confirmationRecord = mockDatabases.eventConfirmations[event.eventId];

        // Malicious node might send a bad hash
        const hash = this.isMalicious ? `bad-hash-${uuidv4()}` : event.hash;
        
        confirmationRecord.confirmations[this.id] = true;
        confirmationRecord.hashes.push(hash);

        this.checkQuorum(event.eventId, confirmationRecord);
    }

    checkQuorum(eventId, record) {
        const confirmationCount = Object.keys(record.confirmations).length;
        const allHashesMatch = record.hashes.every(h => h === record.hashes[0]);

        if (confirmationCount >= 2 && allHashesMatch) {
            if (record.status !== 'final') {
                record.status = 'final';
                console.log(`✅ [${this.id}] Quorum reached for event ${eventId}!`);
            }
        } else if (confirmationCount >= 2 && !allHashesMatch) {
             if (record.status !== 'quarantined') {
                record.status = 'quarantined';
                console.log(`❌ [${this.id}] QUARANTINED: Hash mismatch for event ${eventId}!`);
            }
        }
    }
}

// --- Network Simulation Layer ---
class ChaosNetwork {
    constructor(nodes, config) {
        this.nodes = nodes;
        this.config = config;
        this.messageQueue = [];
    }

    // Sends a message into the chaos network
    dispatch(message) {
        // 1. Simulate Drop Rate
        if (Math.random() < this.config.dropRate) {
            console.log(`🔥 [Network] Dropped message for event ${message.payload.eventId}`);
            return;
        }

        // 2. Simulate Duplication Rate
        if (Math.random() < this.config.duplicateRate) {
            console.log(`📠 [Network] Duplicated message for event ${message.payload.eventId}`);
            this.messageQueue.push(JSON.parse(JSON.stringify(message)));
        }

        // 3. Simulate Delay
        const delay = this.config.delayMean + (Math.random() - 0.5) * this.config.delayVariance;
        setTimeout(() => {
            const targetNode = this.nodes.find(n => n.id === message.targetNodeId);
            if (targetNode) {
                targetNode.processConfirmation(message.payload);
            }
        }, delay);

        this.messageQueue.push(message);
    }
}


/**
 * Simulates a network with various adverse conditions.
 * @param {object} config - The simulation configuration.
 */
async function runSimulation(config) {
    console.log("\n--- Running Simulation ---");
    console.log("Configuration:", config);

    // 1. Setup Nodes
    const nodes = [
        new SimulatedValidator('gcp-us-1'),
        new SimulatedValidator('aws-eu-2'),
        new SimulatedValidator('azure-ca-1', Math.random() < config.maliciousNodeRate),
    ];

    // 2. Setup Network
    const network = new ChaosNetwork(nodes, config);

    // 3. Create a test event
    const eventId = `evt-${uuidv4()}`;
    const eventPayload = { eventId, data: "test data", hash: "correct-hash" };

    console.log(`\n--- Broadcasting Event: ${eventId} ---\n`);

    // 4. Dispatch to all nodes
    nodes.forEach(node => {
        network.dispatch({ 
            targetNodeId: node.id, 
            payload: eventPayload 
        });
    });

    // 5. Wait for simulation to settle and check invariants
    return new Promise(resolve => {
        setTimeout(() => {
            console.log(`\n--- Checking Invariants for Event: ${eventId} ---\n`);
            const finalState = mockDatabases.eventConfirmations[eventId];
            if (!finalState) {
                console.error("🚨 INVARIANT VIOLATED: Event was dropped entirely!");
            } else {
                console.log("Final State:", finalState);
                // TODO: Add more invariant checks here (e.g., no double finalization)
            }
             console.log("\n--- Simulation Complete ---\n");
             resolve();
        }, config.delayMean + config.delayVariance * 2 + 500); // Wait long enough for messages to process
    });
}

// Example usage:
runSimulation({
  delayMean: 100,
  delayVariance: 50,
  dropRate: 0.1, // 10% of messages are dropped
  duplicateRate: 0.05, // 5% of messages are duplicated
  maliciousNodeRate: 0, // No malicious nodes in this run
});
