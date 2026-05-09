import { getAdminDb } from './firebaseAdmin';

export type QueueOpsStatus = 'queued' | 'claimed' | 'retrying' | 'completed' | 'dead-lettered' | 'failed' | 'unknown';

export type QueueOpsItem = {
  jobId: string;
  tenantId?: string;
  status: QueueOpsStatus;
  queueStatus: QueueOpsStatus;
  attempts: number;
  maxAttempts?: number;
  workerId?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  failureReason?: string;
  queuedAt?: string;
  claimedAt?: string;
  heartbeatAt?: string;
  retryAfter?: string;
  deadLetteredAt?: string;
  updatedAt?: string;
};

export type QueueOpsSummary = {
  configured: boolean;
  collection: string;
  tenantId?: string;
  total: number;
  byStatus: Record<string, number>;
  failedOrDeadLettered: number;
  staleClaimed: number;
  items: QueueOpsItem[];
  error?: string;
};

export type QueueRequeueResult = {
  configured: boolean;
  requeued: boolean;
  jobId: string;
  tenantId?: string;
  previousStatus?: QueueOpsStatus;
  reason?: string;
  item?: QueueOpsItem;
};

const QUEUE_COLLECTION = 'assetFactoryQueue';
const VISIBLE_STATUSES = ['queued', 'claimed', 'retrying', 'failed', 'dead-lettered'] as const;
const REQUEUEABLE_STATUSES = new Set<QueueOpsStatus>(['failed', 'dead-lettered', 'retrying']);

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeStatus(value: unknown): QueueOpsStatus {
  const raw = String(value ?? 'unknown');
  if (raw === 'queued' || raw === 'claimed' || raw === 'retrying' || raw === 'completed' || raw === 'dead-lettered' || raw === 'failed') return raw;
  return 'unknown';
}

function mapQueueItem(id: string, data: FirebaseFirestore.DocumentData): QueueOpsItem {
  const status = normalizeStatus(data.status ?? data.queueStatus);
  const queueStatus = normalizeStatus(data.queueStatus ?? data.status);
  return {
    jobId: asString(data.jobId) ?? id,
    tenantId: asString(data.tenantId),
    status,
    queueStatus,
    attempts: asNumber(data.attempts) ?? 0,
    maxAttempts: asNumber(data.maxAttempts),
    workerId: asString(data.workerId),
    leaseId: asString(data.leaseId),
    leaseExpiresAt: asString(data.leaseExpiresAt),
    failureReason: asString(data.failureReason),
    queuedAt: asString(data.queuedAt),
    claimedAt: asString(data.claimedAt),
    heartbeatAt: asString(data.heartbeatAt),
    retryAfter: asString(data.retryAfter),
    deadLetteredAt: asString(data.deadLetteredAt),
    updatedAt: asString(data.updatedAt),
  };
}

function emptySummary(tenantId?: string, error?: string): QueueOpsSummary {
  return {
    configured: false,
    collection: QUEUE_COLLECTION,
    tenantId,
    total: 0,
    byStatus: {},
    failedOrDeadLettered: 0,
    staleClaimed: 0,
    items: [],
    error,
  };
}

export async function readQueueOpsSummary(options: { tenantId?: string; limit?: number; status?: string } = {}): Promise<QueueOpsSummary> {
  const db = getAdminDb();
  if (!db) return emptySummary(options.tenantId, 'Firestore Admin is unavailable; queue operator visibility requires Firestore.');

  const limit = Math.min(Math.max(Number(options.limit ?? 50), 1), 200);
  const requestedStatus = options.status && options.status !== 'all' ? options.status : undefined;
  const statuses = requestedStatus ? [requestedStatus] : [...VISIBLE_STATUSES];
  const items: QueueOpsItem[] = [];

  for (const status of statuses) {
    let query: FirebaseFirestore.Query = db.collection(QUEUE_COLLECTION).where('status', '==', status).limit(limit);
    if (options.tenantId) query = query.where('tenantId', '==', options.tenantId);
    const snapshot = await query.get();
    for (const doc of snapshot.docs) {
      items.push(mapQueueItem(doc.id, doc.data()));
    }
  }

  const uniqueItems = Array.from(new Map(items.map((item) => [item.jobId, item])).values())
    .sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))
    .slice(0, limit);

  const byStatus = uniqueItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const now = Date.now();
  const staleClaimed = uniqueItems.filter((item) => {
    if (item.status !== 'claimed' || !item.leaseExpiresAt) return false;
    const expires = Date.parse(item.leaseExpiresAt);
    return Number.isFinite(expires) && expires < now;
  }).length;

  return {
    configured: true,
    collection: QUEUE_COLLECTION,
    tenantId: options.tenantId,
    total: uniqueItems.length,
    byStatus,
    failedOrDeadLettered: uniqueItems.filter((item) => item.status === 'failed' || item.status === 'dead-lettered').length,
    staleClaimed,
    items: uniqueItems,
  };
}

export async function requeueAssetQueueJob(options: {
  jobId: string;
  tenantId?: string;
  operatorId?: string;
  reason?: string;
  resetAttempts?: boolean;
}): Promise<QueueRequeueResult> {
  const db = getAdminDb();
  if (!db) {
    return { configured: false, requeued: false, jobId: options.jobId, tenantId: options.tenantId, reason: 'Firestore Admin is unavailable; queue requeue requires Firestore.' };
  }

  const now = new Date().toISOString();
  const ref = db.collection(QUEUE_COLLECTION).doc(options.jobId);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(ref);
    if (!doc.exists) {
      return { configured: true, requeued: false, jobId: options.jobId, tenantId: options.tenantId, reason: 'Queue item not found.' };
    }

    const data = doc.data() ?? {};
    const item = mapQueueItem(doc.id, data);

    if (options.tenantId && item.tenantId && item.tenantId !== options.tenantId) {
      return { configured: true, requeued: false, jobId: options.jobId, tenantId: options.tenantId, previousStatus: item.status, reason: 'Tenant mismatch.' };
    }

    if (!REQUEUEABLE_STATUSES.has(item.status)) {
      return { configured: true, requeued: false, jobId: options.jobId, tenantId: item.tenantId, previousStatus: item.status, reason: `Queue item status ${item.status} is not requeueable.` };
    }

    const attempts = options.resetAttempts ? 0 : item.attempts;
    const patch = {
      status: 'queued',
      queueStatus: 'queued',
      attempts,
      previousStatus: item.status,
      requeuedAt: now,
      requeuedBy: options.operatorId,
      requeueReason: options.reason,
      failureReason: null,
      deadLetteredAt: null,
      retryAfter: null,
      leaseId: null,
      leaseExpiresAt: null,
      workerId: null,
      heartbeatAt: null,
      updatedAt: now,
    };

    transaction.set(ref, patch, { merge: true });

    return {
      configured: true,
      requeued: true,
      jobId: item.jobId,
      tenantId: item.tenantId,
      previousStatus: item.status,
      item: { ...item, status: 'queued', queueStatus: 'queued', attempts, failureReason: undefined, deadLetteredAt: undefined, retryAfter: undefined, leaseId: undefined, leaseExpiresAt: undefined, workerId: undefined, heartbeatAt: undefined, updatedAt: now },
    };
  });
}
