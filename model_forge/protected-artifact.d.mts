import type { Buffer } from 'node:buffer';
export function publicArtifactAddress(address: string, family: number): boolean;
export function admittedArtifactHosts(value: unknown): string[];
export function retrievePublicArtifact(raw: string, options: { hosts: unknown; maxBytes?: number; timeoutMs?: number; signal?: AbortSignal; checkAdmission: () => void; onChunk?: (chunk: Buffer) => void }): Promise<{ bytes: number; sha256: string; contentType?: string; buffer?: Buffer }>;
