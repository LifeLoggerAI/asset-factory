
const crypto = require('crypto');

/**
 * Generates a SHA256 hash for a file buffer.
 *
 * @param {Buffer} buffer - The file buffer to hash.
 * @returns {string} The SHA256 hash in hex format.
 */
function hashFileBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = { hashFileBuffer };
