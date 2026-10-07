import { getAdminBucket, getAdminDb } from './firebaseAdmin';
import { createHash } from 'node:crypto';

type GenericRecord = Record<string, unknown>;

const collections = {
  jobs: 'assetFactoryJobs',
  assets: 'assetFactoryAssets',
  usage: 'assetFactoryUsage',
  queue: 'assetFactoryQueue',
};

function dbOrThrow() {
  const db = getAdminDb();
  if (!db) throw new Error('Firebase Admin Firestore is not available');
  return db;
}

function bucketOrThrow() {
  const bucket = getAdminBucket();
  if (!bucket) throw new Error('Firebase Admin Storage bucket is not available');
  return bucket;
}

function stripUndefined<T extends GenericRecord>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

export async function cloudAddJob(job: GenericRecord) {
  const db = dbOrThrow();
  const jobId = String(job.jobId);
  await db.collection(collections.jobs).doc(jobId).set(stripUndefined(job), { merge: true });
  await db.collection(collections.queue).doc(jobId).set(stripUndefined({
    jobId,
    tenantId: job.tenantId ?? 'default',
    type: job.canonicalType ?? job.type,
    status: 'queued',
    queueStatus: job.queueStatus ?? 'pending-materialization',
    createdAt: job.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), { merge: true });
  return job;
}

export async function cloudReadJobs() {
  const snapshot = await dbOrThrow().collection(collections.jobs).orderBy('createdAt', 'desc').limit(500).get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function cloudFindJob(jobId: string) {
  const doc = await dbOrThrow().collection(collections.jobs).doc(jobId).get();
  return doc.exists ? doc.data() ?? null : null;
}

export async function cloudUpdateJob(jobId: string, patch: GenericRecord) {
  const db = dbOrThrow();
  const ref = db.collection(collections.jobs).doc(jobId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const updated: GenericRecord = stripUndefined({ ...patch, updatedAt: new Date().toISOString() });
  await ref.set(updated, { merge: true });
  await db.collection(collections.queue).doc(jobId).set(stripUndefined({
    jobId,
    status: updated.status,
    queueStatus: updated.queueStatus,
    updatedAt: updated.updatedAt,
    renderStartedAt: updated.renderStartedAt,
    renderCompletedAt: updated.renderCompletedAt,
    failureReason: updated.failureReason,
  }), { merge: true });
  return { ...doc.data(), ...updated };
}

export async function cloudListAssets() {
  const snapshot = await dbOrThrow().collection(collections.assets).orderBy('createdAt', 'desc').limit(500).get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function cloudFindAsset(jobId: string) {
  const doc = await dbOrThrow().collection(collections.assets).doc(jobId).get();
  return doc.exists ? doc.data() ?? null : null;
}

export async function cloudUpsertAsset(asset: GenericRecord) {
  const db = dbOrThrow();
  await db.collection(collections.assets).doc(String(asset.jobId)).set(stripUndefined(asset), { merge: true });
  return asset;
}

export async function cloudRecordUsage(event: GenericRecord) {
  const db = dbOrThrow();
  const eventId = String(event.eventId ?? `${event.tenantId ?? 'default'}-${event.jobId ?? Date.now()}-${Date.now()}`);
  const record = stripUndefined({ ...event, eventId, createdAt: event.createdAt ?? new Date().toISOString() });
  await db.collection(collections.usage).doc(eventId).set(record, { merge: true });
  return record;
}

export async function cloudListUsage() {
  const snapshot = await dbOrThrow().collection(collections.usage).orderBy('createdAt', 'desc').limit(2000).get();
  return snapshot.docs.map((doc) => doc.data());
}

const maxGeneratedBytes = 512 * 1024 * 1024;
const storageRequestTimeoutMs = 60_000;
const checksumPattern = /^[A-Za-z0-9+/]{6}==$/;

function generatedObjectPath(fileName: string, storagePath?: string) {
  if (typeof fileName !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(fileName) || ['.', '..'].includes(fileName)) {
    throw new Error('Invalid generated artifact filename');
  }
  const value = storagePath ?? `asset-factory/generated/${fileName}`;
  if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9._:/-]+$/.test(value)
      || !/^(tenants\/|asset-factory\/generated\/)/.test(value)
      || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid generated artifact storage path');
  }
  return value;
}

type StoredMetadata = {
  generation?: string | number; size?: string | number; crc32c?: string;
  contentType?: string; contentEncoding?: string; metadata?: Record<string, unknown>;
};

type StorageFile = ReturnType<NonNullable<ReturnType<typeof getAdminBucket>>['file']>;

async function readStoredMetadata(file: StorageFile): Promise<StoredMetadata> {
  // getMetadata's high-level promise has no application cancellation boundary.
  // Use the same SDK's cancellable REST stream with no implicit metadata retry.
  const stream = file.requestStream({ method: 'GET', uri: '', json: false, timeout: storageRequestTimeoutMs, maxRetries: 0 });
  const chunks: Buffer[] = [];
  let received = 0;
  let responseSeen = false;
  const timeout = setTimeout(() => stream.destroy(new Error('Generated artifact metadata deadline exceeded')), storageRequestTimeoutMs);
  timeout.unref();
  stream.on('response', (response: { statusCode?: unknown }) => {
    responseSeen = true;
    if (response.statusCode !== 200) {
      const code = typeof response.statusCode === 'number' && Number.isSafeInteger(response.statusCode) ? response.statusCode : null;
      stream.destroy(Object.assign(new Error('Generated artifact metadata request failed'), { code }));
    }
  });
  try {
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk) || received + chunk.length > 64 * 1024) throw new Error('Generated artifact metadata exceeds policy');
      received += chunk.length;
      chunks.push(Buffer.from(chunk));
    }
    if (!responseSeen) throw new Error('Generated artifact metadata lacks a verified HTTP response');
    const value: unknown = JSON.parse(Buffer.concat(chunks, received).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Storage response has an invalid metadata envelope');
    return value as StoredMetadata;
  } finally { clearTimeout(timeout); stream.destroy(); }
}

async function readStoredBytes(file: StorageFile, size: number) {
  const stream = file.createReadStream({ validation: 'crc32c', decompress: false });
  const chunks: Buffer[] = [];
  let received = 0;
  const timeout = setTimeout(() => stream.destroy(new Error('Generated artifact read deadline exceeded')), storageRequestTimeoutMs);
  timeout.unref();
  try {
    for await (const chunk of stream) {
      if (!Buffer.isBuffer(chunk) || received + chunk.length > size || received + chunk.length > maxGeneratedBytes) {
        throw new Error('Generated artifact size verification failed');
      }
      received += chunk.length;
      chunks.push(Buffer.from(chunk));
    }
    if (received !== size) throw new Error('Generated artifact size verification failed');
    return Buffer.concat(chunks, received);
  } finally {
    clearTimeout(timeout);
    stream.destroy();
  }
}

function storedIdentity(metadata: StoredMetadata) {
  const generation = metadata.generation;
  if ((typeof generation !== 'string' || !/^[1-9][0-9]{0,19}$/.test(generation))
      && (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 1)) {
    throw new Error('Storage response lacks an exact object generation');
  }
  if (BigInt(generation) > 18446744073709551615n) throw new Error('Storage object generation exceeds the API range');
  const size = metadata.size;
  if ((typeof size !== 'string' || !/^(0|[1-9][0-9]{0,9})$/.test(size))
      && (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)) {
    throw new Error('Storage response has an invalid object size');
  }
  if (Number(size) > maxGeneratedBytes || typeof metadata.crc32c !== 'string' || !checksumPattern.test(metadata.crc32c)
      || (metadata.contentEncoding !== undefined && metadata.contentEncoding !== 'identity')) {
    throw new Error('Stored artifact exceeds integrity or size policy');
  }
  return { generation, size: Number(size), crc32c: metadata.crc32c };
}

function storageErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : null;
}

export async function cloudWriteGenerated(fileName: string, buffer: Buffer, contentType?: string, storagePath?: string) {
  const objectPath = generatedObjectPath(fileName, storagePath);
  if (!Buffer.isBuffer(buffer) || buffer.length > maxGeneratedBytes) throw new Error('Generated artifact exceeds size policy');
  // Freeze caller-owned bytes before the first asynchronous operation.
  const payload = Buffer.from(buffer);
  const type = contentType ?? 'application/octet-stream';
  if (typeof type !== 'string' || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(type)) throw new Error('Invalid artifact content type');
  const bucket = bucketOrThrow();
  // SDK checksum-failure cleanup uses this File's default precondition. A zero
  // create precondition cannot delete any existing generation, even if a response
  // is corrupted or a different writer replaces the name during validation.
  const file = bucket.file(objectPath, { preconditionOpts: { ifGenerationMatch: 0 } });
  const checksum = file.crc32cGenerator();
  checksum.update(payload);
  const crc32c = checksum.toString();
  if (!checksumPattern.test(crc32c)) throw new Error('Storage CRC32C validator is unavailable');
  const sha256 = createHash('sha256').update(payload).digest('hex');
  let existing = false;
  try {
    await file.save(payload, {
      resumable: false, validation: 'crc32c', timeout: storageRequestTimeoutMs,
      preconditionOpts: { ifGenerationMatch: 0 },
      contentType: type,
      metadata: { crc32c, cacheControl: 'private, max-age=60', metadata: { sha256 } },
    });
  } catch (error) {
    if (storageErrorCode(error) !== 412) throw error;
    existing = true;
  }
  const metadata = await readStoredMetadata(bucket.file(objectPath));
  const identity = storedIdentity(metadata);
  if (identity.size !== payload.length || identity.crc32c !== crc32c || metadata.contentType !== type
      || (metadata.metadata?.sha256 !== undefined && metadata.metadata.sha256 !== sha256)
      || (!existing && metadata.metadata?.sha256 !== sha256)) {
    throw new Error('Generated artifact conflicts with an existing immutable version');
  }
  if (existing) {
    // A CRC32C match alone cannot prove semantic byte identity. Read the captured
    // generation and compare SHA-256 before admitting an idempotent retry/legacy reuse.
    const pinned = bucket.file(objectPath, { generation: identity.generation });
    const stored = await readStoredBytes(pinned, identity.size);
    if (!Buffer.isBuffer(stored) || stored.length !== payload.length || createHash('sha256').update(stored).digest('hex') !== sha256) {
      throw new Error('Existing generated artifact bytes failed identity verification');
    }
  }
  // Never perform an unconditional cleanup delete: it could remove another version.
  return `gs://${bucket.name}/${objectPath}`;
}

export async function cloudReadGenerated(fileName: string, storagePath?: string) {
  const objectPath = generatedObjectPath(fileName, storagePath);
  const bucket = bucketOrThrow();
  const file = bucket.file(objectPath);
  let metadata;
  try { metadata = await readStoredMetadata(file); }
  catch (error) { if (storageErrorCode(error) === 404) return null; throw error; }
  const identity = storedIdentity(metadata);
  const pinned = bucket.file(objectPath, { generation: identity.generation });
  const buffer = await readStoredBytes(pinned, identity.size);
  if (!Buffer.isBuffer(buffer) || buffer.length !== identity.size) throw new Error('Generated artifact size verification failed');
  const checksum = pinned.crc32cGenerator(); checksum.update(buffer);
  if (checksum.toString() !== identity.crc32c
      || (metadata.metadata?.sha256 !== undefined && metadata.metadata.sha256 !== createHash('sha256').update(buffer).digest('hex'))) {
    throw new Error('Generated artifact checksum verification failed');
  }
  return buffer;
}

export async function cloudQueueJob(jobId: string, patch: GenericRecord = {}) {
  const db = dbOrThrow();
  const record = stripUndefined({
    jobId,
    queueStatus: 'queued',
    status: 'pending',
    queuedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...patch,
  });
  await db.collection(collections.queue).doc(jobId).set(record, { merge: true });
  await cloudUpdateJob(jobId, { queueStatus: 'queued', queuedAt: record.queuedAt });
  return record;
}

export async function cloudFindQueueItem(jobId: string) {
  const doc = await dbOrThrow().collection(collections.queue).doc(jobId).get();
  return doc.exists ? doc.data() ?? null : null;
}

export async function cloudListQueueItems() {
  const snapshot = await dbOrThrow().collection(collections.queue).orderBy('updatedAt', 'desc').limit(500).get();
  return snapshot.docs.map((doc) => doc.data());
}
