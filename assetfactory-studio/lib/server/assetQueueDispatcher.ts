import { getAdminDb } from './firebaseAdmin';

type GenericRecord = Record<string, unknown>;

type QueueDispatchResult = {
  mode: 'local-inline' | 'firestore-queue' | 'http-task';
  queued: boolean;
  target?: string;
  message?: string;
};

export type ClaimedAssetQueueJob = GenericRecord & {
  jobId: string;
  leaseId: string;
  attempts: number;
  leaseExpiresAt: string;
};

const QUEUE_COLLECTION = 'assetFactoryQueue';
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 3;

function nowIso() {
  return new Date().toISOString();
}

function futureIso(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clean<T extends GenericRecord>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function dbOrNull() {
  return getAdminDb();
}

export function configuredQueueMode() {
  const mode = String(process.env.ASSET_FACTORY_QUEUE_MODE || 'local-inline').toLowerCase();
  if (mode === 'firestore' || mode === 'firestore-queue') return 'firestore-queue' as const;
  if (mode === 'http' || mode === 'cloud-tasks' || mode === 'http-task') return 'http-task' as const;
  return 'local-inline' as const;
}

export function queueLeaseSeconds() {
  return envNumber('ASSET_FACTORY_QUEUE_LEASE_SECONDS', DEFAULT_LEASE_SECONDS);
}

export function queueMaxAttempts() {
  return envNumber('ASSET_FACTORY_QUEUE_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
}

export async function dispatchAssetJob(jobId: string, payload: GenericRecord = {}): Promise<QueueDispatchResult> {
  const mode = configuredQueueMode();

  if (mode === 'firestore-queue') {
    const db = dbOrNull();
    if (!db) return { mode, queued: false, message: 'Firestore Admin is unavailable; unable to enqueue durable job.' };
    await db.collection(QUEUE_COLLECTION).doc(jobId).set(clean({
      jobId,
      status: 'queued',
      queueStatus: 'queued',
      attempts: 0,
      maxAttempts: queueMaxAttempts(),
      payload,
      queuedAt: nowIso(),
      updatedAt: nowIso(),
    }), { merge: true });
    return { mode, queued: true, target: `firestore:${QUEUE_COLLECTION}` };
  }

  if (mode === 'http-task') {
    const endpoint = process.env.ASSET_FACTORY_WORKER_URL;
    if (!endpoint) return { mode, queued: false, message: 'ASSET_FACTORY_WORKER_URL is required for http-task queue mode.' };
    const secret = process.env.ASSET_FACTORY_WORKER_SECRET;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ jobId, ...payload }),
    });
    if (!response.ok) return { mode, queued: false, target: endpoint, message: `worker returned ${response.status}: ${await response.text()}` };
    return { mode, queued: true, target: endpoint };
  }

  return { mode, queued: false, message: 'local-inline mode does not dispatch to an external queue.' };
}

function isClaimable(item: GenericRecord, now = nowIso()) {
  const status = String(item.status ?? item.queueStatus ?? 'queued');
  const leaseExpiresAt = typeof item.leaseExpiresAt === 'string' ? item.leaseExpiresAt : '';
  const retryAfter = typeof item.retryAfter === 'string' ? item.retryAfter : '';

  if (status === 'queued') return true;
  if (status === 'retrying') return !retryAfter || retryAfter <= now;
  if (status === 'claimed') return Boolean(leaseExpiresAt) && leaseExpiresAt <= now;
  return false;
}

export async function claimNextAssetQueueJob(workerId = 'asset-worker') {
  const db = dbOrNull();
  if (!db) return null;

  const now = nowIso();
  const snapshot = await db.collection(QUEUE_COLLECTION)
    .where('status', 'in', ['queued', 'retrying', 'claimed'])
    .orderBy('updatedAt', 'asc')
    .limit(25)
    .get();

  for (const doc of snapshot.docs) {
    const result = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(doc.ref);
      if (!fresh.exists) return null;
      const item = fresh.data() ?? {};
      if (!isClaimable(item, now)) return null;

      const attempts = Number(item.attempts ?? 0) + 1;
      const maxAttempts = Number(item.maxAttempts ?? queueMaxAttempts());
      const leaseId = `${workerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const leaseExpiresAt = futureIso(queueLeaseSeconds());

      if (attempts > maxAttempts) {
        transaction.set(doc.ref, clean({
          status: 'dead-lettered',
          queueStatus: 'dead-lettered',
          attempts,
          maxAttempts,
          leaseId: null,
          workerId: null,
          leaseExpiresAt: null,
          deadLetteredAt: now,
          failureReason: item.failureReason ?? 'maximum attempts exceeded before claim',
          updatedAt: now,
        }), { merge: true });
        return null;
      }

      const patch = clean({
        status: 'claimed',
        queueStatus: 'claimed',
        attempts,
        maxAttempts,
        workerId,
        leaseId,
        claimedAt: now,
        heartbeatAt: now,
        leaseExpiresAt,
        retryAfter: null,
        updatedAt: now,
      });

      transaction.set(doc.ref, patch, { merge: true });
      return { ...item, ...patch, jobId: String(item.jobId ?? doc.id) } as ClaimedAssetQueueJob;
    });

    if (result) return result;
  }

  return null;
}

export async function heartbeatAssetQueueJob(jobId: string, leaseId: string) {
  const db = dbOrNull();
  if (!db) return null;
  const ref = db.collection(QUEUE_COLLECTION).doc(jobId);
  const now = nowIso();
  const leaseExpiresAt = futureIso(queueLeaseSeconds());
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) return null;
    const item = doc.data() ?? {};
    if (item.leaseId !== leaseId || item.status !== 'claimed') return null;
    const patch = { heartbeatAt: now, leaseExpiresAt, updatedAt: now };
    transaction.set(ref, patch, { merge: true });
    return { ...item, ...patch };
  });
}

export async function completeAssetQueueJob(jobId: string, leaseId: string, patch: GenericRecord = {}) {
  const db = dbOrNull();
  if (!db) return null;
  const ref = db.collection(QUEUE_COLLECTION).doc(jobId);
  const now = nowIso();
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) return null;
    const item = doc.data() ?? {};
    if (item.leaseId !== leaseId) return null;
    const update = clean({
      ...patch,
      status: 'completed',
      queueStatus: 'completed',
      completedAt: now,
      leaseCompletedAt: now,
      leaseId: null,
      workerId: null,
      leaseExpiresAt: null,
      retryAfter: null,
      updatedAt: now,
    });
    transaction.set(ref, update, { merge: true });
    return { ...item, ...update };
  });
}

export async function failAssetQueueJob(jobId: string, leaseId: string, reason: string, retryable = true) {
  const db = dbOrNull();
  if (!db) return null;
  const ref = db.collection(QUEUE_COLLECTION).doc(jobId);
  const now = nowIso();
  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) return null;
    const item = doc.data() ?? {};
    if (item.leaseId !== leaseId) return null;

    const attempts = Number(item.attempts ?? 0);
    const maxAttempts = Number(item.maxAttempts ?? queueMaxAttempts());
    const shouldRetry = retryable && attempts < maxAttempts;
    const status = shouldRetry ? 'retrying' : 'dead-lettered';
    const update = clean({
      status,
      queueStatus: status,
      failureReason: reason,
      lastFailedAt: now,
      leaseId: null,
      workerId: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      updatedAt: now,
      retryAfter: shouldRetry ? futureIso(Math.min(60 * Math.max(attempts, 1), 300)) : null,
      deadLetteredAt: shouldRetry ? null : now,
    });

    transaction.set(ref, update, { merge: true });
    return { ...item, ...update };
  });
}

export function getQueueDiagnostics() {
  const mode = configuredQueueMode();
  return {
    mode,
    workerUrlConfigured: Boolean(process.env.ASSET_FACTORY_WORKER_URL),
    firestoreQueueCollection: QUEUE_COLLECTION,
    leaseSeconds: queueLeaseSeconds(),
    maxAttempts: queueMaxAttempts(),
    durableLeasesSupported: true,
    retryBackoffSupported: true,
    deadLetterSupported: true,
  };
}
