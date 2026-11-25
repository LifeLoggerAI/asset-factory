type Row = Record<string, unknown>;
type Auth = { ok: boolean; mode?: string; userId?: string; tenantId?: string };
const clientIdentityFields = ['ownerId', 'userId', 'subjectId', 'subjectIds', 'subjectProvenance', 'creatorProvenance', 'consumerDeletionEligible'];
const immutableFields = ['jobId', 'tenantId', ...clientIdentityFields];

/** Creator attribution is not ownership of depicted people or shared-tenant data. */
export function bindCreatorProvenance<T extends object>(input: T, auth: Auth): T & { creatorProvenance: Row } {
  const row = { ...input } as Row;
  for (const field of clientIdentityFields) delete row[field];
  const verified = auth.ok && auth.mode === 'jwt' && typeof auth.userId === 'string' && !!auth.userId
    && typeof auth.tenantId === 'string' && !!auth.tenantId;
  row.creatorProvenance = verified
    ? { schemaVersion: 'asset-creator-v1', state: 'verified-auth-creator', creatorUserId: auth.userId,
        tenantId: auth.tenantId, authority: 'server-verified-jwt', subjectResolution: 'unknown', consumerDeletionEligible: false }
    : { schemaVersion: 'asset-creator-v1', state: 'unknown', subjectResolution: 'unknown', consumerDeletionEligible: false };
  return row as T & { creatorProvenance: Row };
}

function stable(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Row)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function assertImmutableCreatorIdentity(existing: Row, patch: Row): void {
  for (const field of immutableFields) {
    if (Object.prototype.hasOwnProperty.call(patch, field) && stable(existing[field]) !== stable(patch[field])) {
      throw new Error('Asset creator identity is immutable');
    }
  }
}

/** Only persisted job attribution may reach a derived asset; absent remains absent. */
export function deriveAssetCreator(asset: Row, job: Row): Row {
  if (asset.jobId !== job.jobId || asset.tenantId !== job.tenantId) throw new Error('Asset parent identity mismatch');
  const result = { ...asset };
  for (const field of clientIdentityFields) delete result[field];
  if (Object.prototype.hasOwnProperty.call(job, 'creatorProvenance')) result.creatorProvenance = job.creatorProvenance;
  return result;
}
