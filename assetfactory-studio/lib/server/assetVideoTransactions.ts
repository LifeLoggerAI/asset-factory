import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAdminDb } from './firebaseAdmin';

export type VideoTransactionStatus =
  | 'reserved'
  | 'dispatching'
  | 'artifact-ready-review'
  | 'failed-reservation-held'
  | 'reconciled'
  | 'released';

export type VideoTransactionRecord = {
  schema: 'urai-video-provider-transaction-1';
  transactionId: string;
  tenantId: string;
  campaignId: string;
  jobId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  provider: string;
  providerModel: string;
  status: VideoTransactionStatus;
  estimatedCostCents: number;
  reservedCostCents: number;
  actualCostCents: number | null;
  maxJobCostCents: number;
  maxCampaignCostCents: number;
  attemptCount: number;
  maxAttempts: number;
  activeAttemptId: string | null;
  providerPredictionId: string | null;
  artifactSha256: string | null;
  artifactMimeType: string | null;
  failureReason: string | null;
  reservationHeld: boolean;
  humanReviewRequired: true;
  productionReady: false;
  createdAt: string;
  updatedAt: string;
};

export type VideoBudgetRecord = {
  schema: 'urai-video-provider-budget-1';
  budgetId: string;
  tenantId: string;
  campaignId: string;
  maxCampaignCostCents: number;
  reservedCostCents: number;
  spentCostCents: number;
  createdAt: string;
  updatedAt: string;
};

type LocalState = {
  transactions: Record<string, VideoTransactionRecord>;
  budgets: Record<string, VideoBudgetRecord>;
};

type ReserveInput = {
  tenantId: string;
  campaignId: string;
  jobId: string;
  idempotencyKey: string;
  requestHash: string;
  provider: string;
  providerModel: string;
  estimatedCostCents: number;
  maxJobCostCents: number;
  maxCampaignCostCents: number;
  maxAttempts?: number;
};

type ReserveResult = {
  ok: boolean;
  replayed: boolean;
  conflict: boolean;
  rejected: boolean;
  error?: string;
  transaction?: VideoTransactionRecord;
  budget?: VideoBudgetRecord;
};

type AttemptResult = {
  ok: boolean;
  shouldDispatch: boolean;
  replayed: boolean;
  error?: string;
  transaction?: VideoTransactionRecord;
  attemptId?: string;
};

const TRANSACTION_COLLECTION = 'assetFactoryVideoTransactions';
const BUDGET_COLLECTION = 'assetFactoryVideoBudgets';
const localBaseDir = path.join(process.cwd(), '.asset-factory-local');
const localStatePath = path.join(localBaseDir, 'video-transactions.json');
const localLockPath = path.join(localBaseDir, 'video-transactions.lock');
const emptyState: LocalState = { transactions: {}, budgets: {} };

function now() {
  return new Date().toISOString();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeString(value: unknown, label: string, maxLength = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value.trim();
}

function safeInteger(value: unknown, label: string, minimum = 0) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function validateHash(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 value`);
  }
  return value;
}

function transactionIdFor(tenantId: string, idempotencyKey: string) {
  return sha256(`video-transaction\u0000${tenantId}\u0000${idempotencyKey}`);
}

function budgetIdFor(tenantId: string, campaignId: string) {
  return sha256(`video-budget\u0000${tenantId}\u0000${campaignId}`);
}

function validateReserveInput(raw: ReserveInput): ReserveInput & { maxAttempts: number } {
  const input = {
    tenantId: safeString(raw.tenantId, 'tenantId'),
    campaignId: safeString(raw.campaignId, 'campaignId'),
    jobId: safeString(raw.jobId, 'jobId'),
    idempotencyKey: safeString(raw.idempotencyKey, 'idempotencyKey', 200),
    requestHash: validateHash(raw.requestHash, 'requestHash'),
    provider: safeString(raw.provider, 'provider'),
    providerModel: safeString(raw.providerModel, 'providerModel', 300),
    estimatedCostCents: safeInteger(raw.estimatedCostCents, 'estimatedCostCents', 1),
    maxJobCostCents: safeInteger(raw.maxJobCostCents, 'maxJobCostCents', 1),
    maxCampaignCostCents: safeInteger(raw.maxCampaignCostCents, 'maxCampaignCostCents', 1),
    maxAttempts: safeInteger(raw.maxAttempts ?? 1, 'maxAttempts', 1),
  };
  if (input.maxAttempts > 3) throw new Error('maxAttempts cannot exceed 3');
  return input;
}

function createReservation(input: ReturnType<typeof validateReserveInput>, transactionId: string, timestamp: string): VideoTransactionRecord {
  return {
    schema: 'urai-video-provider-transaction-1',
    transactionId,
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    jobId: input.jobId,
    idempotencyKeyHash: sha256(input.idempotencyKey),
    requestHash: input.requestHash,
    provider: input.provider,
    providerModel: input.providerModel,
    status: 'reserved',
    estimatedCostCents: input.estimatedCostCents,
    reservedCostCents: input.estimatedCostCents,
    actualCostCents: null,
    maxJobCostCents: input.maxJobCostCents,
    maxCampaignCostCents: input.maxCampaignCostCents,
    attemptCount: 0,
    maxAttempts: input.maxAttempts,
    activeAttemptId: null,
    providerPredictionId: null,
    artifactSha256: null,
    artifactMimeType: null,
    failureReason: null,
    reservationHeld: true,
    humanReviewRequired: true,
    productionReady: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeLocalState(value: Partial<LocalState> | null | undefined): LocalState {
  return {
    transactions: value?.transactions ?? {},
    budgets: value?.budgets ?? {},
  };
}

async function readLocalState() {
  try {
    return normalizeLocalState(JSON.parse(await fs.readFile(localStatePath, 'utf8')) as Partial<LocalState>);
  } catch {
    return { transactions: {}, budgets: {} } as LocalState;
  }
}

async function writeLocalState(state: LocalState) {
  await fs.mkdir(localBaseDir, { recursive: true });
  const temporary = `${localStatePath}.tmp-${process.pid}-${randomUUID()}`;
  await fs.writeFile(temporary, `${JSON.stringify(normalizeLocalState(state), null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, localStatePath);
}

async function delay(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withLocalLock<T>(callback: () => Promise<T>): Promise<T> {
  await fs.mkdir(localBaseDir, { recursive: true });
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      handle = await fs.open(localLockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: now() }));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const stat = await fs.stat(localLockPath);
        if (Date.now() - stat.mtimeMs > 30_000) await fs.unlink(localLockPath);
      } catch {}
      await delay(20 + attempt * 5);
    }
  }
  if (!handle) throw new Error('timed out acquiring local video transaction lock');
  try {
    return await callback();
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(localLockPath).catch(() => {});
  }
}

function reserveAgainstState(state: LocalState, input: ReturnType<typeof validateReserveInput>): ReserveResult {
  const transactionId = transactionIdFor(input.tenantId, input.idempotencyKey);
  const budgetId = budgetIdFor(input.tenantId, input.campaignId);
  const existing = state.transactions[transactionId];
  if (existing) {
    if (existing.requestHash !== input.requestHash || existing.jobId !== input.jobId) {
      return { ok: false, replayed: false, conflict: true, rejected: false, error: 'idempotency key is already bound to a different video request', transaction: existing };
    }
    return { ok: true, replayed: true, conflict: false, rejected: false, transaction: existing, budget: state.budgets[budgetId] };
  }
  if (input.estimatedCostCents > input.maxJobCostCents) {
    return { ok: false, replayed: false, conflict: false, rejected: true, error: `estimated video cost exceeds per-job ceiling (${input.maxJobCostCents} cents)` };
  }
  const timestamp = now();
  const budget = state.budgets[budgetId] ?? {
    schema: 'urai-video-provider-budget-1',
    budgetId,
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    maxCampaignCostCents: input.maxCampaignCostCents,
    reservedCostCents: 0,
    spentCostCents: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const effectiveMax = Math.min(budget.maxCampaignCostCents, input.maxCampaignCostCents);
  const nextExposure = budget.reservedCostCents + budget.spentCostCents + input.estimatedCostCents;
  if (nextExposure > effectiveMax) {
    return { ok: false, replayed: false, conflict: false, rejected: true, error: `video campaign spend ceiling exceeded (${effectiveMax} cents)`, budget };
  }
  const transaction = createReservation(input, transactionId, timestamp);
  const updatedBudget: VideoBudgetRecord = {
    ...budget,
    maxCampaignCostCents: effectiveMax,
    reservedCostCents: budget.reservedCostCents + input.estimatedCostCents,
    updatedAt: timestamp,
  };
  state.transactions[transactionId] = transaction;
  state.budgets[budgetId] = updatedBudget;
  return { ok: true, replayed: false, conflict: false, rejected: false, transaction, budget: updatedBudget };
}

async function reserveLocal(input: ReturnType<typeof validateReserveInput>) {
  return withLocalLock(async () => {
    const state = await readLocalState();
    const result = reserveAgainstState(state, input);
    if (result.ok && !result.replayed) await writeLocalState(state);
    return result;
  });
}

async function reserveCloud(input: ReturnType<typeof validateReserveInput>): Promise<ReserveResult> {
  const db = getAdminDb();
  if (!db) return reserveLocal(input);
  const transactionId = transactionIdFor(input.tenantId, input.idempotencyKey);
  const budgetId = budgetIdFor(input.tenantId, input.campaignId);
  const txRef = db.collection(TRANSACTION_COLLECTION).doc(transactionId);
  const budgetRef = db.collection(BUDGET_COLLECTION).doc(budgetId);
  return db.runTransaction(async (firestoreTransaction: any) => {
    const [existingSnapshot, budgetSnapshot] = await Promise.all([
      firestoreTransaction.get(txRef),
      firestoreTransaction.get(budgetRef),
    ]);
    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data() as VideoTransactionRecord;
      if (existing.requestHash !== input.requestHash || existing.jobId !== input.jobId) {
        return { ok: false, replayed: false, conflict: true, rejected: false, error: 'idempotency key is already bound to a different video request', transaction: existing };
      }
      return { ok: true, replayed: true, conflict: false, rejected: false, transaction: existing, budget: budgetSnapshot.exists ? budgetSnapshot.data() as VideoBudgetRecord : undefined };
    }
    if (input.estimatedCostCents > input.maxJobCostCents) {
      return { ok: false, replayed: false, conflict: false, rejected: true, error: `estimated video cost exceeds per-job ceiling (${input.maxJobCostCents} cents)` };
    }
    const timestamp = now();
    const budget = budgetSnapshot.exists
      ? budgetSnapshot.data() as VideoBudgetRecord
      : {
          schema: 'urai-video-provider-budget-1' as const,
          budgetId,
          tenantId: input.tenantId,
          campaignId: input.campaignId,
          maxCampaignCostCents: input.maxCampaignCostCents,
          reservedCostCents: 0,
          spentCostCents: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
    const effectiveMax = Math.min(budget.maxCampaignCostCents, input.maxCampaignCostCents);
    const nextExposure = budget.reservedCostCents + budget.spentCostCents + input.estimatedCostCents;
    if (nextExposure > effectiveMax) {
      return { ok: false, replayed: false, conflict: false, rejected: true, error: `video campaign spend ceiling exceeded (${effectiveMax} cents)`, budget };
    }
    const record = createReservation(input, transactionId, timestamp);
    const updatedBudget: VideoBudgetRecord = {
      ...budget,
      maxCampaignCostCents: effectiveMax,
      reservedCostCents: budget.reservedCostCents + input.estimatedCostCents,
      updatedAt: timestamp,
    };
    firestoreTransaction.set(txRef, record, { merge: false });
    firestoreTransaction.set(budgetRef, updatedBudget, { merge: false });
    return { ok: true, replayed: false, conflict: false, rejected: false, transaction: record, budget: updatedBudget };
  });
}

export async function reserveVideoProviderTransaction(raw: ReserveInput): Promise<ReserveResult> {
  const input = validateReserveInput(raw);
  return getAdminDb() ? reserveCloud(input) : reserveLocal(input);
}

function beginAgainstRecord(record: VideoTransactionRecord, requestHash: string, jobId: string): AttemptResult {
  if (record.requestHash !== requestHash || record.jobId !== jobId) {
    return { ok: false, shouldDispatch: false, replayed: false, error: 'video transaction request binding mismatch', transaction: record };
  }
  if (record.status === 'artifact-ready-review' || record.status === 'reconciled') {
    return { ok: true, shouldDispatch: false, replayed: true, transaction: record };
  }
  if (record.status === 'dispatching') {
    return { ok: false, shouldDispatch: false, replayed: false, error: 'video provider attempt is already active', transaction: record };
  }
  if (record.status !== 'reserved') {
    return { ok: false, shouldDispatch: false, replayed: false, error: `video transaction cannot dispatch from status ${record.status}`, transaction: record };
  }
  if (record.attemptCount >= record.maxAttempts) {
    return { ok: false, shouldDispatch: false, replayed: false, error: 'video provider attempt limit reached', transaction: record };
  }
  const attemptId = randomUUID();
  Object.assign(record, {
    status: 'dispatching',
    attemptCount: record.attemptCount + 1,
    activeAttemptId: attemptId,
    failureReason: null,
    updatedAt: now(),
  });
  return { ok: true, shouldDispatch: true, replayed: false, transaction: record, attemptId };
}

export async function beginVideoProviderAttempt(input: { transactionId: string; requestHash: string; jobId: string }): Promise<AttemptResult> {
  const transactionId = validateHash(input.transactionId, 'transactionId');
  const requestHash = validateHash(input.requestHash, 'requestHash');
  const jobId = safeString(input.jobId, 'jobId');
  const db = getAdminDb();
  if (db) {
    const ref = db.collection(TRANSACTION_COLLECTION).doc(transactionId);
    return db.runTransaction(async (firestoreTransaction: any) => {
      const snapshot = await firestoreTransaction.get(ref);
      if (!snapshot.exists) return { ok: false, shouldDispatch: false, replayed: false, error: 'video transaction not found' };
      const record = snapshot.data() as VideoTransactionRecord;
      const result = beginAgainstRecord(record, requestHash, jobId);
      if (result.ok && result.shouldDispatch) firestoreTransaction.set(ref, record, { merge: false });
      return result;
    });
  }
  return withLocalLock(async () => {
    const state = await readLocalState();
    const record = state.transactions[transactionId];
    if (!record) return { ok: false, shouldDispatch: false, replayed: false, error: 'video transaction not found' };
    const result = beginAgainstRecord(record, requestHash, jobId);
    if (result.ok && result.shouldDispatch) await writeLocalState(state);
    return result;
  });
}

export async function markVideoProviderArtifactReady(input: {
  transactionId: string;
  attemptId: string;
  artifactSha256: string;
  artifactMimeType: string;
  providerPredictionId?: string | null;
}) {
  const transactionId = validateHash(input.transactionId, 'transactionId');
  const artifactSha256 = validateHash(input.artifactSha256, 'artifactSha256');
  const attemptId = safeString(input.attemptId, 'attemptId');
  const artifactMimeType = safeString(input.artifactMimeType, 'artifactMimeType');
  const apply = (record: VideoTransactionRecord) => {
    if (record.status !== 'dispatching' || record.activeAttemptId !== attemptId) throw new Error('video provider attempt binding mismatch');
    Object.assign(record, {
      status: 'artifact-ready-review',
      activeAttemptId: null,
      providerPredictionId: input.providerPredictionId ? safeString(input.providerPredictionId, 'providerPredictionId', 300) : null,
      artifactSha256,
      artifactMimeType,
      failureReason: null,
      reservationHeld: true,
      updatedAt: now(),
    });
    return record;
  };
  const db = getAdminDb();
  if (db) {
    const ref = db.collection(TRANSACTION_COLLECTION).doc(transactionId);
    return db.runTransaction(async (firestoreTransaction: any) => {
      const snapshot = await firestoreTransaction.get(ref);
      if (!snapshot.exists) throw new Error('video transaction not found');
      const record = apply(snapshot.data() as VideoTransactionRecord);
      firestoreTransaction.set(ref, record, { merge: false });
      return record;
    });
  }
  return withLocalLock(async () => {
    const state = await readLocalState();
    const record = state.transactions[transactionId];
    if (!record) throw new Error('video transaction not found');
    apply(record);
    await writeLocalState(state);
    return record;
  });
}

export async function markVideoProviderAttemptFailed(input: {
  transactionId: string;
  attemptId: string;
  failureReason: string;
}) {
  const transactionId = validateHash(input.transactionId, 'transactionId');
  const attemptId = safeString(input.attemptId, 'attemptId');
  const failureReason = safeString(input.failureReason, 'failureReason', 1000);
  const apply = (record: VideoTransactionRecord) => {
    if (record.status !== 'dispatching' || record.activeAttemptId !== attemptId) throw new Error('video provider attempt binding mismatch');
    Object.assign(record, {
      status: 'failed-reservation-held',
      activeAttemptId: null,
      failureReason,
      reservationHeld: true,
      updatedAt: now(),
    });
    return record;
  };
  const db = getAdminDb();
  if (db) {
    const ref = db.collection(TRANSACTION_COLLECTION).doc(transactionId);
    return db.runTransaction(async (firestoreTransaction: any) => {
      const snapshot = await firestoreTransaction.get(ref);
      if (!snapshot.exists) throw new Error('video transaction not found');
      const record = apply(snapshot.data() as VideoTransactionRecord);
      firestoreTransaction.set(ref, record, { merge: false });
      return record;
    });
  }
  return withLocalLock(async () => {
    const state = await readLocalState();
    const record = state.transactions[transactionId];
    if (!record) throw new Error('video transaction not found');
    apply(record);
    await writeLocalState(state);
    return record;
  });
}

export async function readVideoProviderTransaction(transactionId: string) {
  const validated = validateHash(transactionId, 'transactionId');
  const db = getAdminDb();
  if (db) {
    const snapshot = await db.collection(TRANSACTION_COLLECTION).doc(validated).get();
    return snapshot.exists ? snapshot.data() as VideoTransactionRecord : null;
  }
  return (await readLocalState()).transactions[validated] ?? null;
}