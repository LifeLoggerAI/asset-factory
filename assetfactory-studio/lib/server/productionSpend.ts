/** Internal image-executor admission; an offline receipt never grants execution. */
import { createHash, createPublicKey, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';

type RecordValue = Record<string, unknown>;
type Ref = { path: string };
type Tx = { get(ref: Ref): Promise<{ exists: boolean; data(): unknown }>; set(ref: Ref, value: RecordValue): void };
export type SpendDb = { doc(path: string): Ref; runTransaction<T>(f: (tx: Tx) => Promise<T>): Promise<T> };
export type SpendKeys = Record<string, { subject: string; publicKey: string }>;
export type SpendWorker = {
  id: string; executor_repository: string; executor_source_sha: string; consumer: string;
  tenant_sha256: string; provider: string; account_id: string; credential_sha256: string;
};
type SpendBudget = RecordValue & { max_usd_micros: number; max_credits: number; max_retries: number; max_runtime_seconds: number; rates: RecordValue };
type SpendJob = RecordValue & { job_id: string; provider: string; account_id: string; authority: RecordValue; reuse_review: RecordValue; acceptance: RecordValue; budget: SpendBudget; executor: RecordValue; attempts: RecordValue[] };
type SpendAccount = RecordValue & { reservations: RecordValue[]; max_concurrency: number; frozen: boolean };
export class SpendRejected extends Error { code = 'spend_admission_rejected'; }
function need(test: unknown, reason: string): asserts test { if (!test) throw new SpendRejected(reason); }
function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';
}
export function spendRecord(value: unknown, name: string): RecordValue { need(isRecord(value), `invalid ${name}`); return value; }
function recordList(value: unknown, name: string): RecordValue[] {
  need(Array.isArray(value) && value.every(isRecord), `invalid ${name}`); return value;
}
function integer(value: unknown, name: string, min = 0): number {
  need(typeof value === 'number' && Number.isSafeInteger(value) && value >= min, `invalid ${name}`); return value;
}
function nonempty(value: unknown, name: string): string { need(typeof value === 'string' && value.trim(), `missing ${name}`); return value; }
function spendJob(value: unknown): SpendJob {
  const job = spendRecord(value, 'job'), budget = spendRecord(job.budget, 'budget');
  return {
    ...job, job_id: nonempty(job.job_id, 'job id'), provider: nonempty(job.provider, 'provider'), account_id: nonempty(job.account_id, 'account id'),
    authority: spendRecord(job.authority, 'job authority'), reuse_review: spendRecord(job.reuse_review, 'reuse review'),
    acceptance: spendRecord(job.acceptance, 'acceptance'), executor: spendRecord(job.executor, 'executor'), attempts: recordList(job.attempts, 'attempts'),
    budget: { ...budget, max_usd_micros: integer(budget.max_usd_micros, 'USD cap', 1), max_credits: integer(budget.max_credits, 'credit cap'), max_retries: integer(budget.max_retries, 'retries'), max_runtime_seconds: integer(budget.max_runtime_seconds, 'runtime', 1), rates: spendRecord(budget.rates, 'rates') },
  };
}
/** One protected provider/account policy is shared by every consumer lane. */
function spendAccount(value: unknown): SpendAccount {
  const account = spendRecord(value, 'account'), reservations = recordList(account.reservations, 'reservations');
  const maxConcurrency = integer(account.max_concurrency, 'account concurrency cap', 1);
  need(maxConcurrency <= 20, 'account concurrency exceeds executor bound');
  need(typeof account.frozen === 'boolean', 'invalid account frozen state');
  integer(account.available_usd_micros, 'USD balance'); integer(account.available_credits, 'credit balance');
  const ids = new Set<string>(); let usd = 0, credits = 0;
  for (const reservation of reservations) {
    need(Object.keys(reservation).every(key => ['job_id', 'usd_micros', 'credits', 'settled'].includes(key)), 'unknown reservation state');
    const id = nonempty(reservation.job_id, 'reserved job'); need(!ids.has(id), 'duplicate reservation'); ids.add(id);
    need(reservation.settled === undefined || typeof reservation.settled === 'boolean', 'invalid reservation settlement state');
    usd = integer(usd + integer(reservation.usd_micros, 'reserved USD'), 'total USD');
    credits = integer(credits + integer(reservation.credits, 'reserved credits'), 'total credits');
  }
  // Validate the envelope before reserve, readback or independent reconciliation.
  // A corrupt row must never be coerced into released funds or concurrency.
  return { ...account, reservations, max_concurrency: maxConcurrency, frozen: account.frozen };
}
function sha(value: unknown, length = 64): string { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value), 'invalid digest'); return value; }
function date(value: unknown): number {
  need(typeof value === 'string', 'timestamp requires timezone');
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
  need(parts, 'timestamp requires complete ISO time and timezone');
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  need(calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && hour < 24 && minute < 60 && second < 60, 'invalid calendar timestamp');
  const result = Date.parse(value); need(Number.isFinite(result), 'invalid timestamp'); return result;
}
function fresh(record: RecordValue, observed: string, expires: string, now: number) {
  need(date(record[observed]) <= now && now < date(record[expires]), 'stale or future trusted record');
}
/** Python ensure_ascii=True, sorted keys. Fractional values and ambiguous keys fail closed. */
export function canonical(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') { integer(Math.abs(value), 'canonical integer'); return String(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = spendRecord(value, 'canonical value');
  const keys = Object.keys(record).sort();
  need(keys.every(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)), 'ambiguous canonical key');
  return `{${keys.map(k => `${canonical(k)}:${canonical(record[k])}`).join(',')}}`;
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

/** Protected server configuration fixes a token's scope; body labels never identify a worker. */
export function authenticateSpendWorker(value: unknown, supplied: string | undefined, legacy: string | undefined, reconciler: string | undefined): SpendWorker | undefined {
  const registry = spendRecord(value, 'worker registry');
  const tokens = new Set<string>(); let authenticated: SpendWorker | undefined;
  for (const [id, entry] of Object.entries(registry)) {
    const record = spendRecord(entry, 'worker registration'), token = nonempty(record.token, 'worker token');
    need(token.length >= 32 && !tokens.has(token) && token !== legacy && token !== reconciler, 'worker tokens must be distinct'); tokens.add(token);
    const worker: SpendWorker = {
      id: nonempty(id, 'worker id'), executor_repository: nonempty(record.executor_repository, 'worker repository'),
      executor_source_sha: sha(record.executor_source_sha, 40), consumer: nonempty(record.consumer, 'worker consumer'),
      tenant_sha256: sha(record.tenant_sha256), provider: nonempty(record.provider, 'worker provider'),
      account_id: nonempty(record.account_id, 'worker account'), credential_sha256: sha(record.credential_sha256),
    };
    if (authenticateSpend(token, supplied)) authenticated = worker;
  }
  return authenticated;
}

type SpendOptions = { now: () => number; approvalKeys: SpendKeys; reconciliationKeys: SpendKeys; sourceSha: string; worker?: SpendWorker; verifierKeys?: SpendKeys };
/** Separate configured signing purposes before storage access, including recovery. */
export function spendSigningPolicy(options: Pick<SpendOptions, 'approvalKeys' | 'reconciliationKeys' | 'verifierKeys'>) {
  const principals = new Map<string, string>(), materials = new Map<string, string>();
  const snapshot = (value: unknown, purpose: string): SpendKeys => {
    const registry = spendRecord(value, 'signing registry'), result: SpendKeys = Object.create(null);
    need(Object.keys(registry).length <= 128, 'signing registry exceeds bound');
    for (const [id, value] of Object.entries(registry)) {
      need(id && id.trim() === id, 'invalid signer id');
      const entry = spendRecord(value, 'signing key');
      need(Object.keys(entry).every(key => ['subject', 'publicKey'].includes(key)), 'unknown signing configuration');
      const subject = nonempty(entry.subject, 'signing subject'), pem = nonempty(entry.publicKey, 'signing public key');
      need(subject.trim() === subject && !/[\u0000-\u001f\u007f]/.test(subject), 'invalid signing subject');
      // Derive identity from actual SPKI bytes, never PEM formatting or registry labels.
      // Reject private material in a public-key registry without exposing its value.
      need(!pem.includes('PRIVATE KEY'), 'public signing key required');
      let publicKey; try { publicKey = createPublicKey(pem); } catch { throw new SpendRejected('invalid signing public key'); }
      need(publicKey.asymmetricKeyType === 'ed25519', 'Ed25519 signing key required');
      const material = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
      const principal = hash(subject.normalize('NFKC').toLowerCase());
      need((!materials.has(material) || materials.get(material) === purpose) && (!principals.has(principal) || principals.get(principal) === purpose), 'signing purposes must be independent');
      materials.set(material, purpose); principals.set(principal, purpose);
      result[id] = Object.freeze({ subject, publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() });
    }
    return Object.freeze(result);
  };
  const approvalKeys = snapshot(options.approvalKeys, 'approval'), reconciliationKeys = snapshot(options.reconciliationKeys, 'reconciliation'), verifierKeys = snapshot(options.verifierKeys === undefined ? {} : options.verifierKeys, 'verification');
  // Retain non-charge roles with each hold. Removing a configured approval or
  // verification key must not later turn that same principal into a charge issuer.
  const chargeExcludedSpki = Object.freeze([...materials].filter(([, purpose]) => purpose !== 'reconciliation').map(([material]) => material).sort());
  const chargeExcludedSubjects = Object.freeze([...principals].filter(([, purpose]) => purpose !== 'reconciliation').map(([principal]) => principal).sort());
  return Object.freeze({ approvalKeys, reconciliationKeys, verifierKeys, chargeExcludedSpki, chargeExcludedSubjects });
}
const GATEWAY_REPOSITORY = 'LifeLoggerAI/asset-factory';
/** A declaration alone cannot identify the gateway build. No Git provenance means closed. */
export function spendGatewaySourceSha(expected: string) {
  sha(expected, 40);
  const paths = ['assetfactory-studio/lib/server/productionSpend.ts', 'assetfactory-studio/app/api/worker/production-spend/route.ts'];
  try {
    const args = { encoding: 'utf8' as const, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] };
    const root = execFileSync('git', ['-C', process.cwd(), 'rev-parse', '--show-toplevel'], args).trim();
    const git = (...command: string[]) => execFileSync('git', ['-C', root, ...command], args).trim();
    need(git('rev-parse', 'HEAD') === expected, 'gateway build differs from declared source');
    const tracked = git('ls-files', '--error-unmatch', '--', ...paths).split('\n');
    need(tracked.length === paths.length && paths.every(path => tracked.includes(path)), 'gateway enforcement source untracked');
    need(!git('status', '--porcelain', '--untracked-files=all', '--', ...paths), 'gateway enforcement source dirty');
  } catch (error) { if (error instanceof SpendRejected) throw error; throw new SpendRejected('verifiable exact gateway build unavailable'); }
  return expected;
}
function crossRepositoryBinding(job: SpendJob, input: RecordValue, options: SpendOptions) {
  const executor = job.executor, worker = options.worker;
  need(executor.binding_version === 2 && worker, 'authenticated scoped worker required');
  const binding: RecordValue = {
    job_id: job.job_id, worker_id: nonempty(executor.worker_id, 'bound worker'),
    executor_repository: nonempty(executor.repository, 'executor repository'), executor_source_sha: sha(executor.source_sha, 40),
    gateway_repository: GATEWAY_REPOSITORY, gateway_source_sha: sha(options.sourceSha, 40),
    consumer: nonempty(job.consumer, 'consumer'), tenant_sha256: sha(executor.tenant_sha256),
    provider: job.provider, account_id: job.account_id, credential_sha256: sha(executor.credential_sha256),
    source_input_sha256: sha(executor.source_input_sha256), semantic_input_sha256: sha(executor.semantic_input_sha256), semantic_headers_sha256: sha(executor.semantic_headers_sha256),
    content_type: nonempty(executor.content_type, 'content type'), request_sha256: sha(executor.request_sha256),
    endpoint: nonempty(executor.endpoint, 'endpoint'), model: nonempty(job.model_version, 'model'),
    asset: nonempty(executor.asset, 'asset'), request_size: nonempty(executor.request_size, 'request size'),
  };
  need(executor.gateway_repository === GATEWAY_REPOSITORY && executor.gateway_source_sha === binding.gateway_source_sha, 'gateway source binding changed');
  need(job.authority.repository === binding.executor_repository && job.authority.sha === binding.executor_source_sha, 'executor authority binding changed');
  need(worker.id === binding.worker_id, 'worker identity changed');
  for (const field of ['executor_repository', 'executor_source_sha', 'consumer', 'tenant_sha256', 'provider', 'account_id', 'credential_sha256'] as const) need(worker[field] === binding[field], `worker ${field} scope changed`);
  const actual: RecordValue = { ...input, executor_repository: input.executor_repository, executor_source_sha: input.executor_source_sha };
  for (const field of Object.keys(binding)) need(actual[field] === binding[field], `actual ${field} differs from bound executor`);
  need(Array.isArray(job.input_sha256) && job.input_sha256.includes(binding.source_input_sha256) && job.input_sha256.includes(binding.request_sha256), 'exact source and request inputs missing');
  return binding;
}

async function verifyCrossRepository(tx: Tx, job: SpendJob, input: RecordValue, options: SpendOptions) {
  const binding = crossRepositoryBinding(job, input, options), executor = job.executor;
  const verifierKeys = options.verifierKeys || {};
  need(Object.keys(verifierKeys).length > 0, 'deployment verifier unavailable');
  const otherKeys = [...Object.values(options.approvalKeys), ...Object.values(options.reconciliationKeys)];
  const publicDigest = (key: string) => { try { return createHash('sha256').update(createPublicKey(key).export({ type: 'spki', format: 'der' })).digest('hex'); } catch { throw new SpendRejected('invalid verifier configuration'); } };
  need(Object.values(verifierKeys).every(key => !otherKeys.some(other => key.subject === other.subject || publicDigest(key.publicKey) === publicDigest(other.publicKey))), 'deployment verifier must be independent');
  const [approvalSnapshot, deploymentSnapshot, controlsSnapshot] = await Promise.all([
    tx.get({ path: `assetFactorySpendApprovals/${sha(job.approval_ref)}` }),
    tx.get({ path: `assetFactorySpendDeployments/${sha(executor.deployment_ref)}` }),
    tx.get({ path: `assetFactorySpendControls/${sha(executor.controls_ref)}` }),
  ]);
  need(approvalSnapshot.exists && deploymentSnapshot.exists && controlsSnapshot.exists, 'protected cross-repository records missing');
  const approval = spendRecord(approvalSnapshot.data(), 'approval');
  signed(approval, options.approvalKeys, 'approver'); need(approval.job_digest === jobDigest(job), 'signed executor binding changed');
  const deployment = spendRecord(deploymentSnapshot.data(), 'deployment proof'), controls = spendRecord(controlsSnapshot.data(), 'controls');
  for (const [record, digest] of [[deployment, executor.deployment_ref], [controls, executor.controls_ref]] as const) {
    signed(record, verifierKeys, 'verifier'); need(hash(canonical(record)) === digest, 'protected proof digest changed');
    fresh(record, 'observed_at', 'expires_at', options.now());
    need(record.trusted_readback === true && record.verified === true && canonical(record.binding) === canonical(binding), 'protected deployment scope changed');
    nonempty(record.proof_receipt, 'deployment proof identity'); nonempty(record.deployment_id, 'deployment identity');
  }
  need(deployment.deployment_id === controls.deployment_id && controls.enforcement_source_sha === binding.gateway_source_sha, 'current deployed enforcement changed');
  return { controls, deployment };
}

function verifyActualRequest(job: SpendJob, account: SpendAccount, controls: RecordValue, input: RecordValue, action: string, now: number) {
  const executor = job.executor;
  // A body digest cannot establish which authenticated provider account receives it.
  const credential = sha(executor.credential_sha256);
  need(account.credential_sha256 === credential && account.credential_binding_verified === true, 'protected account credential mapping missing');
  nonempty(account.credential_binding_receipt, 'credential account readback');
  need(account.provider === job.provider && account.account_id === job.account_id && account.trusted_readback === true, 'protected account identity changed');
  fresh(account, 'observed_at', 'expires_at', now); fresh(controls, 'observed_at', 'expires_at', now);
  need(controls.trusted_readback === true && controls.provider === job.provider && controls.account_id === job.account_id && controls.credential_sha256 === credential, 'provider credential controls changed');
  for (const field of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256']) {
    const value = sha(executor[field]); need(input[field] === value && controls[field] === value, `actual ${field} changed`);
  }
  const contentType = nonempty(executor.content_type, 'content type'); need(input.content_type === contentType && controls.content_type === contentType, 'actual content type changed');
  need(Array.isArray(job.input_sha256) && job.input_sha256.includes(executor.source_input_sha256) && job.input_sha256.includes(executor.request_sha256), 'source and request fixity missing');
  need((action === 'preflight' && input.account_id === undefined) || input.account_id === job.account_id, 'actual account binding changed');
  need(input.request_sha256 === sha(executor.request_sha256) && input.endpoint === executor.endpoint && input.provider === job.provider && input.model === job.model_version && input.asset === executor.asset && input.request_size === executor.request_size, 'actual request differs from approved request');
}

function verifyProtectedPricing(job: SpendJob, price: RecordValue, now: number) {
  need(price.provider === job.provider && price.account_id === job.account_id && price.model_version === job.model_version && price.request_sha256 === job.executor.request_sha256 && price.trusted_readback === true, 'price binding changed');
  for (const field of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'semantic_input_sha256', 'content_type']) need(price[field] === job.executor[field], `protected price ${field} changed`);
  nonempty(price.receipt, 'protected price proof'); fresh(price, 'observed_at', 'expires_at', now);
  need(canonical(price.rates) === canonical(job.budget.rates), 'pricing changed');
  fresh(spendRecord(price.rates, 'price rates'), 'verified_at', 'expires_at', now);
}

/** Internal store eligibility only; this does not grant spend authorization. */
export function isDedicatedSpendProject(project: string | undefined): project is string {
  return !!project && !['urai-4dc1d', 'asset-factory-dev-id', 'geturai-landing-hub'].includes(project);
}

/** Enforces the Labs #229 consistency contract again within the account transaction. */
export function validateSpend(jobValue: unknown, accountValue: unknown, authorityValue: unknown, now: number) {
  const job = spendJob(jobValue), account = spendAccount(accountValue), authority = spendRecord(authorityValue, 'authority');
  need(integer(job.schema_version, 'schema', 1) === 1, 'unsupported schema');
  for (const name of ['job_id', 'provider', 'account_id', 'operation', 'model_version', 'owner_lane', 'consumer']) nonempty(job[name], name);
  need(typeof job.truth_class === 'string' && ['GENERIC', 'INTERPRETIVE', 'SPATIALLY_RECONSTRUCTABLE'].includes(job.truth_class), 'invalid truth class');
  need(job.rights_reviewed === true, 'rights not reviewed');
  need(canonical(job.authority) === canonical(authority.binding), 'authority changed');
  sha(job.authority.sha, 40); nonempty(job.authority.repository, 'repository');
  need(authority.trusted_readback === true, 'untrusted authority'); fresh(authority, 'observed_at', 'expires_at', now);
  const inputs = job.input_sha256; need(Array.isArray(inputs) && inputs.length && new Set(inputs).size === inputs.length, 'invalid inputs'); inputs.forEach((s: unknown) => sha(s));
  const reuse = job.reuse_review;
  need(canonical(reuse.input_sha256) === canonical(inputs) && typeof reuse.decision === 'string' && ['MISSING_COMPONENT', 'REWORK_EXISTING'].includes(reuse.decision), 'reuse not reviewed'); nonempty(reuse.receipt, 'reuse receipt');
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
  fresh(account, 'observed_at', 'expires_at', now); need(account.frozen === false, 'account frozen');
  const concurrency = integer(b.max_concurrency, 'job concurrency cap', 1);
  need(concurrency === account.max_concurrency, 'job differs from canonical account concurrency cap');
  const availableUsd = integer(account.available_usd_micros, 'USD balance'), availableCredits = integer(account.available_credits, 'credit balance');
  need(Array.isArray(account.reservations), 'missing shared reservations'); let totalUsd = 0, totalCredits = 0; const ids = new Set(); let own: RecordValue | undefined;
  for (const r of account.reservations) {
    nonempty(r.job_id, 'reserved job'); need(!ids.has(r.job_id), 'duplicate reservation'); ids.add(r.job_id);
    totalUsd = integer(totalUsd + integer(r.usd_micros, 'reserved USD'), 'total USD'); totalCredits = integer(totalCredits + integer(r.credits, 'reserved credits'), 'total credits');
    if (r.job_id === job.job_id) own = r;
  }
  need(own && own.settled !== true && own.usd_micros === cap && own.credits === credits, 'exact reservation missing'); need(totalUsd <= availableUsd && totalCredits <= availableCredits, 'account oversubscribed');
  // Unknown/pending outcomes retain a slot. Independently settled actual debits
  // retain cash/credits against this balance but no longer consume a live slot.
  need(account.reservations.filter(reservation => reservation.settled !== true).length <= concurrency, 'account concurrency cap exhausted');
  need(Array.isArray(job.attempts) && job.attempts.length <= retries, 'retry exhausted'); let spentUsd = 0, spentCredits = 0; const taskIds = new Set();
  for (const a of job.attempts) {
    nonempty(a.task_id, 'task'); need(!taskIds.has(a.task_id), 'duplicate task'); taskIds.add(a.task_id);
    need(a.status === 'FAILED' && a.charges_reconciled === true, 'prior attempt unresolved or terminal'); nonempty(a.corrective_action, 'corrective action');
    spentUsd = integer(spentUsd + integer(a.actual_usd_micros, 'actual USD'), 'spent USD'); spentCredits = integer(spentCredits + integer(a.actual_credits, 'actual credits'), 'spent credits');
  }
  need(spentUsd + units * usdRate + overhead <= cap && spentCredits + units * creditRate <= credits, 'remaining cap insufficient');
  const approval = spendRecord(job.approval, 'approval'); need(approval.status === 'APPROVED' && approval.kind === 'EXPLICIT_BOUNDED_SPEND', 'explicit approval missing');
  nonempty(approval.receipt, 'approval receipt'); nonempty(approval.approver, 'approver'); fresh(approval, 'issued_at', 'expires_at', now);
  need(approval.job_digest === jobDigest(job) && integer(approval.max_usd_micros, 'approved USD', 1) === cap && integer(approval.max_credits, 'approved credits') === credits && integer(approval.max_concurrency, 'approved concurrency', 1) === concurrency, 'approval binding changed');
}

export async function spendAction(db: SpendDb, action: string, inputValue: unknown, options: SpendOptions) {
  need(['preflight', 'reserve', 'record', 'reconcile', 'snapshot'].includes(action), 'unsupported action');
  // Freeze the validated public-key snapshot before the first asynchronous boundary.
  // Changing caller-owned configuration during a transaction cannot change authority.
  const signingPolicy = spendSigningPolicy(options);
  options = { ...options, ...signingPolicy };
  if (action === 'preflight' || action === 'reserve') need(Object.keys(options.approvalKeys).length > 0 && Object.keys(options.reconciliationKeys).length > 0, 'approval and reconciliation signers required');
  const input = spendRecord(inputValue, 'spend request');
  const jobId = nonempty(input.job_id, 'job id'); const jobRef = db.doc(`assetFactorySpendJobs/${hash(jobId)}`);
  // Stable account identity is provider + API account, never a run-specific path.
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(jobRef); need(snapshot.exists, 'protected job missing'); const state = spendRecord(snapshot.data(), 'job state');
    const job = spendJob(structuredClone(state.job)); need(job.job_id === jobId, 'job identity changed');
    const crossRepository = job.executor.binding_version !== undefined || job.executor.repository !== undefined;
    need(crossRepository || !options.worker, 'scoped workers cannot access legacy jobs');
    // Scope even non-authorizing reads and outcome observations before exposing a job.
    const crossProofs = crossRepository && action !== 'reconcile' ? await verifyCrossRepository(tx, job, input, options) : undefined;
    const crossControls = crossProofs?.controls;
    const accountRef = db.doc(`assetFactorySpendAccounts/${hash(`${job.provider}\n${job.account_id}`)}`);
    const accountSnapshot = await tx.get(accountRef); need(accountSnapshot.exists, 'protected account missing'); const account = spendAccount(structuredClone(accountSnapshot.data()));
    let boundControls = crossControls, boundApproval: RecordValue | undefined, boundPrice: RecordValue | undefined;
    if (action !== 'reconcile') {
      if (!crossRepository) {
        const approved = await tx.get(db.doc(`assetFactorySpendApprovals/${sha(job.approval_ref)}`)); need(approved.exists, 'signed request approval missing');
        boundApproval = spendRecord(approved.data(), 'approval'); signed(boundApproval, options.approvalKeys, 'approver');
        need(boundApproval.job_digest === jobDigest(job), 'signed request binding changed');
      }
      if (!boundControls) { const snapshot = await tx.get(db.doc(`assetFactorySpendControls/${sha(job.executor.controls_ref)}`)); need(snapshot.exists, 'provider controls missing'); boundControls = spendRecord(snapshot.data(), 'controls'); }
      verifyActualRequest(job, account, boundControls, input, action, options.now());
      if (!crossRepository) need(input.executor_source_sha === sha(job.executor.source_sha, 40) && job.executor.source_sha === sha(options.sourceSha, 40) && boundControls.enforcement_source_sha === options.sourceSha, 'execution source differs from approved enforcement proof');
      const priced = await tx.get(db.doc(`assetFactorySpendPricing/${sha(job.pricing_ref)}`)); need(priced.exists, 'protected pricing missing');
      boundPrice = spendRecord(priced.data(), 'price'); verifyProtectedPricing(job, boundPrice, options.now());
    }
    const attemptId = input.attempt_id;

    if (action === 'snapshot') return { ok: true, job, account, protected_controls: boundControls, protected_pricing: boundPrice, provider_call_authorized: false, execution_performed: false };

    if (action === 'record') {
      const index = job.attempts.findIndex((a: RecordValue) => a.attempt_id === attemptId); need(index >= 0, 'unknown attempt'); const attempt = job.attempts[index];
      need(attempt.status === 'RESERVED', 'attempt already recorded'); need(typeof input.status === 'string' && ['succeeded', 'failed'].includes(input.status), 'invalid outcome');
      // Caller outcomes are never trusted charge receipts or retry permission.
      attempt.status = 'RECONCILIATION_REQUIRED'; attempt.reported_outcome = input.status; attempt.reported_task_id = typeof input.request_id === 'string' ? input.request_id.slice(0, 256) : null;
      tx.set(jobRef, { ...state, job }); return { ok: true, provider_call_authorized: false, execution_performed: false, reconciliation_required: true };
    }

    if (action === 'reconcile') {
      const receiptRef = db.doc(`assetFactorySpendChargeReceipts/${sha(input.receipt_sha256)}`); const receiptSnapshot = await tx.get(receiptRef); need(receiptSnapshot.exists, 'trusted charge receipt missing'); const receipt = spendRecord(receiptSnapshot.data(), 'charge receipt');
      signed(receipt, options.reconciliationKeys, 'reconciler'); need(hash(canonical(receipt)) === input.receipt_sha256, 'charge receipt hash changed');
      const index = job.attempts.findIndex((a: RecordValue) => a.attempt_id === attemptId); need(index >= 0, 'unknown attempt'); const attempt = job.attempts[index];
      const excluded = (value: unknown): string[] => {
        need(Array.isArray(value) && value.length > 0 && value.length <= 256 && value.every(item => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item)) && new Set(value).size === value.length, 'original signing policy required');
        return value;
      };
      const reconcilerKey = options.reconciliationKeys[nonempty(receipt.key_id, 'charge signer')];
      const reconcilerSpki = createHash('sha256').update(createPublicKey(reconcilerKey.publicKey).export({ type: 'spki', format: 'der' })).digest('hex');
      const reconcilerSubject = hash(reconcilerKey.subject.normalize('NFKC').toLowerCase());
      need(!excluded(attempt.charge_excluded_signer_spki_sha256).includes(reconcilerSpki) && !excluded(attempt.charge_excluded_signer_subject_sha256).includes(reconcilerSubject), 'charge signer must be independent of original admission');
      need(typeof attempt.status === 'string' && ['RESERVED', 'RECONCILIATION_REQUIRED'].includes(attempt.status), 'attempt already reconciled');
      need(receipt.job_id === jobId && receipt.attempt_id === attemptId && receipt.provider === job.provider && receipt.account_id === job.account_id && receipt.job_digest === jobDigest(job), 'charge receipt binding changed');
      need(typeof receipt.status === 'string' && ['FAILED', 'SUCCEEDED', 'CANCELLED'].includes(receipt.status) && receipt.final === true, 'receipt not final'); nonempty(receipt.task_id, 'provider task');
      // The provider's task and final charge receipt are globally consumed within
      // the canonical account ledger, even if a writer creates a different job.
      const taskClaimRef = db.doc(`assetFactorySpendTaskClaims/${hash(canonical({ provider: job.provider, account_id: job.account_id, task_id: receipt.task_id }))}`);
      const chargeClaimRef = db.doc(`assetFactorySpendChargeClaims/${sha(input.receipt_sha256)}`);
      const [taskClaim, chargeClaim] = await Promise.all([tx.get(taskClaimRef), tx.get(chargeClaimRef)]);
      need(!taskClaim.exists && !chargeClaim.exists, 'provider task or charge receipt already consumed');
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
        account.reservations[held] = { job_id: jobId, usd_micros: spentUsd, credits: spentCredits, settled: true };
        state.terminal = true;
      }
      if (overrun) { account.frozen = true; state.cap_overrun = true; }
      const consumed = { job_id: jobId, attempt_id: attemptId, provider: job.provider, account_id: job.account_id, task_id: receipt.task_id, receipt_sha256: input.receipt_sha256 };
      tx.set(taskClaimRef, consumed); tx.set(chargeClaimRef, consumed);
      tx.set(accountRef, account); tx.set(jobRef, { ...state, job });
      return { ok: true, provider_call_authorized: false, execution_performed: false, reconciled: true, terminal, cap_overrun: overrun };
    }

    need(state.terminal !== true, 'job terminal');
    const [approvalSnapshot, authoritySnapshot] = await Promise.all([
      boundApproval ? Promise.resolve({ exists: true, data: () => boundApproval }) : tx.get(db.doc(`assetFactorySpendApprovals/${sha(job.approval_ref)}`)),
      tx.get(db.doc(`assetFactorySpendAuthorities/${sha(job.authority_ref)}`)),
    ]);
    need(approvalSnapshot.exists && authoritySnapshot.exists && boundPrice && boundControls, 'trusted execution records missing');
    const approval = spendRecord(approvalSnapshot.data(), 'approval'), authority = spendRecord(authoritySnapshot.data(), 'authority'), controls = boundControls;
    signed(approval, options.approvalKeys, 'approver'); job.approval = approval;
    fresh(controls, 'observed_at', 'expires_at', options.now());
    nonempty(controls.proof_receipt, 'provider control proof'); sha(controls.enforcement_source_sha, 40);
    const currentSource = sha(options.sourceSha, 40);
    if (crossRepository) need(crossControls && controls.enforcement_source_sha === currentSource, 'gateway enforcement source differs from approved proof');
    else need(job.executor.source_sha === currentSource && controls.enforcement_source_sha === currentSource && input.executor_source_sha === currentSource, 'execution source differs from approved enforcement proof');
    need(controls.max_usd_micros === job.budget.max_usd_micros && controls.max_credits === job.budget.max_credits, 'provider cap differs from approval');
    need(integer(controls.max_concurrency, 'provider concurrency cap', 1) === account.max_concurrency && controls.max_concurrency === job.budget.max_concurrency, 'provider concurrency differs from canonical account cap');
    need(controls.trusted_readback === true && controls.provider === job.provider && controls.account_id === job.account_id && controls.endpoint === job.executor.endpoint && controls.request_sha256 === job.executor.request_sha256 && controls.hard_stop_supported === true && controls.cost_cap_enforced === true && controls.auto_top_up === false && controls.max_runtime_seconds === job.budget.max_runtime_seconds, 'provider hard controls unproven');
    need(input.request_sha256 === sha(job.executor.request_sha256) && input.endpoint === job.executor.endpoint && input.provider === job.provider && input.model === job.model_version && input.asset === job.executor.asset && input.request_size === job.executor.request_size, 'actual request differs from approved request');
    const existing = account.reservations.find((r: RecordValue) => r.job_id === jobId);
    need(!existing || existing.settled === undefined || existing.settled === false, 'settled debit cannot reopen as a reservation');
    if (!existing) account.reservations.push({ job_id: jobId, usd_micros: job.budget.max_usd_micros, credits: job.budget.max_credits });
    // Label/source changes and byte-only re-encodings cannot authorize the same
    // semantic provider input twice. The claim persists after settlement and
    // allows only this job's independently reconciled bounded corrective retry.
    const inputClaimRef = db.doc(`assetFactorySpendInputClaims/${hash(canonical({ provider: job.provider, account_id: job.account_id, model: job.model_version, endpoint: job.executor.endpoint, semantic_input_sha256: sha(job.executor.semantic_input_sha256) }))}`);
    const inputClaim = await tx.get(inputClaimRef);
    if (inputClaim.exists) {
      const claim = spendRecord(inputClaim.data(), 'semantic input claim');
      need(claim.job_id === jobId && claim.job_digest === jobDigest(job) && job.attempts.length > 0 && claim.first_attempt_id === job.attempts[0].attempt_id && claim.last_attempt_id === job.attempts.at(-1)?.attempt_id, 'semantic input already reserved by another execution identity');
    } else need(job.attempts.length === 0, 'prior attempt has no durable input claim');
    const admittedAt = options.now();
    validateSpend(job, account, authority, admittedAt);
    verifyActualRequest(job, account, controls, input, action, admittedAt);
    verifyProtectedPricing(job, boundPrice, admittedAt);
    if (crossProofs) fresh(crossProofs.deployment, 'observed_at', 'expires_at', admittedAt);
    const proofExpiry = Math.min(...[approval, authority, account, controls, boundPrice, job.budget.rates, ...(crossProofs ? [crossProofs.deployment] : [])].map(record => date(record.expires_at)));
    need(proofExpiry > admittedAt, 'authorization window elapsed');
    const envelope = { job, account, authority, protected_controls: controls, protected_pricing: boundPrice };
    if (action === 'preflight') return { ok: true, envelope, admission_expires_at: new Date(proofExpiry).toISOString(), provider_call_authorized: false, execution_performed: false };
    need(input.job_digest === jobDigest(job), 'offline job digest changed');
    const reservedAt = options.now(), executionExpiry = Math.min(proofExpiry, reservedAt + job.budget.max_runtime_seconds * 1000);
    need(reservedAt < proofExpiry, 'authorization expired before reservation commit');
    const reserved_at = new Date(reservedAt).toISOString(), admission_expires_at = new Date(executionExpiry).toISOString();
    const id = randomUUID(); const attempt = { attempt_id: id, status: 'RESERVED', reserved_at, admission_expires_at, request_sha256: input.request_sha256, charges_reconciled: false, charge_excluded_signer_spki_sha256: [...signingPolicy.chargeExcludedSpki], charge_excluded_signer_subject_sha256: [...signingPolicy.chargeExcludedSubjects] };
    job.attempts.push(attempt); delete job.approval;
    tx.set(inputClaimRef, { job_id: jobId, job_digest: jobDigest(job), semantic_input_sha256: job.executor.semantic_input_sha256, first_attempt_id: inputClaim.exists ? spendRecord(inputClaim.data(), 'semantic input claim').first_attempt_id : id, last_attempt_id: id, reserved_at });
    tx.set(accountRef, account); tx.set(jobRef, { ...state, job });
    return { ok: true, attempt_id: id, reserved_at, admission_expires_at, job_digest: input.job_digest, executor_source_sha: job.executor.source_sha, account_id: job.account_id, credential_sha256: job.executor.credential_sha256, semantic_headers_sha256: job.executor.semantic_headers_sha256, source_input_sha256: job.executor.source_input_sha256, semantic_input_sha256: job.executor.semantic_input_sha256, content_type: job.executor.content_type, ...(crossRepository ? { gateway_source_sha: currentSource, worker_id: job.executor.worker_id } : {}), max_runtime_seconds: job.budget.max_runtime_seconds, provider_call_authorized: true, execution_performed: false };
  });
}

