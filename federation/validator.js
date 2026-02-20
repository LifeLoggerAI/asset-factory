
const { proposeBlock, vote, getConsensusState } = require('./consensus');
const { broadcast, joinNetwork } = require('./p2p');
const { hashData, sign, verify, publicKey } = require('./crypto');

class ValidatorNode {
    constructor(id) {
        this.id = id;
        this.publicKey = publicKey; // Each node would have its own key pair
        joinNetwork(this); // Announce presence to the network
    }

    /**
     * Creates and proposes a new block of transactions.
     * @param {any} transactions - The transactions to include in the block.
     */
    createAndProposeBlock(transactions) {
        const block = {
            timestamp: Date.now(),
            transactions,
            proposer: this.id,
        };
        block.hash = hashData(block);
        block.signature = sign(block.hash);

        console.log(`[Validator ${this.id}] Creating and proposing block: ${block.hash}`);
        proposeBlock(block);
    }

    /**
     * Handles incoming messages from the P2P network.
     * @param {object} message - The incoming message.
     */
    handleMessage(message) {
        console.log(`[Validator ${this.id}] Received message: ${message.type}`);
        switch (message.type) {
            case 'PROPOSAL':
                this.handleProposal(message.payload);
                break;
            case 'VOTE':
                this.handleVote(message.payload);
                break;
        }
    }

    /**
     * Handles a block proposal from another node.
     * @param {object} proposal - The proposal payload.
     */
    handleProposal(proposal) {
        // For now, we'll just optimistically vote for any valid proposal.
        // In a real system, we'd validate the transactions first.
        const { block, proposer } = proposal;
        const isValidSignature = true; // Simplified: assume we have the public key and can verify

        if (isValidSignature) {
            console.log(`[Validator ${this.id}] Voting for block ${block.hash} from ${proposer}`);
            vote(block.hash, this.id);
        } else {
            console.log(`[Validator ${this.id}] Invalid signature on block ${block.hash}. Ignoring.`);
        }
    }

    /**
     * Handles a vote from another node.
     * This is largely handled by the consensus module, but a validator might have custom logic.
     * @param {object} voteInfo - The vote payload.
     */
    handleVote(voteInfo) {
        // The consensus engine already records the vote. 
        // We could add extra logic here if needed, e.g., tracking validator reputation.
    }
}

// --- Simulation ---

// Create a small network of validator nodes
const validator1 = new ValidatorNode('validator-1');
const validator2 = new ValidatorNode('validator-2');
const validator3 = new ValidatorNode('validator-3');

// validator-1 proposes a new block
validator1.createAndProposeBlock({ data: 'some critical transaction' });
