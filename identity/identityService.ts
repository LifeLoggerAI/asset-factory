
import { db } from '../assetfactory-studio/lib/firebase';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// A simplified in-memory store for DID documents.
// In a real production system, this would be a more robust,
// potentially decentralized storage solution (like a blockchain or a distributed database).
const didRegistry = new Map<string, any>();
const revocationRegistry = new Set<string>();

/**
 * Creates a new Decentralized Identifier (DID) for a service or entity.
 *
 * @param serviceName The name of the service this DID is for (e.g., 'api-server', 'worker-gcp').
 * @param region The region where the service is running (e.g., 'us-east-1', 'global').
 * @returns A promise that resolves with the new identity object.
 */
export async function createIdentity(serviceName: string, region: string): Promise<any> {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const did = `did:assetfactory:${region}:${serviceName}:${uuidv4()}`;

  const didDocument = {
    '@context': 'https://www.w3.org/ns/did/v1',
    id: did,
    publicKey: [
      {
        id: `${did}#keys-1`,
        type: 'RsaVerificationKey2018',
        controller: did,
        publicKeyPem: publicKey,
      },
    ],
    authentication: [`${did}#keys-1`],
    assertionMethod: [`${did}#keys-1`],
  };

  // Store the DID document in our registry.
  didRegistry.set(did, didDocument);

  console.log(`[Identity] Created DID: ${did} for ${serviceName} in ${region}`);

  // In a real system, the private key would be stored in a secure secret manager.
  return { did, privateKey, didDocument };
}

/**
 * Resolves a DID to its corresponding DID Document.
 *
 * @param did The DID to resolve.
 * @returns A promise that resolves with the DID Document.
 * @throws An error if the DID is not found or has been revoked.
 */
export async function resolveIdentity(did: string): Promise<any> {
  if (revocationRegistry.has(did)) {
    throw new Error(`[Identity] DID has been revoked: ${did}`);
  }

  const didDocument = didRegistry.get(did);
  if (!didDocument) {
    throw new Error(`[Identity] DID not found: ${did}`);
  }

  return didDocument;
}

/**
 * Revokes a DID, marking it as no longer valid.
 *
 * @param did The DID to revoke.
 * @returns A promise that resolves when the DID has been revoked.
 */
export async function revokeIdentity(did: string): Promise<void> {
  if (!didRegistry.has(did)) {
    throw new Error(`[Identity] Cannot revoke a DID that does not exist: ${did}`);
  }

  revocationRegistry.add(did);
  console.log(`[Identity] Revoked DID: ${did}`);
}
