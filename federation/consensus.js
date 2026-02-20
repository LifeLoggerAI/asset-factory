
const { broadcast } = require('./p2p');
const { admin } = require('../assetfactory-studio/lib/firebase-admin'); // Using the central admin instance

const db = admin.firestore();

/**
 * Proposes a new block to the network by writing it to Firestore.
 */
async function proposeBlock(block) {
    const proposalRef = db.collection('proposals').doc(block.hash);
    const proposerId = 'self'; // In a real network, this would be a verified node ID

    console.log(`[Consensus] Proposing new block to Firestore: ${block.hash}`);

    try {
        await proposalRef.set({
            block,
            proposer: proposerId,
            status: 'PROPOSED',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[Consensus] Proposal ${block.hash} written to Firestore.`);
        broadcast({ type: 'PROPOSAL', payload: { hash: block.hash } });

        // Automatically vote for our own proposal
        await vote(block.hash, proposerId);

    } catch (error) {
        console.error(`[Consensus] ❌ Failed to propose block ${block.hash}:`, error);
    }
}

/**
 * Votes for a proposed block by writing a vote document to Firestore.
 */
async function vote(blockHash, voterId) {
    const voteRef = db.collection('proposals').doc(blockHash).collection('votes').doc(voterId);
    const proposalRef = db.collection('proposals').doc(blockHash);

    console.log(`[Consensus] Voter ${voterId} is voting for block ${blockHash}`);

    try {
        const proposalDoc = await proposalRef.get();
        if (!proposalDoc.exists) {
            console.warn(`[Consensus] Proposal ${blockHash} not found. Cannot vote.`);
            return;
        }

        // Use a transaction to ensure atomicity
        await db.runTransaction(async (transaction) => {
            const voteDoc = await transaction.get(voteRef);
            if (voteDoc.exists) {
                console.log(`[Consensus] Voter ${voterId} has already voted for ${blockHash}.`);
                return; 
            }
            transaction.set(voteRef, { 
                voterId,
                votedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        console.log(`[Consensus] Vote by ${voterId} for ${blockHash} recorded in Firestore.`);
        broadcast({ type: 'VOTE', payload: { blockHash, voterId } });

        await checkQuorum(blockHash);

    } catch (error) {
        console.error(`[Consensus] ❌ Error casting vote for ${blockHash}:`, error);
    }
}

/**
 * Checks if a quorum has been reached by counting votes in Firestore.
 */
async function checkQuorum(blockHash) {
    const proposalRef = db.collection('proposals').doc(blockHash);
    const votesQuery = proposalRef.collection('votes');
    
    try {
        // In a real network, this would be the total number of validator nodes.
        const totalValidators = 3; 
        const quorumThreshold = Math.floor(totalValidators * 2 / 3) + 1;

        const votesSnapshot = await votesQuery.get();
        const voteCount = votesSnapshot.size;

        console.log(`[Consensus] Quorum check for ${blockHash}: ${voteCount}/${quorumThreshold} votes.`);

        if (voteCount >= quorumThreshold) {
            console.log(`[Consensus] ✅ Quorum reached for block ${blockHash}! Committing block.`);
            await proposalRef.update({ status: 'COMMITTED' });
            // In a real implementation, this would trigger the block commitment logic on-chain.
        }
    } catch (error) {
        console.error(`[Consensus] ❌ Error checking quorum for ${blockHash}:`, error);
    }
}

module.exports = {
    proposeBlock,
    vote,
};
