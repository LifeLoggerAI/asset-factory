import crypto from "crypto";

export function generateDeterministicSeed(input: any, pipelineVersion: string) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input) + pipelineVersion)
    .digest("hex");

  return {
    seed: parseInt(hash.substring(0, 8), 16),
    deterministicHash: hash,
  };
}
