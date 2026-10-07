/** Internal image-executor admission; an offline receipt never grants execution. */
import { createHash, createPublicKey, randomUUID, timingSafeEqual, verify } from 'node:crypto';

type RecordValue = Record<string, any>;
type Ref = { path: string };
type Tx = { get(ref: Ref): Promise<{ exists: boolean; data(): RecordValue }>; set(ref: Ref, value: RecordValue): void };
export type SpendDb = { doc(path: string): Ref; runTransaction<T>(f: (tx: Tx) => Promise<T>): Promise<T> };
export type SpendKeys = Record<string, { subject: string; publicKey: string }>;
export class SpendRejected extends Error { code = 'spend_admission_rejected'; }
function need(test: unknown, reason: string): asserts test { if (!test) throw new SpendRejected(reason); }
function integer(value: unknown, name: string, min = 0): number {
  need(typeof value === 'number' && Number.isSafeInteger(value) && value >= min, `invalid ${name}`); return value;
}
function nonempty(value: unknown, name: string): string { need(typeof value === 'string' && value.trim(), `missing ${name}`); return value; }
function sha(value: unknown, length = 64): string { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value), 'invalid digest'); return value; }
function date(value: unknown): number {
  need(typeof value === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(value), 'timestamp requires timezone');
  const result = Date.parse(value); need(Number.isFinite(result), 'invalid timestamp'); return result;
}
function fresh(record: RecordValue, observed: string, expires: string, now: number) {
  need(date(record[observed]) <= now && now < date(record[expires]), 'stale or future trusted record');
}
/** Python ensure_ascii=True, sorted keys. Fractional values and ambiguous keys fail closed. */
export function canonical(value: any): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') { integer(Math.abs(value), 'canonical integer'); return String(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  need(value && typeof value === 'object', 'unsupported canonical value');
  const keys = Object.keys(value).sort();
  need(keys.every(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)), 'ambiguous canonical key');
  return `{${keys.map(k => `${canonical(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function hash(value: string) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
export function jobDigest(job: RecordValue) { return hash(canonical(Object.fromEntries(Object.entries(job).filter(([k]) => k !== 'approval' && k !== 'attempts')))); }
function signed(record: RecordValue, keys: SpendKeys, subjectField: string) {
  const key = keys[nonempty(record.key_id, 'signer key')];
  need(key && key.subject === record[subjectField], 'untrusted signer');
  const signature = nonempty(record.signature, 'signature'); need(/^[A-Za-z0-9+/]+={0,2}$/.test(signature), 'invalid signature');
  const payload = Object.fromEntries(Object.entries(record).filter(([k]) => k !== 'signature'));
  let valid = false; try { const publicKey = createPublicKey(key.publicKey); need(publicKey.asymmetricKeyType === 'ed25519', 'Ed25519 signer required'); valid = verify(null, Buffer.from(canonical(payload)), publicKey, Buffer.from(signature, 'base64')); } catch { /* reject */ }
  need(valid, 'invalid authenticated signature');
}
export function authenticateSpend(secret: string | undefined, supplied: string | undefined): boolean {
  if (!secret || secret.length < 32 || !supplied) return false;
  return timingSafeEqual(createHash('sha256').update(secret).digest(), createHash('sha256').update(supplied).digest());
}

/** Enforces the Labs #229 consistency contract again within the account transaction. */
export function validateSpend(job: RecordValue, account: RecordValue, authority: RecordValue, now: number) {
  need(integer(job.schema_version, 'schema', 1) === 1, 'unsupported schema');
  for (const name of ['job_id', 'provider', 'account_id', 'operation', 'model_version', 'owner_lane', 'consumer']) nonempty(job[name], name);
  need(['GENERIC', 'INTERPRETIVE', 'SPATIALLY_RECONSTRUCTABLE'].includes(job.truth_class), 'invalid truth class');
  need(job.rights_reviewed === true, 'rights not reviewed');
  need(canonical(job.authority) === canonical(authority.binding), 'authority changed');
  sha(job.authority.sha, 40); nonempty(job.authority.repository, 'repository');
  need(authority.trusted_readback === true, 'untrusted authority'); fresh(authority, 'observed_at', 'expires_at', now);
  const inputs = job.input_sha256; need(Array.isArray(inputs) && inputs.length && new Set(inputs).size === inputs.length, 'invalid inputs'); inputs.forEach((s: unknown) => sha(s));
  const reuse = job.reuse_review;
  need(canonical(reuse.input_sha256) === canonical(inputs) && ['MISSING_COMPONENT', 'REWORK_EXISTING'].includes(reuse.decision), 'reuse not reviewed'); nonempty(reuse.receipt, 'reuse receipt');
  need(job.acceptance.stage === 'SPECIFIED', 'already generated or ambiguous stage');
  nonempty(job.acceptance.criteria, 'acceptance'); nonempty(job.acceptance.verification, 'verification');
  const outputs = job.expected_outputs; need(Array.isArray(outputs) && outputs.length && new Set(outputs).size === outputs.length, 'invalid outputs'); outputs.forEach((v: unknown) => nonempty(v, 'output'));
  const b = job.budget; need(b.currency === 'USD', 'unsupported currency');
  const cap = integer(b.max_usd_micros, 'USD cap', 1), credits = integer(b.max_credits, 'credit cap');
  const units = integer(b.units, 'units', 1), retries = integer(b.max_retries, 'retries'); need(retries <= 1, 'retry cap');
  need(integer(b.max_runtime_seconds, 'runtime', 1) <= 86400, 'runtime exceeds executor bound'); need(b.hard_stop_supported === true && b.auto_top_up === false, 'hard stop or top-up policy');
  const rates = b.rates, usdRate = integer(rates.usd_micros_per_unit, 'USD rate'), creditRate = integer(rates.credits_per_unit, 'credit rate');
  const overhead = integer(b.storage_egress_overhead_usd_micros, 'overhead');
  const worstUsd = integer(units * (retries + 1) * usdRate + overhead, 'worst-case USD'), worstCredits = integer(units * (retries + 1) * creditRate, 'worst-case credits');
  need(worstUsd <= cap && worstCredits <= credits && (usdRate > 0 || creditRate > 0), 'worst-case exceeds cap or unknown price'); nonempty(rates.receipt, 'pricing'); fresh(rates, 'verified_at', 'expires_at', now);
  need(account.provider === job.provider && account.account_id === job.account_id && account.balance_type === 'API' && account.trusted_readback === true, 'untrusted account');
  fresh(account, 'observed_at', 'expires_at', now); need(account.frozen !== true, 'account frozen');
  const availableUsd = integer(account.available_usd_micros, 'USD balance'), availableCredits = integer(account.available_credits, 'credit balance');
  need(Array.isArray(account.reservations), 'missing shared reservations'); let totalUsd = 0, totalCredits = 0; const ids = new Set(); let own: RecordValue | undefined;
  for (const r of account.reservations) {
    nonempty(r.job_id, 'reserved job'); need(!ids.has(r.job_id), 'duplicate reservation'); ids.add(r.job_id);
    totalUsd = integer(totalUsd + integer(r.usd_micros, 'reserved USD'), 'total USD'); totalCredits = integer(totalCredits + integer(r.credits, 'reserved credits'), 'total credits');
    if (r.job_id === job.job_id) own = r;
  }
  need(own && own.usd_micros === cap && own.credits === credits, 'exact reservation missing'); need(totalUsd <= availableUsd && totalCredits <= availableCredits, 'account oversubscribed');
  need(Array.isArray(job.attempts) && job.attempts.length <= retries, 'retry exhausted'); let spentUsd = 0, spentCredits = 0; const taskIds = new Set();
  for (const a of job.attempts) {
    nonempty(a.task_id, 'task'); need(!taskIds.has(a.task_id), 'duplicate task'); taskIds.add(a.task_id);
    need(a.status === 'FAILED' && a.charges_reconciled === true, 'prior attempt unresolved or terminal'); nonempty(a.corrective_action, 'corrective action');
    spentUsd = integer(spentUsd + integer(a.actual_usd_micros, 'actual USD'), 'spent USD'); spentCredits = integer(spentCredits + integer(a.actual_credits, 'actual credits'), 'spent credits');
  }
  need(spentUsd + units * usdRate + overhead <= cap && spentCredits + units * creditRate <= credits, 'remaining cap insufficient');
  const approval = job.approval; need(approval.status === 'APPROVED' && approval.kind === 'EXPLICIT_BOUNDED_SPEND', 'explicit approval missing');
  nonempty(approval.receipt, 'approval receipt'); nonempty(approval.approver, 'approver'); fresh(approval, 'issued_at', 'expires_at', now);
  need(approval.job_digest === jobDigest(job) && integer(approval.max_usd_micros, 'approved USD', 1) === cap && integer(approval.max_credits, 'approved credits') === credits, 'approval binding changed');
}

export async function spendAction(db: SpendDb, action: string, input: RecordValue, options: { now: () => number; approvalKeys: SpendKeys; reconciliationKeys: SpendKeys; sourceSha: string }) {
  need(['preflight', 'reserve', 'record', 'reconcile', 'snapshot'].includes(action), 'unsupported action');
  const jobId = nonempty(input.job_id, 'job id'); const jobRef = db.doc(`assetFactorySpendJobs/${hash(jobId)}`);
  // Stable account identity is provider + API account, never a run-specific path.
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(jobRef); need(snapshot.exists, 'protected job missing'); const state = snapshot.data();
    const job = structuredClone(state.job); need(job.job_id === jobId, 'job identity changed');
    const accountRef = db.doc(`assetFactorySpendAccounts/${hash(`${job.provider}\n${job.account_id}`)}`);
    const accountSnapshot = await tx.get(accountRef); need(accountSnapshot.exists, 'protected account missing'); const account = structuredClone(accountSnapshot.data());
    const attemptId = input.attempt_id;

    if (action === 'snapshot') return { ok: true, job, account, provider_call_authorized: false, execution_performed: false };

    if (action === 'record') {
      const index = job.attempts.findIndex((a: RecordValue) => a.attempt_id === attemptId); need(index >= 0, 'unknown attempt'); const attempt = job.attempts[index];
      need(attempt.status === 'RESERVED', 'attempt already recorded'); need(['succeeded', 'failed'].includes(input.status), 'invalid outcome');
      // Caller outcomes are never trusted charge receipts or retry permission.
      attempt.status = 'RECONCILIATION_REQUIRED'; attempt.reported_outcome = input.status; attempt.reported_task_id = typeof input.request_id === 'string' ? input.request_id.slice(0, 256) : null;
      tx.set(jobRef, { ...state, job }); return { ok: true, provider_call_authorized: false, execution_performed: false, reconciliation_required: true };
    }

    if (action === 'reconcile') {
      const receiptRef = db.doc(`assetFactorySpendChargeReceipts/${sha(input.receipt_sha256)}`); const receiptSnapshot = await tx.get(receiptRef); need(receiptSnapshot.exists, 'trusted charge receipt missing'); const receipt = receiptSnapshot.data();
      signed(receipt, options.reconciliationKeys, 'reconciler'); need(hash(canonical(receipt)) === input.receipt_sha256, 'charge receipt hash changed');
      const index = job.attempts.findIndex((a: RecordValue) => a.attempt_id === attemptId); need(index >= 0, 'unknown attempt'); const attempt = job.attempts[index];
      need(['RESERVED', 'RECONCILIATION_REQUIRED'].includes(attempt.status), 'attempt already reconciled');
      need(receipt.job_id === jobId && receipt.attempt_id === attemptId && receipt.provider === job.provider && receipt.account_id === job.account_id && receipt.job_digest === jobDigest(job), 'charge receipt binding changed');
      need(['FAILED', 'SUCCEEDED', 'CANCELLED'].includes(receipt.status) && receipt.final === true, 'receipt not final'); nonempty(receipt.task_id, 'provider task');
      need(!job.attempts.some((a: RecordValue, i: number) => i !== index && a.task_id === receipt.task_id), 'provider task already reconciled to another attempt');
      need(date(receipt.observed_at) <= options.now() && date(receipt.observed_at) >= date(attempt.reserved_at), 'receipt time invalid');
      attempt.status = receipt.status; attempt.task_id = receipt.task_id; attempt.charges_reconciled = true; attempt.actual_usd_micros = integer(receipt.actual_usd_micros, 'actual USD'); attempt.actual_credits = integer(receipt.actual_credits, 'actual credits'); attempt.charge_receipt_sha256 = input.receipt_sha256;
      attempt.corrective_action = receipt.status === 'FAILED' ? nonempty(receipt.corrective_action, 'corrective action') : null;
      const spentUsd = integer(job.attempts.reduce((s: number, a: RecordValue) => s + integer(a.actual_usd_micros, 'actual USD'), 0), 'total actual USD');
      const spentCredits = integer(job.attempts.reduce((s: number, a: RecordValue) => s + integer(a.actual_credits, 'actual credits'), 0), 'total actual credits');
      const overrun = spentUsd > job.budget.max_usd_micros || spentCredits > job.budget.max_credits;
      const terminal = receipt.status !== 'FAILED' || job.attempts.length > job.budget.max_retries || overrun;
      if (terminal) {
        const held = account.reservations.findIndex((r: RecordValue) => r.job_id === jobId); need(held >= 0, 'reservation disappeared');
        // Keep actual debits held against the same snapshot. A later balance read may
        // double-count until explicit account reconciliation, never undercount.
        account.reservations[held] = { job_id: `settled:${jobId}`, usd_micros: spentUsd, credits: spentCredits };
        state.terminal = true;
      }
      if (overrun) { account.frozen = true; state.cap_overrun = true; }
      tx.set(accountRef, account); tx.set(jobRef, { ...state, job });
      return { ok: true, provider_call_authorized: false, execution_performed: false, reconciled: true, terminal, cap_overrun: overrun };
    }

    need(state.terminal !== true, 'job terminal');
    const [approvalSnapshot, authoritySnapshot, priceSnapshot, controlsSnapshot] = await Promise.all([
      tx.get(db.doc(`assetFactorySpendApprovals/${sha(job.approval_ref)}`)),
      tx.get(db.doc(`assetFactorySpendAuthorities/${sha(job.authority_ref)}`)),
      tx.get(db.doc(`assetFactorySpendPricing/${sha(job.pricing_ref)}`)),
      tx.get(db.doc(`assetFactorySpendControls/${sha(job.executor.controls_ref)}`)),
    ]);
    need(approvalSnapshot.exists && authoritySnapshot.exists && priceSnapshot.exists && controlsSnapshot.exists, 'trusted execution records missing');
    const approval = approvalSnapshot.data(), authority = authoritySnapshot.data(), price = priceSnapshot.data(), controls = controlsSnapshot.data();
    signed(approval, options.approvalKeys, 'approver'); job.approval = approval;
    need(price.provider === job.provider && price.account_id === job.account_id && price.model_version === job.model_version && price.request_sha256 === job.executor.request_sha256 && price.trusted_readback === true, 'price binding changed');
    need(canonical(price.rates) === canonical(job.budget.rates), 'pricing changed');
    fresh(controls, 'observed_at', 'expires_at', options.now());
    nonempty(controls.proof_receipt, 'provider control proof'); sha(controls.enforcement_source_sha, 40);
    const currentSource = sha(options.sourceSha, 40);
    need(job.executor.source_sha === currentSource && controls.enforcement_source_sha === currentSource && input.executor_source_sha === currentSource, 'execution source differs from approved enforcement proof');
    need(controls.max_usd_micros === job.budget.max_usd_micros && controls.max_credits === job.budget.max_credits, 'provider cap differs from approval');
    need(controls.trusted_readback === true && controls.provider === job.provider && controls.account_id === job.account_id && controls.endpoint === job.executor.endpoint && controls.request_sha256 === job.executor.request_sha256 && controls.hard_stop_supported === true && controls.cost_cap_enforced === true && controls.auto_top_up === false && controls.max_runtime_seconds === job.budget.max_runtime_seconds, 'provider hard controls unproven');
    need(input.request_sha256 === sha(job.executor.request_sha256) && input.endpoint === job.executor.endpoint && input.provider === job.provider && input.model === job.model_version && input.asset === job.executor.asset && input.request_size === job.executor.request_size, 'actual request differs from approved request');
    const existing = account.reservations.find((r: RecordValue) => r.job_id === jobId);
    if (!existing) account.reservations.push({ job_id: jobId, usd_micros: job.budget.max_usd_micros, credits: job.budget.max_credits });
    validateSpend(job, account, authority, options.now());
    const envelope = { job, account, authority };
    if (action === 'preflight') return { ok: true, envelope, provider_call_authorized: false, execution_performed: false };
    need(input.job_digest === jobDigest(job), 'offline job digest changed');
    const id = randomUUID(); const attempt = { attempt_id: id, status: 'RESERVED', reserved_at: new Date(options.now()).toISOString(), request_sha256: input.request_sha256, charges_reconciled: false };
    job.attempts.push(attempt); delete job.approval; tx.set(accountRef, account); tx.set(jobRef, { ...state, job });
    return { ok: true, attempt_id: id, job_digest: input.job_digest, executor_source_sha: currentSource, max_runtime_seconds: job.budget.max_runtime_seconds, provider_call_authorized: true, execution_performed: false };
  });
}
