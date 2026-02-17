import crypto from "crypto";

export function hashFile(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function combineHashes(hashes: string[]) {
  return crypto.createHash("sha256").update(hashes.join("")).digest("hex");
}
