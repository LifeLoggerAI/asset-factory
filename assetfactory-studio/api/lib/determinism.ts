import crypto from "crypto"

export function generateDeterministicSeed(input: unknown) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")

  return parseInt(hash.slice(0, 12), 16)
}
