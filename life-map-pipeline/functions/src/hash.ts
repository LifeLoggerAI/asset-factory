import crypto from 'crypto';

export function deterministicHash(input: unknown): string {
    // Sort object keys recursively to ensure a consistent hash
    const sortObject = (obj: any): any => {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(sortObject);
        }
        const sortedKeys = Object.keys(obj).sort();
        const result: { [key: string]: any } = {};
        for (const key of sortedKeys) {
            result[key] = sortObject(obj[key]);
        }
        return result;
    };

    const sortedInput = sortObject(input);
    const json = JSON.stringify(sortedInput);
    return crypto.createHash('sha256').update(json).digest('hex');
}