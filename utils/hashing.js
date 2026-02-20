
const crypto = require("crypto");

/**
 * Creates a deterministic, canonical string representation of a JavaScript object.
 * This is crucial for creating consistent hashes across different environments.
 * @param {any} obj The object to stringify.
 * @returns {string} The canonical string representation.
 */
function canonicalStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalStringify).join(",")}]`;
  }

  const keys = Object.keys(obj).sort();

  return `{${keys.map(k =>
    `"${k}":${canonicalStringify(obj[k])}`
  ).join(",")}}`;
}

/**
 * Hashes an event object using a canonical string representation to ensure determinism.
 * @param {any} event The event object to hash.
 * @returns {string} The SHA256 hash of the event.
 */
function hashEvent(event) {
  const canonical = canonicalStringify(event);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

module.exports = {
    canonicalStringify,
    hashEvent,
};
