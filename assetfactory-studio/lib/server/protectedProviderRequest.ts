/** Paid Studio leaves use the shared protected executor. Configuration is never approval. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { admittedArtifactHosts, retrievePublicArtifact } from '../../../model_forge/protected-artifact.mjs';
import type { GenerateRequest } from './assetFactoryValidation';

type JsonRecord = Record<string, unknown>;
type Reservation = { jobId: string; attemptId: string; jobDigest: string; requestSha256: string; sourceSha: string; maxRuntimeSeconds: number; bindingFields: JsonRecord };
type Session = { input: GenerateRequest; inputDigest: string; submitted: boolean; reservation?: Reservation; artifactHosts?: string[]; deadline?: number; monotonicDeadline?: number; controller: AbortController; taskId?: string };
const sessions = new AsyncLocalStorage<Session>();
const SOURCE_PATHS = [...['protectedProviderRequest.ts', 'assetProviderRuntime.ts', 'assetVideoProviderRuntime.ts', 'higgsfieldClient.ts'].map(name => `assetfactory-studio/lib/server/${name}`), 'model_forge/protected-artifact.mjs'];
const GATEWAY_LIMIT = 65_536;
export class ProtectedProviderRejected extends Error { code = 'protected_provider_rejected'; }
function need(value: unknown, reason: string): asserts value { if (!value) throw new ProtectedProviderRejected(reason); }
function record(value: unknown): JsonRecord { need(value && typeof value === 'object' && !Array.isArray(value), 'invalid protected record'); return value as JsonRecord; }
function sha(value: unknown, length = 64): string { need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value), 'invalid protected digest'); return value; }
function nonempty(value: unknown): string { need(typeof value === 'string' && value.trim(), 'missing protected binding'); return value; }
export function digest(value: string | Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
function protectedDate(value: unknown) {
  need(typeof value === 'string', 'protected proof timestamp missing');
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.exec(value);
  need(parts, 'protected proof requires complete ISO time and timezone');
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number), calendar = new Date(Date.UTC(year, month - 1, day));
  need(calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && hour < 24 && minute < 60 && second < 60, 'invalid protected proof calendar');
  const timestamp = Date.parse(value); need(Number.isFinite(timestamp), 'invalid protected proof timestamp'); return timestamp;
}
function freshProof(value: JsonRecord, observed: string) { const now = Date.now(); need(protectedDate(value[observed]) <= now && now < protectedDate(value.expires_at), 'stale or future protected proof'); }

/** Same ASCII/integer canonical job identity as Factory #436 and Labs #229. */
export function canonicalSpend(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') { need(Number.isSafeInteger(value), 'unsafe protected number'); return String(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalSpend).join(',')}]`;
  const object = record(value), keys = Object.keys(object).sort();
  need(keys.every(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)), 'ambiguous protected key');
  return `{${keys.map(k => `${canonicalSpend(k)}:${canonicalSpend(object[k])}`).join(',')}}`;
}
export function protectedJobDigest(job: JsonRecord) { return digest(canonicalSpend(Object.fromEntries(Object.entries(job).filter(([key]) => key !== 'approval' && key !== 'attempts')))); }
function sourceJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { need(Number.isFinite(value), 'nonfinite source input'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(sourceJson).join(',')}]`;
  const object = record(value);
  return `{${Object.keys(object).filter(k => object[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${sourceJson(object[k])}`).join(',')}}`;
}
export function studioSourceInputDigest(input: GenerateRequest) { return digest(sourceJson(input)); }
export function studioSemanticInputDigest(bytes: Uint8Array, contentType: string | null) {
  if (contentType?.split(';')[0].trim().toLowerCase() === 'application/json') {
    try { return digest(sourceJson(JSON.parse(Buffer.from(bytes).toString('utf8')))); }
    catch { throw new ProtectedProviderRejected('invalid semantic provider JSON'); }
  }
  // Studio authors deterministic string-only multipart. Reconstruct its exact
  // fields, excluding its transport boundary from the permanent input identity.
  const boundary = /^multipart\/form-data; boundary=(urai-studio-[a-f0-9]{64})$/.exec(contentType || '')?.[1];
  need(boundary, 'unsupported semantic provider content type');
  const text = Buffer.from(bytes).toString('utf8'), fields: Record<string, string> = {};
  const chunks = text.split(`--${boundary}\r\n`);
  need(chunks.shift() === '' && chunks.length > 0, 'invalid semantic multipart body');
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    if (i === chunks.length - 1) { need(chunk.endsWith(`--${boundary}--\r\n`), 'invalid multipart terminator'); chunk = chunk.slice(0, -(`--${boundary}--\r\n`).length); }
    const match = /^Content-Disposition: form-data; name="([A-Za-z_][A-Za-z0-9_]*)"\r\n\r\n([\s\S]*)\r\n$/.exec(chunk);
    need(match && !Object.prototype.hasOwnProperty.call(fields, match[1]), 'ambiguous semantic multipart field');
    fields[match[1]] = match[2];
  }
  return digest(sourceJson(fields));
}
export function studioRequestDigest(endpoint: string, bytes: Uint8Array) { return digest(Buffer.concat([Buffer.from(`POST\n${endpoint}\n`, 'utf8'), bytes])); }

/** Deterministic multipart bytes; FormData's random boundary cannot bind a repeatable approval. */
export function studioMultipart(fields: Record<string, string>) {
  const boundary = `urai-studio-${digest(sourceJson(fields))}`;
  const parts = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
    need(/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !value.includes(boundary), 'ambiguous multipart field');
    return `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`;
  });
  return { body: Buffer.from(parts.join('') + `--${boundary}--\r\n`), contentType: `multipart/form-data; boundary=${boundary}` };
}

function safeHttps(value: string, gateway = false): URL {
  let url: URL; try { url = new URL(value); } catch { throw new ProtectedProviderRejected('invalid protected HTTPS endpoint'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash && (!gateway || !url.search), 'protected HTTPS endpoint required');
  // Reject all IP literals and names reserved for local routing, including subdomains.
  need(!isIP(host) && !host.startsWith('[') && host.includes('.') && !/(^|\.)(local(?:host)?|internal)$/.test(host), 'private protected endpoint rejected');
  return url;
}
export function studioExecutorSourceSha() {
  const expected = sha(process.env.URAI_SOURCE_SHA || process.env.ASSET_FACTORY_EXACT_HEAD, 40);
  try {
    const options = { encoding: 'utf8' as const, timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] };
    const root = execFileSync('git', ['-C', process.cwd(), 'rev-parse', '--show-toplevel'], options).trim();
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], options).trim();
    need(git('rev-parse', 'HEAD') === expected, 'Studio build differs from declared source');
    const tracked = git('ls-files', '--error-unmatch', '--', ...SOURCE_PATHS).split('\n');
    need(tracked.length === SOURCE_PATHS.length && SOURCE_PATHS.every(p => tracked.includes(p)), 'Studio protected source is untracked');
    need(!git('status', '--porcelain', '--untracked-files=all', '--', ...SOURCE_PATHS), 'Studio protected source is dirty');
  } catch (error) { if (error instanceof ProtectedProviderRejected) throw error; throw new ProtectedProviderRejected('actual clean Studio build provenance unavailable'); }
  return expected;
}
async function boundedJson(response: Response) {
  need(response.ok, 'protected gateway rejected request');
  const reader = response.body?.getReader(); need(reader, 'missing protected gateway response');
  const chunks: Uint8Array[] = []; let count = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; count += value.byteLength; if (count > GATEWAY_LIMIT) { await reader.cancel(); throw new ProtectedProviderRejected('oversized protected gateway response'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  try { const value = record(JSON.parse(Buffer.concat(chunks, count).toString('utf8'))); need(value.ok === true, 'protected gateway rejected request'); return value; }
  catch (error) { if (error instanceof ProtectedProviderRejected) throw error; throw new ProtectedProviderRejected('invalid protected gateway response'); }
}
async function gateway(action: string, fields: JsonRecord) {
  const endpoint = safeHttps(nonempty(process.env.ASSET_FORGE_SPEND_GATEWAY_URL), true);
  const issuer = safeHttps(nonempty(process.env.ASSET_FORGE_SPEND_GATEWAY_ORIGIN), true);
  need(issuer.toString() === `${issuer.origin}/` && endpoint.origin === issuer.origin && endpoint.pathname === '/api/worker/production-spend', 'spend gateway differs from protected issuer origin');
  const token = nonempty(process.env.ASSET_FORGE_SPEND_WORKER_TOKEN); need(token.length >= 32, 'protected worker credential unavailable');
  try {
    // A lost reserve response may already hold funds. Never retry this call.
    return await boundedJson(await fetch(endpoint.toString(), { method: 'POST', redirect: 'error', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, ...fields }), signal: AbortSignal.timeout(15_000) }));
  } catch (error) { if (error instanceof ProtectedProviderRejected) throw error; throw new ProtectedProviderRejected('protected gateway outcome unavailable'); }
}
function jobId(requestDigest: string) {
  let mapping: JsonRecord; try { mapping = record(JSON.parse(process.env.FACTORY_STUDIO_SPEND_JOB_IDS_JSON || '{}')); } catch { throw new ProtectedProviderRejected('invalid protected Studio job mapping'); }
  return nonempty(mapping[requestDigest]);
}
function checkDeadline(session: Session) { need(!session.controller.signal.aborted && (!session.deadline || Date.now() < session.deadline) && (!session.monotonicDeadline || performance.now() < session.monotonicDeadline), 'protected provider deadline expired; reconcile before retry'); }
function checkSession(session: Session) {
  checkDeadline(session);
  need(studioSourceInputDigest(session.input) === session.inputDigest, 'Studio source input changed during execution');
  if (session.reservation) need(studioExecutorSourceSha() === session.reservation.sourceSha, 'Studio source changed during execution');
  checkDeadline(session);
}
function joinedSignal(session: Session | undefined, input?: AbortSignal | null) {
  const signals = [session?.controller.signal, input].filter((s): s is AbortSignal => Boolean(s));
  return signals.length ? AbortSignal.any(signals) : undefined;
}
function credentialHeaders(headers: Headers) { return Object.fromEntries([...headers.entries()].filter(([key]) => ['authorization', 'xi-api-key', 'x-api-key'].includes(key))); }

/** The only paid HTTP leaf. Server records authorize one exact request, never a local flag. */
export async function paidStudioFetch(provider: string, model: string, lane: string, endpoint: string, init: RequestInit): Promise<Response> {
  const session = sessions.getStore(); need(session, 'paid Studio request lacks source session');
  checkDeadline(session); need(!session.submitted, 'duplicate paid Studio submission rejected');
  need(studioSourceInputDigest(session.input) === session.inputDigest, 'source input changed before submission');
  need(init.method === 'POST' && (typeof init.body === 'string' || Buffer.isBuffer(init.body)), 'materialized exact paid POST bytes required');
  const url = safeHttps(endpoint); need(url.toString() === endpoint, 'paid endpoint must be canonical');
  const bytes = typeof init.body === 'string' ? Buffer.from(init.body, 'utf8') : Buffer.from(init.body as Buffer);
  const headers = new Headers(init.headers), credentials = credentialHeaders(headers);
  need(Object.keys(credentials).length > 0, 'provider account credential missing');
  const contentType = nonempty(headers.get('content-type'));
  const credentialDigest = digest(sourceJson(credentials));
  const semanticDigest = digest(sourceJson(Object.fromEntries([...headers.entries()].filter(([key]) => !Object.prototype.hasOwnProperty.call(credentials, key)))));
  const requestDigest = studioRequestDigest(endpoint, bytes), semanticInputDigest = studioSemanticInputDigest(bytes, contentType), sourceSha = studioExecutorSourceSha();
  const asset = `${session.input.tenantId || 'default'}/${session.input.jobId}/${lane}`;
  const fields = { job_id: jobId(requestDigest), provider: nonempty(provider), model: nonempty(model), asset, request_size: String(bytes.byteLength), endpoint, request_sha256: requestDigest, executor_source_sha: sourceSha, credential_sha256: credentialDigest, semantic_headers_sha256: semanticDigest, source_input_sha256: session.inputDigest, semantic_input_sha256: semanticInputDigest, content_type: contentType };
  sessionEndpoint.set(session, endpoint);
  session.submitted = true;
  const prepared = await gateway('preflight', fields);
  need(prepared.provider_call_authorized === false && prepared.execution_performed === false, 'preflight must remain non-authorizing');
  const envelope = record(prepared.envelope), job = record(envelope.job), executor = record(job.executor), authority = record(job.authority);
  const account = record(envelope.account), controls = record(envelope.protected_controls), pricing = record(envelope.protected_pricing), sourceAuthority = record(envelope.authority), accountId = nonempty(job.account_id), budget = record(job.budget);
  session.artifactHosts = admittedArtifactHosts(executor.artifact_hosts);
  need(canonicalSpend(controls.artifact_hosts) === canonicalSpend(session.artifactHosts), 'protected Studio artifact hosts changed');
  need(job.job_id === fields.job_id && job.provider === provider && job.model_version === model && job.consumer === 'factory-studio' && job.rights_reviewed === true, 'protected Studio job identity or rights changed');
  need(authority.repository === 'LifeLoggerAI/asset-factory' && authority.sha === sourceSha, 'protected Studio source authority changed');
  need(executor.source_sha === sourceSha && executor.endpoint === endpoint && executor.request_sha256 === requestDigest && executor.asset === asset && executor.request_size === fields.request_size, 'protected Studio request binding changed');
  need(executor.content_type === contentType && executor.credential_sha256 === credentialDigest && executor.semantic_headers_sha256 === semanticDigest && executor.source_input_sha256 === session.inputDigest && executor.semantic_input_sha256 === semanticInputDigest, 'protected Studio account/header/input binding changed');
  need(account.provider === provider && account.account_id === accountId && account.trusted_readback === true && account.credential_binding_verified === true && account.credential_sha256 === credentialDigest, 'protected Studio credential/account mapping changed');
  nonempty(account.credential_binding_receipt);
  need(controls.provider === provider && controls.account_id === accountId && controls.trusted_readback === true && controls.credential_sha256 === credentialDigest && controls.semantic_headers_sha256 === semanticDigest && controls.source_input_sha256 === session.inputDigest && controls.semantic_input_sha256 === semanticInputDigest && controls.content_type === contentType, 'protected Studio control/account binding changed');
  const checkProofs = () => {
    const approval = record(job.approval);
    need(approval.status === 'APPROVED' && approval.kind === 'EXPLICIT_BOUNDED_SPEND' && approval.job_digest === protectedJobDigest(job), 'protected Studio bounded approval changed');
    nonempty(approval.receipt); nonempty(approval.approver); freshProof(approval, 'issued_at');
    need(approval.max_usd_micros === budget.max_usd_micros && approval.max_credits === budget.max_credits, 'protected Studio approval caps changed');
    need(sourceAuthority.trusted_readback === true && canonicalSpend(record(sourceAuthority.binding)) === canonicalSpend(authority), 'protected Studio source authority proof changed');
    freshProof(sourceAuthority, 'observed_at'); freshProof(account, 'observed_at'); freshProof(controls, 'observed_at');
    need(controls.enforcement_source_sha === sourceSha && controls.endpoint === endpoint && controls.request_sha256 === requestDigest && controls.hard_stop_supported === true && controls.cost_cap_enforced === true && controls.auto_top_up === false && controls.max_usd_micros === budget.max_usd_micros && controls.max_credits === budget.max_credits && controls.max_runtime_seconds === budget.max_runtime_seconds, 'protected Studio hard controls changed');
    nonempty(controls.proof_receipt);
    need(pricing.trusted_readback === true && pricing.provider === provider && pricing.account_id === accountId && pricing.model_version === model && pricing.request_sha256 === requestDigest, 'protected Studio pricing identity changed');
    need(pricing.credential_sha256 === credentialDigest && pricing.semantic_headers_sha256 === semanticDigest && pricing.source_input_sha256 === session.inputDigest && pricing.semantic_input_sha256 === semanticInputDigest && pricing.content_type === contentType, 'protected Studio pricing request binding changed');
    nonempty(pricing.receipt); freshProof(pricing, 'observed_at');
    const rates = record(pricing.rates); nonempty(rates.receipt); freshProof(rates, 'verified_at');
    need(canonicalSpend(rates) === canonicalSpend(budget.rates), 'protected Studio approved pricing changed');
  };
  checkProofs();
  const preflightExpiry = protectedDate(prepared.admission_expires_at);
  const proofExpiry = Math.min(...[record(job.approval), sourceAuthority, account, controls, pricing, record(pricing.rates)].map(proof => protectedDate(proof.expires_at)));
  need(preflightExpiry <= proofExpiry && Date.now() < preflightExpiry, 'protected Studio admission deadline is invalid');
  const inputs = job.input_sha256; need(Array.isArray(inputs) && inputs.includes(session.inputDigest) && inputs.includes(requestDigest), 'protected Studio input fixity missing');
  const jobDigest = protectedJobDigest(job);
  // Recheck local clean build/input after the non-authorizing read and before reserve.
  need(studioExecutorSourceSha() === sourceSha && studioSourceInputDigest(session.input) === session.inputDigest, 'Studio source changed before reservation');
  checkProofs();
  const boundFields = { ...fields, account_id: accountId, job_digest: jobDigest };
  const admissionStarted = Date.now();
  need(typeof budget.max_runtime_seconds === 'number' && Number.isSafeInteger(budget.max_runtime_seconds) && budget.max_runtime_seconds > 0 && budget.max_runtime_seconds <= 86_400, 'protected Studio approved runtime missing');
  session.deadline = Math.min(preflightExpiry, admissionStarted + budget.max_runtime_seconds * 1_000);
  session.monotonicDeadline = performance.now() + Math.max(0, session.deadline - admissionStarted);
  checkDeadline(session);
  const admitted = await gateway('reserve', boundFields);
  const runtime = admitted.max_runtime_seconds;
  need(admitted.provider_call_authorized === true && admitted.execution_performed === false && admitted.executor_source_sha === sourceSha && admitted.job_digest === jobDigest && typeof runtime === 'number' && Number.isSafeInteger(runtime) && runtime > 0 && runtime <= 86_400 && runtime === budget.max_runtime_seconds, 'invalid protected Studio reservation');
  need(admitted.account_id === accountId && admitted.credential_sha256 === credentialDigest && admitted.semantic_headers_sha256 === semanticDigest && admitted.source_input_sha256 === session.inputDigest && admitted.semantic_input_sha256 === semanticInputDigest && admitted.content_type === contentType, 'protected Studio reserved credential/account binding changed');
  const attemptId = nonempty(admitted.attempt_id);
  session.reservation = { jobId: fields.job_id, attemptId, jobDigest, requestSha256: requestDigest, sourceSha, maxRuntimeSeconds: runtime, bindingFields: boundFields };
  const reservedAt = protectedDate(admitted.reserved_at), admissionExpiry = protectedDate(admitted.admission_expires_at);
  need(reservedAt <= Date.now() && reservedAt < admissionExpiry && admissionExpiry <= preflightExpiry && admissionExpiry <= reservedAt + runtime * 1_000, 'invalid protected Studio reservation deadline');
  session.deadline = Math.min(session.deadline, admissionExpiry);
  session.monotonicDeadline = Math.min(session.monotonicDeadline, performance.now() + Math.max(0, session.deadline - Date.now()));
  checkDeadline(session);
  need(studioExecutorSourceSha() === sourceSha && studioSourceInputDigest(session.input) === session.inputDigest, 'Studio source changed after reservation');
  checkProofs();
  checkDeadline(session);
  // Dispatch the materialized method/headers/body that were actually admitted.
  const response = await fetch(endpoint, { ...init, method: 'POST', headers, body: bytes, redirect: 'error', signal: joinedSignal(session, init.signal) });
  checkSession(session);
  return response;
}

/** Only status/artifact GETs are allowed after admission; authorization cannot escape its API origin. */
export async function readStudioProvider(url: string, init: RequestInit = {}) {
  const session = sessions.getStore(); if (session) { checkSession(session); need(session.reservation, 'provider read preceded admission'); }
  need(!init.method || init.method === 'GET', 'provider continuation must be read-only');
  const target = safeHttps(url), headers = new Headers(init.headers);
  if (Object.keys(credentialHeaders(headers)).length) {
    need(session?.reservation, 'credential-bearing read lacks protected source session');
    // The admitted endpoint is retrieved from the session's durable request identity.
    const endpoint = sessionEndpoint.get(session); need(endpoint && target.origin === new URL(endpoint).origin, 'provider credential origin changed');
  } else {
    need(session?.reservation, 'artifact read lacks protected source session');
    const artifact = await retrievePublicArtifact(target.toString(), { hosts: session.artifactHosts, maxBytes: 64 * 1024 * 1024, timeoutMs: Math.max(1, Math.floor(Math.min(120_000, (session.deadline || 0) - Date.now()))), signal: joinedSignal(session, init.signal), checkAdmission: () => checkSession(session) });
    return new Response(new Uint8Array(artifact.buffer!), { headers: { 'content-length': String(artifact.bytes), ...(artifact.contentType ? { 'content-type': artifact.contentType } : {}) } });
  }
  const response = await fetch(target.toString(), { ...init, method: 'GET', redirect: 'error', signal: joinedSignal(session, init.signal) });
  if (session) checkSession(session);
  return response;
}
export async function readStudioBytes(response: Response, maxBytes: number) {
  need(Number.isSafeInteger(maxBytes) && maxBytes > 0, 'invalid provider byte limit');
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) > maxBytes) { await response.body?.cancel(); throw new ProtectedProviderRejected('provider response exceeds byte limit'); }
  const reader = response.body?.getReader(); need(reader, 'provider response body missing');
  const chunks: Uint8Array[] = []; let total = 0;
  try { while (true) { const session = sessions.getStore(); if (session) checkSession(session); const { done, value } = await reader.read(); if (session) checkSession(session); if (done) break; total += value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new ProtectedProviderRejected('provider response exceeds byte limit while streaming'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}
const sessionEndpoint = new WeakMap<Session, string>();
export function replicateStudioStatusUrl(value: unknown, taskId: unknown) {
  const expected = `https://api.replicate.com/v1/predictions/${encodeURIComponent(nonempty(taskId))}`;
  need(typeof value === 'string' && safeHttps(value).toString() === expected && value === expected, 'Replicate status URL differs from admitted task');
  return expected;
}
export function observeStudioProviderTask(id: unknown) { const session = sessions.getStore(); if (session && typeof id === 'string' && id.trim()) session.taskId = id.slice(0, 256); }
export async function waitStudioProvider(ms: number) {
  need(Number.isFinite(ms) && ms > 0, 'invalid provider polling interval');
  const session = sessions.getStore(); if (session) checkDeadline(session);
  const duration = Math.min(ms, session?.deadline ? Math.max(1, session.deadline - Date.now()) : ms);
  await new Promise<void>((resolve, reject) => {
    const signal = session?.controller.signal;
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, duration);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new ProtectedProviderRejected('protected provider deadline expired')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
  if (session) checkDeadline(session);
}

export async function withProtectedStudioSession<T>(input: GenerateRequest | undefined, run: () => Promise<T>): Promise<T> {
  need(input, 'paid Studio source input required');
  const active = sessions.getStore();
  if (active) { need(studioSourceInputDigest(input) === active.inputDigest, 'nested Studio input changed'); return run(); }
  const session: Session = { input, inputDigest: studioSourceInputDigest(input), submitted: false, controller: new AbortController() };
  return sessions.run(session, async () => {
    // One timer spans submission, polling, artifact retrieval, and decoding.
    const timer = setInterval(() => { if ((session.deadline && Date.now() >= session.deadline) || (session.monotonicDeadline && performance.now() >= session.monotonicDeadline)) session.controller.abort(); }, 25);
    let outcome: 'succeeded' | 'failed' = 'failed';
    try { const result = await run(); checkSession(session); outcome = 'succeeded'; return result; }
    finally {
      clearInterval(timer);
      if (session.reservation) {
        const r = session.reservation;
        // Observations cannot settle charges, release funds, or authorize retry.
        try { const observed = await gateway('record', { ...r.bindingFields, attempt_id: r.attemptId, status: outcome, ...(session.taskId ? { request_id: session.taskId } : {}) }); need(observed.provider_call_authorized === false && observed.execution_performed === false && observed.reconciliation_required === true, 'invalid protected observation'); }
        catch { if (outcome === 'succeeded') throw new ProtectedProviderRejected('provider output requires durable observation and charge reconciliation'); }
        if (outcome === 'succeeded') checkSession(session);
      }
    }
  });
}
