import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getAdminDb } from './firebaseAdmin';
import type { VideoBudgetRecord, VideoTransactionRecord } from './assetVideoTransactions';

export type VideoReconciliationResolution =
  | 'artifact-accepted'
  | 'artifact-rejected'
  | 'failed-cost-settled'
  | 'provider-refund';

type LocalState = {
  transactions: Record<string, VideoTransactionRecord>;
  budgets: Record<string, VideoBudgetRecord>;
};

type ReconcileInput = {
  transactionId: string;
  actualCostCents: number;
  resolution: VideoReconciliationResolution;
  operatorId: string;
  note?: string;
};

type ReleaseInput = {
  transactionId: string;
  operatorId: string;
  reason: string;
};

const TRANSACTION_COLLECTION = 'assetFactoryVideoTransactions';
const BUDGET_COLLECTION = 'assetFactoryVideoBudgets';
const localBaseDir = path.join(process.cwd(), '.asset-factory-local');
const localStatePath = path.join(localBaseDir, 'video-transactions.json');
const localLockPath = path.join(localBaseDir, 'video-transactions.lock');

function now() {
  return new Date().toISOString();
}

function validateHash(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 value`);
  }
  return value;
}

function safeString(value: unknown, label: string, maxLength = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value.trim();
}

function safeCost(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function budgetIdFor(transaction: VideoTransactionRecord) {
  return createHash('sha256')
    .update(`video-budget\u0000${transaction.tenantId}\u0000${transaction.campaignId}`)
    .digest('hex');
}

function normalizeState(value: Partial<LocalState> | null | undefined): LocalState {
  return {
    transactions: value?.transactions ?? {},
    budgets: value?.budgets ?? {},
  };
}

async function readLocalState() {
  try {
    return normalizeState(JSON.parse(await fs.readFile(localStatePath, 'utf8')) as Partial<LocalState>);
  } catch {
    return { transactions: {}, budgets: {} } as LocalState;
  }
}

async function writeLocalState(state: LocalState) {
  await fs.mkdir(localBaseDir, { recursive: true });
  const temporary = `${localStatePath}.tmp-${process.pid}-${randomUUID()}`;
  await fs.writeFile(temporary, `${JSON.stringify(normalizeState(state), null, 2)}\n`, { mode: 0o600, flag: 'wx' });
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

function reconciliationFields(input: ReconcileInput, transaction: VideoTransactionRecord) {
  const transactionId = validateHash(input.transactionId, 'transactionId');
  const actualCostCents = safeCost(input.actualCostCents, 'actualCostCents');
  const operatorId = safeString(input.operatorId, 'operatorId', 200);
  const note = input.note ? safeString(input.note, 'note') : null;
  const allowed = new Set<VideoReconciliationResolution>([
    'artifact-accepted',
    'artifact-rejected',
    'failed-cost-settled',
    'provider-refund',
  ]);
  if (!allowed.has(input.resolution)) throw new Error('resolution is invalid');
  if (transaction.transactionId !== transactionId) throw new Error('transaction identity mismatch');
  if (!transaction.reservationHeld) throw new Error('video reservation is not held');
  if (transaction.status !== 'artifact-ready-review' && transaction.status !== 'failed-reservation-held') {
    throw new Error(`video transaction cannot reconcile from status ${transaction.status}`);
  }
  if (actualCostCents > transaction.maxJobCostCents) {
    throw new Error(`actual video cost exceeds per-job ceiling (${transaction.maxJobCostCents} cents)`);
  }
  if (input.resolution === 'provider-refund' && actualCostCents !== 0) {
    throw new Error('provider-refund reconciliation must use zero actual cost');
  }
  return { transactionId, actualCostCents, operatorId, note };
}

function applyReconciliation(
  transaction: VideoTransactionRecord,
  budget: VideoBudgetRecord,
  input: ReconcileInput,
) {
  const fields = reconciliationFields(input, transaction);
  const nextReserved = budget.reservedCostCents - transaction.reservedCostCents;
  if (nextReserved < 0) throw new Error('video budget reserved amount would become negative');
  const nextSpent = budget.spentCostCents + fields.actualCostCents;
  if (nextReserved + nextSpent > budget.maxCampaignCostCents) {
    throw new Error(`actual video cost would exceed campaign ceiling (${budget.maxCampaignCostCents} cents)`);
  }
  const timestamp = now();
  const updatedBudget: VideoBudgetRecord = {
    ...budget,
    reservedCostCents: nextReserved,
    spentCostCents: nextSpent,
    updatedAt: timestamp,
  };
  const updatedTransaction = {
    ...transaction,
    status: 'reconciled' as const,
    actualCostCents: fields.actualCostCents,
    reservedCostCents: 0,
    reservationHeld: false,
    productionReady: false as const,
    reconciliationResolution: input.resolution,
    reconciledBy: fields.operatorId,
    reconciledAt: timestamp,
    reconciliationNote: fields.note,
    updatedAt: timestamp,
  } as VideoTransactionRecord & Record<string, unknown>;
  return { transaction: updatedTransaction, budget: updatedBudget };
}

function applyRelease(transaction: VideoTransactionRecord, budget: VideoBudgetRecord, input: ReleaseInput) {
  const transactionId = validateHash(input.transactionId, 'transactionId');
  const operatorId = safeString(input.operatorId, 'operatorId', 200);
  const reason = safeString(input.reason, 'reason');
  if (transaction.transactionId !== transactionId) throw new Error('transaction identity mismatch');
  if (!transaction.reservationHeld) throw new Error('video reservation is not held');
  if (transaction.status !== 'reserved' || transaction.attemptCount !== 0) {
    throw new Error('video reservation may only be released before provider dispatch');
  }
  const nextReserved = budget.reservedCostCents - transaction.reservedCostCents;
  if (nextReserved < 0) throw new Error('video budget reserved amount would become negative');
  const timestamp = now();
  const updatedBudget: VideoBudgetRecord = {
    ...budget,
    reservedCostCents: nextReserved,
    updatedAt: timestamp,
  };
  const updatedTransaction = {
    ...transaction,
    status: 'released' as const,
    actualCostCents: 0,
    reservedCostCents: 0,
    reservationHeld: false,
    productionReady: false as const,
    releasedBy: operatorId,
    releasedAt: timestamp,
    releaseReason: reason,
    updatedAt: timestamp,
  } as VideoTransactionRecord & Record<string, unknown>;
  return { transaction: updatedTransaction, budget: updatedBudget };
}

export async function reconcileVideoProviderTransaction(input: ReconcileInput) {
  const transactionId = validateHash(input.transactionId, 'transactionId');
  const db = getAdminDb();
  if (db) {
    const transactionRef = db.collection(TRANSACTION_COLLECTION).doc(transactionId);
    return db.runTransaction(async (firestoreTransaction: any) => {
      const transactionSnapshot = await firestoreTransaction.get(transactionRef);
      if (!transactionSnapshot.exists) throw new Error('video transaction not found');
      const transaction = transactionSnapshot.data() as VideoTransactionRecord;
      const budgetId = budgetIdFor(transaction);
      const budgetRef = db.collection(BUDGET_COLLECTION).doc(budgetId);
      const budgetSnapshot = await firestoreTransaction.get(budgetRef);
      if (!budgetSnapshot.exists) throw new Error('video budget not found');
      const result = applyReconciliation(transaction, budgetSnapshot.data() as VideoBudgetRecord, input);
      firestoreTransaction.set(transactionRef, result.transaction, { merge: false });
      firestoreTransaction.set(budgetRef, result.budget, { merge: false });
      return result;
    });
  }
  return withLocalLock(async () => {
    const state = await readLocalState();
    const transaction = state.transactions[transactionId];
    if (!transaction) throw new Error('video transaction not found');
    const budgetId = budgetIdFor(transaction);
    const budget = state.budgets[budgetId];
    if (!budget) throw new Error('video budget not found');
    const result = applyReconciliation(transaction, budget, input);
    state.transactions[transactionId] = result.transaction as VideoTransactionRecord;
    state.budgets[budgetId] = result.budget;
    await writeLocalState(state);
    return result;
  });
}

export async function releaseVideoProviderReservation(input: ReleaseInput) {
  const transactionId = validateHash(input.transactionId, 'transactionId');
  const db = getAdminDb();
  if (db) {
    const transactionRef = db.collection(TRANSACTION_COLLECTION).doc(transactionId);
    return db.runTransaction(async (firestoreTransaction: any) => {
      const transactionSnapshot = await firestoreTransaction.get(transactionRef);
      if (!transactionSnapshot.exists) throw new Error('video transaction not found');
      const transaction = transactionSnapshot.data() as VideoTransactionRecord;
      const budgetId = budgetIdFor(transaction);
      const budgetRef = db.collection(BUDGET_COLLECTION).doc(budgetId);
      const budgetSnapshot = await firestoreTransaction.get(budgetRef);
      if (!budgetSnapshot.exists) throw new Error('video budget not found');
      const result = applyRelease(transaction, budgetSnapshot.data() as VideoBudgetRecord, input);
      firestoreTransaction.set(transactionRef, result.transaction, { merge: false });
      firestoreTransaction.set(budgetRef, result.budget, { merge: false });
      return result;
    });
  }
  return withLocalLock(async () => {
    const state = await readLocalState();
    const transaction = state.transactions[transactionId];
    if (!transaction) throw new Error('video transaction not found');
    const budgetId = budgetIdFor(transaction);
    const budget = state.budgets[budgetId];
    if (!budget) throw new Error('video budget not found');
    const result = applyRelease(transaction, budget, input);
    state.transactions[transactionId] = result.transaction as VideoTransactionRecord;
    state.budgets[budgetId] = result.budget;
    await writeLocalState(state);
    return result;
  });
}
