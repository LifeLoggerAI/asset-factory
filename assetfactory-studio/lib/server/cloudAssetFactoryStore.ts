import { getAdminBucket, getAdminDb } from './firebaseAdmin';

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
  const updated = stripUndefined({ ...patch, updatedAt: new Date().toISOString() });
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

export async function cloudWriteGenerated(fileName: string, buffer: Buffer, contentType?: string, storagePath?: string) {
  const bucket = bucketOrThrow();
  const objectPath = storagePath ?? `asset-factory/generated/${fileName}`;
  const file = bucket.file(objectPath);
  await file.save(buffer, { resumable: false, contentType: contentType ?? 'application/octet-stream', metadata: { cacheControl: 'private, max-age=60' } });
  return `gs://${bucket.name}/${objectPath}`;
}

export async function cloudReadGenerated(fileName: string, storagePath?: string) {
  const bucket = bucketOrThrow();
  const objectPath = storagePath ?? `asset-factory/generated/${fileName}`;
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buffer] = await file.download();
  return buffer;
}

export async function cloudQueueJob(jobId: string, patch: GenericRecord = {}) {
  const db = dbOrThrow();
  const record = stripUndefined({ jobId, queueStatus: 'queued', status: 'pending', queuedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...patch });
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
