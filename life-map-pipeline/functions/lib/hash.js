"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deterministicHash = deterministicHash;
const crypto_1 = __importDefault(require("crypto"));
function deterministicHash(input) {
    // Sort object keys recursively to ensure a consistent hash
    const sortObject = (obj) => {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(sortObject);
        }
        const sortedKeys = Object.keys(obj).sort();
        const result = {};
        for (const key of sortedKeys) {
            result[key] = sortObject(obj[key]);
        }
        return result;
    };
    const sortedInput = sortObject(input);
    const json = JSON.stringify(sortedInput);
    return crypto_1.default.createHash('sha256').update(json).digest('hex');
}
