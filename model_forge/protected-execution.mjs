import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Only the protected deployment may configure issuer public keys or enable execution.
// Approval/balance/receipt documents are read from Firestore, never from CLI JSON.
export const COLLECTIONS = Object.freeze({
  approvals: 'assetFactorySpendApprovals', accounts: 'assetFactorySpendAccounts',
  balances: 'assetFactoryModelForgeBalances',
  controls: 'assetFactoryModelForgeControls',
  ledgers: 'assetFactorySpendLedgers', claims: 'assetFactorySpendClaims',
  receipts: 'assetFactorySpendReceipts', consumed: 'assetFactoryConsumedSpendReceipts',
});
const MAX_RUNTIME_MS = 20 * 60_000;
const MAX_JSON_BYTES = 1024 * 1024;

function requireValue(condition, reason) {
  if (!condition) throw new Error(`Protected spend blocked: ${reason}`);
}

function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max, `invalid ${label}`);
  return value;
}

function identifier(value, label) {
  requireValue(typeof value === 'string' && /^[a-zA-Z0-9_-]{3,128}$/.test(value), `invalid ${label}`);
  return value;
}

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    requireValue(Number.isFinite(value) && !Object.is(value, -0), 'nonfinite/ambiguous number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  requireValue(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'unsupported canonical value');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function digest(value) {
  return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function snapshotPlain(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  requireValue(value && typeof value === 'object' && [Object.prototype, Array.prototype].includes(Object.getPrototypeOf(value)), 'nonplain mutable request object');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireValue(Object.values(descriptors).every((entry) => !entry.get && !entry.set), 'request accessors are forbidden');
  if (Array.isArray(value)) return value.map(snapshotPlain);
  return Object.fromEntries(Object.entries(descriptors).map(([key, entry]) => [key, snapshotPlain(entry.value)]));
}

async function snapshotInit(init) {
  requireValue(init && Object.getPrototypeOf(init) === Object.prototype, 'request init must be plain');
  const descriptors = Object.getOwnPropertyDescriptors(init);
  requireValue(Object.values(descriptors).every((entry) => !entry.get && !entry.set), 'request init accessors are forbidden');
  requireValue(Object.keys(descriptors).every((key) => ['method', 'headers', 'body'].includes(key)), 'unapproved fetch option');
  const method = descriptors.method?.value ?? 'GET';
  requireValue(method === 'GET' || method === 'POST', 'invalid request method');
  const suppliedHeaders = descriptors.headers?.value ?? {};
  const headerEntries = suppliedHeaders instanceof Headers
    ? [...Headers.prototype.entries.call(suppliedHeaders)]
    : Object.entries(snapshotPlain(suppliedHeaders));
  requireValue(headerEntries.every(([key, value]) => typeof key === 'string' && typeof value === 'string'), 'headers must contain fixed strings');
  const headers = new Headers(headerEntries);
  const body = descriptors.body?.value;
  if (body === undefined) return { init: { method, headers }, wireBody: null };
  if (typeof body === 'string') return { init: { method, headers, body }, wireBody: body };
  requireValue(body instanceof FormData, 'unsupported request body');
  const entries = [...FormData.prototype.entries.call(body)];
  const frozen = new FormData();
  const parts = [];
  for (const [key, value] of entries) {
    if (typeof value === 'string') { frozen.append(key, value); parts.push([key, value]); continue; }
    requireValue(value instanceof Blob, 'unsupported multipart value');
    const bytes = Buffer.from(await Blob.prototype.arrayBuffer.call(value));
    // File name/type are immutable on native FormData files. Reject subclass accessors.
    requireValue(Object.getPrototypeOf(value) === File.prototype, 'custom multipart file is forbidden');
    const name = value.name;
    const type = value.type;
    frozen.append(key, new Blob([bytes], { type }), name);
    parts.push([key, { name, type, bytes: bytes.length, sha256: sha256(bytes) }]);
  }
  return { init: { method, headers, body: frozen }, wireBody: parts };
}

function validateWirePlan(request) {
  requireValue(Array.isArray(request.wirePlan) && request.wirePlan.length === request.maxCreateCalls, 'exact create wire plan missing');
  for (const [index, plan] of request.wirePlan.entries()) {
    requireValue(classifyRequest(request.provider, plan.url, 'POST') === 'CREATE', 'wire plan includes an unapproved create');
    requireValue(['JSON', 'FORM'].includes(plan.bodyType), 'wire body format missing');
    if (request.provider === 'replicate') requireValue(plan.url === `https://api.replicate.com/v1/models/${request.model}/predictions`, 'wire endpoint does not bind selected model');
    if (request.provider === 'meshy' && index === 0) requireValue(plan.body.ai_model === request.model, 'Meshy wire model mismatch');
    if (request.provider === 'tripo') requireValue(plan.body.model_version === request.model, 'Tripo wire model mismatch');
    if (request.provider === 'rodin') requireValue(plan.bodyType === 'FORM' && plan.body.some(([key, value]) => key === 'tier' && value === request.model), 'Rodin wire tier mismatch');
    if (plan.taskBinding) requireValue(request.provider === 'meshy' && index === 1 && plan.taskBinding.field === 'preview_task_id' && plan.taskBinding.operationIndex === 0 && plan.body.preview_task_id === null, 'unapproved dynamic task binding');
  }
}

// Permanent generation identity comes from actual provider inputs, never asset
// labels, raw spec formatting, approval IDs, output names or caller-supplied hashes.
// File names remain exact signed wire values but cannot reset a same-byte image claim.
export function wireInputDigest(wirePlan) {
  return digest(wirePlan.map((plan) => ({
    url: plan.url,
    bodyType: plan.bodyType,
    body: plan.bodyType === 'FORM'
      ? plan.body.map(([key, value]) => [key, typeof value === 'string' ? value : { type: value.type, bytes: value.bytes, sha256: value.sha256 }])
      : plan.body,
    ...(plan.taskBinding ? { taskBinding: { field: plan.taskBinding.field, operationIndex: plan.taskBinding.operationIndex } } : {}),
  })));
}

export function executorDigest() {
  const pending = ['forge.mjs', 'protected-execution.mjs'];
  const files = new Map();
  while (pending.length) {
    const name = pending.pop();
    if (files.has(name)) continue;
    requireValue(!name.includes('..') && name.endsWith('.mjs'), 'unbounded executor source dependency');
    const bytes = fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)));
    files.set(name, sha256(bytes));
    for (const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*\()['"]\.\/([^'"]+)['"]/g)) pending.push(match[1]);
  }
  return digest([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, hash]) => ({ name, sha256: hash })));
}

function authenticated(record, keys, kind, now) {
  requireValue(record && typeof record === 'object', `missing signed ${kind}`);
  const keyId = identifier(record.keyId, 'issuer key id');
  requireValue(Object.hasOwn(keys, keyId), 'issuer not in protected deployment trust configuration');
  const issuer = keys[keyId];
  requireValue(issuer && typeof issuer === 'object' && Array.isArray(issuer.kinds) && issuer.kinds.includes(kind), 'issuer is not admitted for this record purpose');
  const key = crypto.createPublicKey(issuer.publicKey);
  requireValue(key.asymmetricKeyType === 'ed25519', 'issuer must use Ed25519');
  requireValue(typeof record.signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(record.signature), 'malformed signature');
  const signature = Buffer.from(record.signature, 'base64url');
  requireValue(signature.length === 64 && crypto.verify(null, Buffer.from(canonical(record.payload)), key, signature), 'signature verification failed');
  const payload = record.payload;
  requireValue(payload.schemaVersion === 1 && payload.kind === kind, 'signed record kind/schema mismatch');
  integer(payload.issuedAtMs, 'issued timestamp');
  integer(payload.expiresAtMs, 'expiry timestamp');
  requireValue(payload.issuedAtMs <= now && now < payload.expiresAtMs, `${kind} expired or future`);
  requireValue(payload.expiresAtMs - payload.issuedAtMs <= 24 * 60 * 60_000, 'signed validity exceeds 24 hours');
  return payload;
}

function doc(db, collection, id) { return db.collection(collection).doc(id); }
function data(snapshot) { return snapshot?.exists ? snapshot.data() : null; }
function receiptId(accountId, provider, taskId) { return digest({ accountId, provider, taskId }); }
export function canonicalAccountId(provider, accountId) { return sha256(Buffer.from(`${provider}\n${accountId}`)); }

function sharedAccount(account, balance, allowFrozen = false) {
  requireValue(account && Object.getPrototypeOf(account) === Object.prototype, 'missing canonical shared API account');
  requireValue(account.provider === balance.provider && account.account_id === balance.accountId && account.balance_type === 'API' && account.trusted_readback === true, 'shared API account identity untrusted');
  requireValue(account.available_usd_micros === balance.availableUsdMicros && account.available_credits === balance.availableCredits && account.observed_at === new Date(balance.issuedAtMs).toISOString() && account.expires_at === new Date(balance.expiresAtMs).toISOString(), 'shared account differs from signed current API snapshot');
  requireValue(typeof account.frozen === 'boolean' && (allowFrozen || !account.frozen), 'shared account quarantined or freeze state malformed');
  requireValue(Array.isArray(account.reservations), 'shared consumer reservations missing');
  const ids = new Set();
  let usd = 0; let credits = 0; let active = 0;
  for (const reservation of account.reservations) {
    requireValue(typeof reservation.job_id === 'string' && reservation.job_id.trim() && !ids.has(reservation.job_id), 'duplicate or malformed shared reservation');
    ids.add(reservation.job_id);
    requireValue(reservation.settled === undefined || typeof reservation.settled === 'boolean', 'malformed shared settlement state');
    usd = integer(usd + integer(reservation.usd_micros, 'shared reserved USD'), 'shared USD total');
    credits = integer(credits + integer(reservation.credits, 'shared reserved credits'), 'shared credit total');
    if (reservation.settled !== true) active++;
  }
  return { usd, credits, active };
}

function ownReservation(account, jobId, grant) {
  const own = account.reservations.find((row) => row.job_id === jobId);
  requireValue(own && own.settled !== true && own.usd_micros === grant.maxUsdMicros && own.credits === grant.maxCredits, 'shared protected reservation changed or disappeared');
  return own;
}

function validateBinding(payload, request, grantId) {
  requireValue(payload.grantId === grantId, 'approval identifier mismatch');
  requireValue(payload.projectId === request.projectId && payload.provider === request.provider, 'approval project/provider mismatch');
  requireValue(payload.requestDigest === digest(request) && payload.executorDigest === request.executorDigest, 'approval does not bind actual executor/input/model/limits');
  identifier(payload.accountId, 'account id');
  integer(payload.maxUsdMicros, 'USD cap');
  integer(payload.maxCredits, 'credit cap');
  requireValue(payload.maxUsdMicros > 0 || payload.maxCredits > 0, 'unknown/zero paid cap');
  integer(payload.maxCreateCalls, 'create limit', 1, 2);
  requireValue(payload.maxCreateCalls === request.maxCreateCalls, 'operation limit mismatch');
  integer(payload.maxRuntimeMs, 'runtime', 1000, MAX_RUNTIME_MS);
  requireValue(payload.maxRuntimeMs <= request.maxRuntimeMs, 'runtime exceeds input limit');
  requireValue(payload.priceMode === 'FIXED_PRICE_CAPPED' && typeof payload.priceReceipt === 'string' && payload.priceReceipt.trim(), 'fixed provider charge ceiling not established');
  requireValue(payload.rightsReviewed === true && payload.reuseDecision === 'MISSING_COMPONENT', 'rights/reuse authority not admitted');
  requireValue(typeof payload.approver === 'string' && payload.approver.trim(), 'approver attribution missing');
  for (const name of ['rightsReceipt', 'reuseReceipt', 'acceptanceReceipt', 'ownerLane', 'consumer']) requireValue(typeof payload[name] === 'string' && payload[name].trim(), `missing ${name}`);
  requireValue(Array.isArray(payload.expectedOutputs) && payload.expectedOutputs.includes('candidate.glb') && payload.expectedOutputs.includes('provenance.json'), 'expected artifact/provenance contract missing');
  requireValue(Array.isArray(payload.artifactHosts) && payload.artifactHosts.length > 0 && payload.artifactHosts.length <= 10 && payload.artifactHosts.every((host) => typeof host === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(host)), 'exact provider artifact-host admission missing');
}

function validateAccount(balance, grant, request) {
  requireValue(balance.accountId === grant.accountId && balance.provider === request.provider && balance.projectId === request.projectId, 'API account mismatch');
  requireValue(balance.balanceType === 'API' && typeof balance.providerReceipt === 'string' && balance.providerReceipt.trim(), 'actual API balance receipt missing');
  integer(balance.availableUsdMicros, 'available USD');
  integer(balance.availableCredits, 'available credits');
  integer(balance.maxConcurrency, 'concurrency', 1, 20);
  requireValue(grant.balanceDigest === digest(balance), 'approval uses a different balance/pricing snapshot');
  requireValue(/^[0-9a-f]{64}$/.test(balance.credentialFingerprint ?? '') && balance.credentialFingerprint === request.credentialFingerprint, 'provider credential not attested to approved API account');
}

function validateControls(controls, grant, request) {
  requireValue(controls.accountId === grant.accountId && controls.provider === request.provider && controls.projectId === request.projectId, 'provider control account mismatch');
  requireValue(controls.requestDigest === digest(request) && controls.executorDigest === request.executorDigest && controls.sourceSha === request.sourceAuthority.sha && grant.controlsDigest === digest(controls), 'provider controls do not bind actual request/build');
  requireValue(controls.hardStopSupported === true && controls.costCapEnforced === true && controls.autoTopUp === false, 'remote hard stop/cost controls unproven');
  integer(controls.maxUsdMicros, 'remote USD cap'); integer(controls.maxCredits, 'remote credit cap');
  integer(controls.maxRuntimeMs, 'remote runtime', 1000, MAX_RUNTIME_MS);
  requireValue(controls.maxUsdMicros === grant.maxUsdMicros && controls.maxCredits === grant.maxCredits && controls.maxRuntimeMs <= grant.maxRuntimeMs, 'remote caps exceed or differ from approval');
  requireValue(typeof controls.providerProofReceipt === 'string' && controls.providerProofReceipt.trim(), 'tested provider/proxy enforcement proof missing');
}

function validateLedger(ledger, balance, allowFrozen = false) {
  requireValue(ledger && Object.getPrototypeOf(ledger) === Object.prototype, 'malformed shared ledger');
  requireValue(ledger.balanceDigest === digest(balance), 'balance rollover requires protected reconciliation');
  for (const name of ['reservedUsdMicros', 'reservedCredits', 'spentUsdMicros', 'spentCredits', 'activeJobs']) integer(ledger[name], `ledger ${name}`);
  requireValue(typeof ledger.frozen === 'boolean' && (allowFrozen || ledger.frozen === false), 'account quarantined or freeze state malformed');
}

export function classifyRequest(provider, url, method = 'GET') {
  const parsed = new URL(url);
  requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && !parsed.hash, 'provider URL not pinned HTTPS');
  const allowed = {
    meshy: ['api.meshy.ai', /^\/openapi\/v[12]\/(?:text-to-3d|image-to-3d|multi-image-to-3d)(?:\/[a-zA-Z0-9_-]+)?$/],
    tripo: ['api.tripo3d.ai', /^\/v2\/openapi\/task(?:\/[a-zA-Z0-9_-]+)?$/],
    rodin: ['api.hyper3d.com', /^\/api\/v2\/(?:rodin|status|download)$/],
    replicate: ['api.replicate.com', /^\/v1\/(?:models\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/predictions|predictions(?:\/[a-zA-Z0-9_-]+)?)$/],
  }[provider];
  // The existing Rodin adapter uses api.hyper3d.com. No endpoint is guessed here.
  requireValue(allowed && parsed.hostname === allowed[0] && allowed[1].test(parsed.pathname) && !parsed.search, 'unapproved provider endpoint');
  requireValue(method === 'GET' || method === 'POST', 'unsupported provider method');
  if (provider === 'rodin') return method === 'POST' && parsed.pathname.endsWith('/rodin') ? 'CREATE' : 'READ';
  if (method === 'GET') return 'READ';
  requireValue(!/\/predictions\/[^/]+$/.test(parsed.pathname) && !/\/task\/[^/]+$/.test(parsed.pathname), 'POST to task resource denied');
  return 'CREATE';
}

function taskIdentity(provider, payload) {
  const value = provider === 'meshy' ? payload.result : provider === 'tripo' ? payload.data?.task_id : provider === 'rodin' ? payload.uuid : payload.id;
  requireValue(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value), 'creation response lacks an exact task id; reservation remains held');
  return value;
}

function nowOrBlock(now, deadline) {
  const value = now();
  requireValue(value < deadline, 'hard execution deadline reached');
  return value;
}

async function boundedPayload(response, signal) {
  requireValue(response.body, 'provider response lacks body');
  const reader = response.body.getReader();
  let length = 0;
  const chunks = [];
  try {
    for (;;) {
      if (signal.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      requireValue(length <= MAX_JSON_BYTES, 'provider JSON byte limit reached');
      chunks.push(value);
    }
    requireValue(response.ok, `provider HTTP ${response.status}; charged create is never retried`);
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requireValue(value && typeof value === 'object' && !Array.isArray(value), 'provider JSON must be an object');
    return value;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Actual Firestore transaction + dispatch boundary; dependencies are injectable only for software tests. */
export async function acquireProtectedExecution({ db, request, grantId, issuerKeys, now = Date.now, fetchImpl = globalThis.fetch, reconciliationOnly = false }) {
  request = snapshotPlain(request);
  requireValue(Buffer.byteLength(canonical(request)) <= 512 * 1024, 'exact request exceeds protected storage envelope');
  requireValue(db && typeof db.runTransaction === 'function', 'durable Firestore ledger unavailable');
  identifier(grantId, 'approval id');
  requireValue(request && /^[0-9a-f]{64}$/.test(request.executorDigest), 'actual source digest missing');
  requireValue(typeof request.projectId === 'string' && request.projectId && request.projectId !== 'urai-4dc1d', 'dedicated protected project required');
  requireValue(request.maxAttempts === 1, 'automatic paid retries are disabled');
  requireValue(request.sourceAuthority?.repository === 'LifeLoggerAI/asset-factory' && /^[0-9a-f]{40}$/.test(request.sourceAuthority?.sha ?? ''), 'exact source SHA authority missing');
  requireValue(/^[0-9a-f]{64}$/.test(request.inputDigest ?? '') && typeof request.model === 'string' && request.model.trim(), 'input/model identity missing');
  integer(request.maxRuntimeMs, 'request runtime', 1000, MAX_RUNTIME_MS);
  validateWirePlan(request);
  const semanticInputDigest = wireInputDigest(request.wirePlan);
  requireValue(request.inputDigest === semanticInputDigest, 'input digest must bind normalized actual provider wire inputs');
  const requestDigest = digest(request);
  // This claim survives new grants, workers, releases and asset-label changes.
  // Intentional repeats are not admitted by this bounded pilot.
  const claimId = digest({ projectId: request.projectId, provider: request.provider, inputDigest: semanticInputDigest, model: request.model });
  const sharedJobId = `model-forge-${claimId}`;
  const claimRef = doc(db, COLLECTIONS.claims, claimId);
  const grantRef = doc(db, COLLECTIONS.approvals, grantId);
  let leaseId = crypto.randomUUID();
  const acquired = await db.runTransaction(async (tx) => {
    const timestamp = now();
    const oldClaim = data(await tx.get(claimRef));
    if (reconciliationOnly) {
      requireValue(oldClaim && ['SUBMITTED', 'UNRECONCILED', 'RESERVED'].includes(oldClaim.state), 'no unsettled protected claim');
      requireValue(oldClaim.deadlineMs <= timestamp, 'live execution must settle through its existing context');
      requireValue(oldClaim.grantId === grantId && oldClaim.requestDigest === requestDigest, 'recovery request differs from actual dispatch');
    }
    const approvalRecord = reconciliationOnly ? oldClaim.approvalRecord : data(await tx.get(grantRef));
    const approvedAt = reconciliationOnly ? integer(oldClaim.reservedAtMs, 'recorded reservation time') : timestamp;
    const grant = authenticated(approvalRecord, issuerKeys, 'BOUNDED_MODEL_FORGE_SPEND', approvedAt);
    validateBinding(grant, request, grantId);
    const accountId = canonicalAccountId(request.provider, grant.accountId);
    const accountRef = doc(db, COLLECTIONS.accounts, accountId);
    const balanceRef = doc(db, COLLECTIONS.balances, accountId);
    const controlsRef = doc(db, COLLECTIONS.controls, requestDigest);
    const ledgerRef = doc(db, COLLECTIONS.ledgers, accountId);
    const [accountSnap, balanceSnap, controlsSnap, ledgerSnap, claimSnap] = await Promise.all([tx.get(accountRef), tx.get(balanceRef), tx.get(controlsRef), tx.get(ledgerRef), tx.get(claimRef)]);
    const balanceRecord = reconciliationOnly ? oldClaim.balanceRecord : data(balanceSnap);
    const balance = authenticated(balanceRecord, issuerKeys, 'API_BALANCE', approvedAt);
    validateAccount(balance, grant, request);
    const controlsRecord = reconciliationOnly ? oldClaim.controlsRecord : data(controlsSnap);
    const controls = authenticated(controlsRecord, issuerKeys, 'PROVIDER_CONTROLS', approvedAt);
    validateControls(controls, grant, request);
    if (reconciliationOnly) {
      requireValue(data(ledgerSnap)?.balanceDigest === grant.balanceDigest, 'recovery ledger balance differs from original reservation');
      leaseId = oldClaim.leaseId;
      return { grant, balance, controls, deadlineMs: oldClaim.deadlineMs, ledgerRef, accountRef, controlsRef };
    }
    requireValue(!data(claimSnap), 'same input/provider/model already claimed; reconcile or reuse existing attempt');
    const account = data(accountSnap);
    const totals = sharedAccount(account, balance);
    requireValue(!account.reservations.some((row) => row.job_id === sharedJobId), 'shared generation claim already held');
    requireValue(integer(totals.usd + grant.maxUsdMicros, 'new shared USD') <= balance.availableUsdMicros && integer(totals.credits + grant.maxCredits, 'new shared credits') <= balance.availableCredits, 'shared available budget exhausted');
    requireValue(totals.active < balance.maxConcurrency, 'shared account concurrency exhausted');
    const ledger = data(ledgerSnap) ?? { balanceDigest: digest(balance), reservedUsdMicros: 0, reservedCredits: 0, spentUsdMicros: 0, spentCredits: 0, activeJobs: 0, frozen: false };
    validateLedger(ledger, balance);
    const reservedUsdMicros = integer(ledger.reservedUsdMicros + grant.maxUsdMicros, 'combined USD reservation');
    const reservedCredits = integer(ledger.reservedCredits + grant.maxCredits, 'combined credit reservation');
    requireValue(reservedUsdMicros + ledger.spentUsdMicros <= balance.availableUsdMicros && reservedCredits + ledger.spentCredits <= balance.availableCredits, 'shared available budget exhausted');
    requireValue(ledger.activeJobs < balance.maxConcurrency, 'account concurrency exhausted');
    const deadlineMs = Math.min(timestamp + grant.maxRuntimeMs, timestamp + controls.maxRuntimeMs, grant.expiresAtMs, balance.expiresAtMs, controls.expiresAtMs);
    tx.set(ledgerRef, { ...ledger, reservedUsdMicros, reservedCredits, activeJobs: ledger.activeJobs + 1 });
    tx.set(accountRef, { ...account, reservations: [...account.reservations, { job_id: sharedJobId, usd_micros: grant.maxUsdMicros, credits: grant.maxCredits }] });
    tx.set(claimRef, { schemaVersion: 1, claimId, grantId, requestDigest, requestDescriptor: request, approvalRecord, balanceRecord, controlsRecord, executorDigest: request.executorDigest, accountId: grant.accountId, projectId: request.projectId, provider: request.provider, leaseId, state: 'RESERVED', reservedAtMs: timestamp, deadlineMs, maxUsdMicros: grant.maxUsdMicros, maxCredits: grant.maxCredits, maxCreateCalls: grant.maxCreateCalls, operations: [] });
    return { grant, balance, controls, deadlineMs, ledgerRef, accountRef, controlsRef };
  });
  const { grant, balance, controls, deadlineMs, ledgerRef, accountRef, controlsRef } = acquired;
  const controller = new AbortController();
  const timeout = reconciliationOnly ? null : setTimeout(() => controller.abort(new Error('Protected spend hard deadline reached')), Math.max(1, deadlineMs - now()));
  timeout?.unref?.();
  let stopped = false;

  async function transactionClaim(tx) {
    const item = data(await tx.get(claimRef));
    requireValue(item && item.leaseId === leaseId && item.requestDigest === requestDigest, 'stale or changed attempt lease');
    requireValue(Array.isArray(item.operations) && item.operations.length <= grant.maxCreateCalls, 'malformed dispatched operation ledger');
    return item;
  }

  async function requestJson(url, init = {}) {
    requireValue(!reconciliationOnly, 'read-only charge recovery cannot dispatch provider requests');
    requireValue(!stopped && !controller.signal.aborted, 'execution stopped');
    requireValue(typeof url === 'string', 'provider URL must be a fixed string');
    const frozen = await snapshotInit(init);
    requireValue([...frozen.init.headers.keys()].every((key) => ['authorization', 'content-type', 'accept', 'prefer'].includes(key)), 'unapproved provider header');
    const authorization = frozen.init.headers.get('authorization');
    const token = typeof authorization === 'string' ? /^Bearer ([^\s]+)$/.exec(authorization)?.[1] : null;
    requireValue(token && sha256(Buffer.from(token)) === request.credentialFingerprint, 'actual provider credential differs from approved API account');
    const kind = classifyRequest(request.provider, url, frozen.init.method);
    let operationId = null;
    if (kind === 'CREATE') {
      operationId = await db.runTransaction(async (tx) => {
        const timestamp = nowOrBlock(now, deadlineMs);
        const [grantSnap, accountSnap, balanceSnap, controlSnap, ledgerSnap] = await Promise.all([tx.get(grantRef), tx.get(accountRef), tx.get(doc(db, COLLECTIONS.balances, canonicalAccountId(request.provider, grant.accountId))), tx.get(controlsRef), tx.get(ledgerRef)]);
        const currentGrant = authenticated(data(grantSnap), issuerKeys, 'BOUNDED_MODEL_FORGE_SPEND', timestamp);
        validateBinding(currentGrant, request, grantId);
        requireValue(digest(currentGrant) === digest(grant), 'spend approval changed after reservation');
        const balance = authenticated(data(balanceSnap), issuerKeys, 'API_BALANCE', timestamp);
        validateAccount(balance, currentGrant, request);
        const currentControls = authenticated(data(controlSnap), issuerKeys, 'PROVIDER_CONTROLS', timestamp);
        validateControls(currentControls, currentGrant, request);
        requireValue(digest(currentControls) === digest(controls), 'provider controls changed after reservation');
        const shared = data(accountSnap);
        const sharedTotals = sharedAccount(shared, balance);
        ownReservation(shared, sharedJobId, grant);
        requireValue(sharedTotals.usd <= balance.availableUsdMicros && sharedTotals.credits <= balance.availableCredits && sharedTotals.active <= balance.maxConcurrency, 'shared account exposure changed before dispatch');
        validateLedger(data(ledgerSnap), balance);
        const item = await transactionClaim(tx);
        requireValue(['RESERVED', 'SUBMITTED'].includes(item.state), 'attempt cannot dispatch');
        requireValue(item.operations.length < grant.maxCreateCalls, 'bounded create attempts exhausted');
        requireValue(item.operations.every((op) => op.taskId), 'unacknowledged create blocks all further dispatch');
        const plan = request.wirePlan[item.operations.length];
        requireValue(url === plan.url && frozen.init.method === 'POST', 'actual create endpoint differs from approved wire plan');
        let expectedBody = snapshotPlain(plan.body);
        if (plan.taskBinding) expectedBody[plan.taskBinding.field] = item.operations[plan.taskBinding.operationIndex].taskId;
        requireValue(plan.bodyType === 'JSON' ? frozen.wireBody === JSON.stringify(expectedBody) : digest(frozen.wireBody) === digest(expectedBody), 'actual create body differs from approved exact wire contract');
        const id = `${claimId}:${item.operations.length + 1}`;
        tx.set(claimRef, { ...item, state: 'SUBMITTED', operations: [...item.operations, { operationId: id, state: 'DISPATCHING', submittedAtMs: timestamp, wireDigest: digest({ url, method: 'POST', body: frozen.wireBody }) }] });
        return id;
      });
    }
    nowOrBlock(now, deadlineMs);
    // A create gets one HTTP attempt. Ambiguous failures retain the full reservation.
    const response = await fetchImpl(url, { ...frozen.init, signal: controller.signal, redirect: 'error' });
    const payload = await boundedPayload(response, controller.signal);
    nowOrBlock(now, deadlineMs);
    if (operationId) {
      const taskId = taskIdentity(request.provider, payload);
      await db.runTransaction(async (tx) => {
        const item = await transactionClaim(tx);
        requireValue(item.state === 'SUBMITTED', 'stale creation completion');
        requireValue(!item.operations.some((op) => op.taskId === taskId), 'provider returned duplicate task identity');
        tx.set(claimRef, { ...item, operations: item.operations.map((op) => op.operationId === operationId ? { ...op, state: 'ACKNOWLEDGED', taskId } : op) });
      });
    }
    return { payload, response };
  }

  async function sleep(ms) {
    requireValue(!reconciliationOnly, 'read-only charge recovery cannot poll');
    const delay = Math.min(integer(ms, 'poll delay', 0, 30_000), deadlineMs - nowOrBlock(now, deadlineMs));
    await new Promise((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(controller.signal.reason); };
      const timer = setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve(); }, delay);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    nowOrBlock(now, deadlineMs);
  }

  async function reconcile(outcome) {
    requireValue(outcome && ['SUCCEEDED', 'FAILED'].includes(outcome.status), 'explicit terminal provider outcome required');
    const result = await db.runTransaction(async (tx) => {
      const item = await transactionClaim(tx);
      requireValue(['RESERVED', 'SUBMITTED', 'UNRECONCILED'].includes(item.state), 'no unclosed paid attempt');
      const account = data(await tx.get(accountRef));
      sharedAccount(account, balance, true);
      ownReservation(account, sharedJobId, grant);
      if (!item.operations.length) {
        requireValue(reconciliationOnly && item.deadlineMs <= now() && outcome.status === 'FAILED' && outcome.taskId === null, 'unsubmitted reservation may release only through expired read-only recovery');
        const untouched = data(await tx.get(ledgerRef));
        validateLedger(untouched, balance, true);
        requireValue(untouched && untouched.balanceDigest === grant.balanceDigest && untouched.reservedUsdMicros >= grant.maxUsdMicros && untouched.reservedCredits >= grant.maxCredits && untouched.activeJobs >= 1, 'unsubmitted reservation accounting inconsistent');
        tx.set(ledgerRef, { ...untouched, reservedUsdMicros: untouched.reservedUsdMicros - grant.maxUsdMicros, reservedCredits: untouched.reservedCredits - grant.maxCredits, activeJobs: untouched.activeJobs - 1 });
        tx.set(accountRef, { ...account, reservations: account.reservations.map((row) => row.job_id === sharedJobId ? { job_id: sharedJobId, usd_micros: 0, credits: 0, settled: true } : row) });
        tx.set(claimRef, { ...item, state: 'FAILED', providerCallsExecuted: 0, actualUsdMicros: 0, actualCredits: 0, chargeReconciled: true, reservationReleased: true, reconciledAtMs: now(), reason: 'EXPIRED_WITHOUT_DISPATCH' });
        return { state: 'FAILED', providerCallsExecuted: 0, actualUsdMicros: 0, actualCredits: 0, chargeReconciled: true, reservationReleased: true };
      }
      requireValue(item.operations.length && item.operations.every((op) => op.taskId), 'unknown dispatched task requires provider investigation; reservation held');
      const terminal = item.operations.at(-1).taskId;
      requireValue(outcome.taskId === terminal, 'terminal task does not match actual dispatch');
      const ledger = data(await tx.get(ledgerRef));
      validateLedger(ledger, balance, true);
      requireValue(ledger && ledger.balanceDigest === grant.balanceDigest, 'ledger changed; reservation held');
      const receipts = [];
      const usedRefs = [];
      for (const operation of item.operations) {
        const id = receiptId(grant.accountId, request.provider, operation.taskId);
        const ref = doc(db, COLLECTIONS.receipts, id);
        const consumedRef = doc(db, COLLECTIONS.consumed, id);
        const [receiptSnap, usedSnap] = await Promise.all([tx.get(ref), tx.get(consumedRef)]);
        requireValue(!data(usedSnap), 'provider receipt already consumed');
        const receipt = authenticated(data(receiptSnap), issuerKeys, 'PROVIDER_CHARGE', now());
        requireValue(receipt.accountId === grant.accountId && receipt.projectId === request.projectId && receipt.provider === request.provider && receipt.grantId === grantId && receipt.requestDigest === requestDigest && receipt.taskId === operation.taskId, 'provider charge receipt identity mismatch');
        requireValue(receipt.billedFinal === true && ['SUCCEEDED', 'FAILED', 'CANCELED'].includes(receipt.status), 'charge not final/terminal');
        requireValue(typeof receipt.providerReceipt === 'string' && receipt.providerReceipt.trim(), 'provider charge evidence missing');
        integer(receipt.actualUsdMicros, 'actual USD');
        integer(receipt.actualCredits, 'actual credits');
        receipts.push(receipt);
        usedRefs.push(consumedRef);
      }
      const lastStatus = receipts.at(-1).status;
      requireValue(outcome.status === 'SUCCEEDED' ? lastStatus === 'SUCCEEDED' : ['FAILED', 'CANCELED'].includes(lastStatus), 'terminal outcome disagrees with provider receipt');
      const actualUsdMicros = integer(receipts.reduce((n, r) => n + r.actualUsdMicros, 0), 'reconciled USD');
      const actualCredits = integer(receipts.reduce((n, r) => n + r.actualCredits, 0), 'reconciled credits');
      if (actualUsdMicros > grant.maxUsdMicros || actualCredits > grant.maxCredits) {
        tx.set(ledgerRef, { ...ledger, frozen: true });
        tx.set(accountRef, { ...account, frozen: true, reservations: account.reservations.map((row) => row.job_id === sharedJobId ? { job_id: sharedJobId, usd_micros: Math.max(grant.maxUsdMicros, actualUsdMicros), credits: Math.max(grant.maxCredits, actualCredits) } : row) });
        tx.set(claimRef, { ...item, state: 'QUARANTINED', reason: 'ACTUAL_CHARGE_EXCEEDS_APPROVAL', observedActualUsdMicros: actualUsdMicros, observedActualCredits: actualCredits, receipts });
        return { state: 'QUARANTINED', chargeReconciled: false, reservationReleased: false };
      }
      requireValue(ledger.reservedUsdMicros >= grant.maxUsdMicros && ledger.reservedCredits >= grant.maxCredits && ledger.activeJobs >= 1, 'reservation accounting inconsistent');
      const updated = { ...ledger, reservedUsdMicros: ledger.reservedUsdMicros - grant.maxUsdMicros, reservedCredits: ledger.reservedCredits - grant.maxCredits, spentUsdMicros: integer(ledger.spentUsdMicros + actualUsdMicros, 'spent USD'), spentCredits: integer(ledger.spentCredits + actualCredits, 'spent credits'), activeJobs: ledger.activeJobs - 1 };
      tx.set(ledgerRef, updated);
      // #436's shared account contract retains actual debit holds until an
      // explicitly governed snapshot rollover, preventing stale-balance reuse.
      tx.set(accountRef, { ...account, reservations: account.reservations.map((row) => row.job_id === sharedJobId ? { job_id: sharedJobId, usd_micros: actualUsdMicros, credits: actualCredits, settled: true } : row) });
      tx.set(claimRef, { ...item, state: outcome.status, actualUsdMicros, actualCredits, chargeReconciled: true, reservationReleased: true, receipts, ...(outcome.artifact ? { artifact: outcome.artifact } : {}), reconciledAtMs: now() });
      usedRefs.forEach((ref) => tx.set(ref, { claimId, grantId, requestDigest }));
      return { state: outcome.status, actualUsdMicros, actualCredits, chargeReconciled: true, reservationReleased: true };
    });
    return result;
  }

  async function stop(reason = 'execution ended without reconciled provider charge') {
    stopped = true;
    clearTimeout(timeout);
    controller.abort(new Error(reason));
    return db.runTransaction(async (tx) => {
      const item = await transactionClaim(tx);
      if (['SUCCEEDED', 'FAILED', 'QUARANTINED'].includes(item.state)) return item.state;
      // Timeouts, process restarts, and failed creates never recycle ambiguous reservations.
      tx.set(claimRef, { ...item, state: 'UNRECONCILED', reason, stoppedAtMs: now() });
      return 'UNRECONCILED';
    });
  }

  function assertArtifactUrl(value) {
    const parsed = new URL(value);
    requireValue(!reconciliationOnly && !stopped && !controller.signal.aborted && now() < deadlineMs, 'artifact download outside active deadline');
    requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port && grant.artifactHosts.includes(parsed.hostname), 'artifact host is not admitted by signed provider authority');
  }
  return { claimId, grantId, requestDigest, projectId: request.projectId, deadlineMs, signal: controller.signal, requestJson, sleep, reconcile, stop, assertArtifactUrl };
}

export async function recoverProtectedExecution({ db, claimId, issuerKeys, now = Date.now }) {
  requireValue(/^[0-9a-f]{64}$/.test(claimId ?? ''), 'invalid protected claim hash');
  const item = await db.runTransaction(async (tx) => data(await tx.get(doc(db, COLLECTIONS.claims, claimId))));
  requireValue(item?.requestDescriptor && item.claimId === claimId, 'stored exact request descriptor missing');
  return acquireProtectedExecution({ db, request: item.requestDescriptor, grantId: item.grantId, issuerKeys, now, reconciliationOnly: true, fetchImpl: async () => { throw new Error('read-only recovery cannot contact provider'); } });
}

async function protectedConfiguration(environment) {
  const projectId = environment.URAI_MODEL_FORGE_PROJECT_ID;
  requireValue(typeof projectId === 'string' && projectId && projectId !== 'urai-4dc1d', 'dedicated Firestore project missing');
  let issuerKeys;
  try { issuerKeys = JSON.parse(environment.URAI_MODEL_FORGE_ISSUER_PUBLIC_KEYS || ''); } catch { throw new Error('Protected spend blocked: deployment issuer trust configuration missing'); }
  requireValue(issuerKeys && typeof issuerKeys === 'object' && !Array.isArray(issuerKeys) && Object.keys(issuerKeys).length > 0, 'deployment issuer configuration invalid');
  const { initializeApp, getApps, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const name = 'urai-protected-model-forge';
  const app = getApps().find((entry) => entry.name === name) ?? initializeApp({ credential: applicationDefault(), projectId }, name);
  requireValue(app.options.projectId === projectId, 'existing Admin app project mismatch');
  return { db: getFirestore(app), issuerKeys, projectId };
}

export async function loadProtectedRecovery(claimId, environment = process.env) {
  requireValue(environment.URAI_MODEL_FORGE_RECONCILIATION_ENABLED === '1', 'protected read-only reconciliation disabled');
  const configuration = await protectedConfiguration(environment);
  const recovered = await recoverProtectedExecution({ ...configuration, claimId });
  requireValue(recovered.projectId === configuration.projectId, 'stored recovery belongs to a different deployment project');
  return recovered;
}

export async function loadProtectedExecution(request, environment = process.env) {
  requireValue(environment.URAI_MODEL_FORGE_SPEND_AUTHORIZED === '1' && environment.URAI_MODEL_FORGE_PROTECTED_EXECUTION_ENABLED === '1', 'protected deployment execution remains disabled');
  const grantId = identifier(environment.URAI_MODEL_FORGE_APPROVAL_ID, 'approval id');
  const projectId = environment.URAI_MODEL_FORGE_PROJECT_ID;
  requireValue(projectId === request.projectId && projectId !== 'urai-4dc1d', 'dedicated Firestore project mismatch');
  requireValue(request.executorDigest === executorDigest(), 'loaded executor bytes changed');
  const configuration = await protectedConfiguration(environment);
  return acquireProtectedExecution({ ...configuration, request, grantId });
}
