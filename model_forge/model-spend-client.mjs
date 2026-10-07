/** Model Forge client for the protected #436 account gateway; no local approval. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_GATEWAY_BYTES = 65536;
const PROVIDER_ORIGINS = { meshy: 'https://api.meshy.ai', tripo: 'https://api.tripo3d.ai', rodin: 'https://api.hyper3d.com', replicate: 'https://api.replicate.com' };
const EXECUTOR_FILES = ['model_forge/forge.mjs', 'model_forge/model-spend-client.mjs', 'model_forge/triangle-budget.mjs', 'model_forge/glb-container.mjs'];
const root = fileURLToPath(new URL('../', import.meta.url));

function need(ok, reason) { if (!ok) throw new Error(`MODEL_SPEND_BLOCKED: ${reason}`); }
export function canonical(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') { need(Number.isSafeInteger(value), 'canonical integers required'); return String(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  need(value && typeof value === 'object', 'invalid canonical object');
  const keys = Object.keys(value).sort(); need(keys.every(k => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)), 'ambiguous canonical key');
  return `{${keys.map(k => `${canonical(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
export function jobDigest(job) { return hash(canonical(Object.fromEntries(Object.entries(job).filter(([k]) => !['approval', 'attempts'].includes(k))))); }

export function verifiedSourceSha(env = process.env) {
  const declared = env.URAI_SOURCE_SHA || env.ASSET_FACTORY_EXACT_HEAD;
  need(/^[0-9a-f]{40}$/.test(declared || ''), 'immutable executor source SHA required');
  const run = args => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 });
  const head = run(['rev-parse', 'HEAD']); need(head.status === 0 && head.stdout.trim() === declared, 'actual Git HEAD differs from executor identity');
  for (const file of EXECUTOR_FILES) {
    const tracked = run(['ls-files', '--error-unmatch', '--', file]); need(tracked.status === 0 && fs.existsSync(path.join(root, file)) && fs.lstatSync(path.join(root, file)).isFile(), 'executor source is missing, untracked or not a regular file');
  }
  const status = run(['status', '--porcelain', '--untracked-files=all', '--', ...EXECUTOR_FILES]);
  need(status.status === 0 && !status.stdout.trim(), 'executor source differs from tracked immutable build');
  return declared;
}

function httpsEndpoint(raw, label) {
  let url; try { url = new URL(raw); } catch { need(false, `${label} URL invalid`); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.hash, `${label} requires HTTPS without credentials or fragment`);
  return url;
}
function admissionTime(value) {
  need(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), 'absolute admission window missing or invalid');
  return Date.parse(value);
}
function safeHeader(value) { need(!/[\r\n]/.test(value), 'multipart header contains newline'); return value.replace(/"/g, '%22'); }
/** Stable multipart bytes allow approval of exactly the payload later sent. */
export async function freezeRequest(endpoint, init, provider) {
  const url = httpsEndpoint(endpoint, 'provider'); need(url.origin === PROVIDER_ORIGINS[provider], 'unapproved provider origin');
  need(String(init.method || 'GET').toUpperCase() === 'POST', 'paid submission requires POST');
  const headers = new Headers(init.headers); let body;
  if (init.body instanceof FormData) {
    const entries = []; let bytes = 0;
    for (const [key, value] of init.body.entries()) {
      const binary = typeof value !== 'string';
      need((binary ? value.size : Buffer.byteLength(value)) <= MAX_REQUEST_BYTES - bytes, 'multipart request exceeds bound');
      const content = binary ? Buffer.from(await value.arrayBuffer()) : Buffer.from(value, 'utf8');
      bytes += content.length; need(bytes <= MAX_REQUEST_BYTES, 'multipart request exceeds bound');
      entries.push({ key: safeHeader(key), filename: binary ? safeHeader(value.name) : null, type: binary ? safeHeader(value.type || 'application/octet-stream') : null, content });
    }
    const boundary = `urai-model-${hash(canonical(entries.map(e => ({ key: e.key, filename: e.filename, type: e.type, sha256: hash(e.content) })))).slice(0, 48)}`;
    const chunks = [];
    for (const entry of entries) {
      need(!entry.content.includes(Buffer.from(boundary)), 'multipart boundary collides with content');
      const disposition = `Content-Disposition: form-data; name="${entry.key}"${entry.filename === null ? '' : `; filename="${entry.filename}"`}\r\n`;
      chunks.push(Buffer.from(`--${boundary}\r\n${disposition}${entry.type ? `Content-Type: ${entry.type}\r\n` : ''}\r\n`), entry.content, Buffer.from('\r\n'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`)); body = Buffer.concat(chunks);
    headers.set('content-type', `multipart/form-data; boundary=${boundary}`);
  } else {
    need(typeof init.body === 'string' || Buffer.isBuffer(init.body) || init.body instanceof Uint8Array, 'request bytes must be materialized');
    need((typeof init.body === 'string' ? Buffer.byteLength(init.body) : init.body.byteLength) <= MAX_REQUEST_BYTES, 'request byte bound');
    body = Buffer.from(init.body);
  }
  need(body.length > 0 && body.length <= MAX_REQUEST_BYTES, 'request byte bound');
  headers.delete('content-length');
  const credentials = {}, semantic = {};
  for (const [name, value] of [...headers.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    need(value.length <= 8192, 'effective provider header exceeds bound');
    if (['authorization', 'x-api-key', 'xi-api-key', 'api-key'].includes(name)) credentials[name] = value;
    else semantic[name] = value;
  }
  need(/^Bearer [^\s\u0000-\u001f\u007f]{1,4096}$/.test(credentials.authorization || ''), 'actual effective provider credential required');
  // Compact sorted JSON is shared with the canonical gateway's credential registry.
  // Only fingerprints enter evidence; actual frozen headers are sent once.
  const compact = dictionary => `{${Object.keys(dictionary).sort().map(name => `${JSON.stringify(name)}:${JSON.stringify(dictionary[name])}`).join(',')}}`;
  return { endpoint: url.toString(), body, headers, request_sha256: hash(Buffer.concat([Buffer.from(`POST\n${url.toString()}\n`), body])), credential_sha256: hash(compact(credentials)), semantic_headers_sha256: hash(compact(semantic)), content_type: headers.get('content-type') || '', request_size: body.length };
}

function protectedBinding(envelope, binding, expectedAccount = null) {
  const job = envelope?.job, account = envelope?.account, controls = envelope?.protected_controls, price = envelope?.protected_pricing;
  need(job?.job_id === binding.job_id && job.provider === binding.provider && job.model_version === binding.model && job.executor?.source_sha === binding.executor_source_sha, 'approved job identity changed');
  if (job.approval) need(admissionTime(job.approval.issued_at) <= binding.checked_at && binding.checked_at < admissionTime(job.approval.expires_at), 'approved financial authority expired');
  for (const field of ['endpoint', 'request_sha256', 'request_size', 'asset', 'content_type', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256']) {
    need(job.executor[field] === binding[field], `actual ${field} differs from protected approval`);
  }
  need(Array.isArray(job.input_sha256) && job.input_sha256.includes(binding.source_input_sha256) && job.input_sha256.includes(binding.request_sha256), 'approved source/input hashes missing');
  need(job.executor.remote_reference_inputs !== true, 'remote-reference fixity requires a protected materializer');
  need(typeof job.account_id === 'string' && job.account_id && (!expectedAccount || job.account_id === expectedAccount), 'protected account identity changed');
  need(account?.provider === binding.provider && account.account_id === job.account_id && account.balance_type === 'API' && account.trusted_readback === true && account.credential_sha256 === binding.credential_sha256 && account.credential_binding_verified === true && typeof account.credential_binding_receipt === 'string' && account.credential_binding_receipt, 'actual credential does not match verified protected account');
  need(Number.isFinite(Date.parse(account.observed_at)) && Number.isFinite(Date.parse(account.expires_at)) && Date.parse(account.observed_at) <= binding.checked_at && Date.parse(account.expires_at) > binding.checked_at, 'protected account readback is not fresh');
  need(controls?.provider === binding.provider && controls.account_id === job.account_id && controls.trusted_readback === true && controls.enforcement_source_sha === binding.executor_source_sha && controls.hard_stop_supported === true && controls.cost_cap_enforced === true && controls.auto_top_up === false && typeof controls.proof_receipt === 'string' && controls.proof_receipt, 'protected provider controls unproven');
  for (const field of ['endpoint', 'request_sha256', 'content_type', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256']) need(controls[field] === binding[field], `actual ${field} differs from protected controls`);
  need(Number.isFinite(Date.parse(controls.observed_at)) && Number.isFinite(Date.parse(controls.expires_at)) && Date.parse(controls.observed_at) <= binding.checked_at && Date.parse(controls.expires_at) > binding.checked_at, 'protected controls readback is not fresh');
  need(Number.isSafeInteger(job.budget?.max_usd_micros) && job.budget.max_usd_micros > 0 && Number.isSafeInteger(job.budget.max_credits) && job.budget.max_credits >= 0, 'approved cash/credit caps missing');
  need(controls.max_runtime_seconds === job.budget?.max_runtime_seconds && controls.max_usd_micros === job.budget?.max_usd_micros && controls.max_credits === job.budget?.max_credits, 'protected controls differ from approved caps');
  need(price?.provider === binding.provider && price.account_id === job.account_id && price.model_version === binding.model && price.request_sha256 === binding.request_sha256 && price.trusted_readback === true, 'protected pricing identity changed');
  for (const field of ['content_type', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256']) need(price[field] === binding[field], `actual ${field} differs from protected pricing`);
  need(typeof price.receipt === 'string' && price.receipt && Number.isFinite(Date.parse(price.observed_at)) && Number.isFinite(Date.parse(price.expires_at)) && Date.parse(price.observed_at) <= binding.checked_at && Date.parse(price.expires_at) > binding.checked_at, 'protected pricing proof is not fresh');
  need(price.rates && job.budget.rates && canonical(price.rates) === canonical(job.budget.rates), 'protected pricing differs from approved rates');
  need(typeof price.rates.receipt === 'string' && price.rates.receipt && Number.isFinite(Date.parse(price.rates.verified_at)) && Number.isFinite(Date.parse(price.rates.expires_at)) && Date.parse(price.rates.verified_at) <= binding.checked_at && Date.parse(price.rates.expires_at) > binding.checked_at, 'protected pricing readback is not fresh');
  return job;
}

async function boundedJson(response, maximum) {
  const declared = Number(response.headers.get('content-length')); need(!Number.isFinite(declared) || declared <= maximum, 'response exceeds bound');
  need(response.body, 'response body missing'); const reader = response.body.getReader(); const chunks = []; let bytes = 0;
  while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; if (bytes > maximum) { await reader.cancel(); need(false, 'response exceeds bound'); } chunks.push(next.value); }
  const text = Buffer.concat(chunks).toString('utf8'); let payload; try { payload = text ? JSON.parse(text) : {}; } catch { need(false, 'response JSON invalid'); }
  return payload;
}

/** One instance covers the candidate lifecycle; loss/timeout never opens another call. */
export class ModelSpendClient {
  constructor({ provider, asset, sourceSpecSha256, evidenceDir, previewCheckpoint = null, env = process.env, fetchImpl = globalThis.fetch, now = Date.now }) {
    need(PROVIDER_ORIGINS[provider] && typeof asset === 'string' && asset, 'provider/asset identity required');
    need(/^[0-9a-f]{64}$/.test(sourceSpecSha256), 'source spec hash required');
    this.provider = provider; this.asset = asset; this.sourceSpecSha256 = sourceSpecSha256; this.evidenceDir = evidenceDir;
    this.previewCheckpoint = previewCheckpoint;
    this.env = env; this.fetch = fetchImpl; this.now = now; this.records = []; this.deadline = Infinity; this.monotonicDeadline = Infinity; this.submitted = new Set();
  }
  remainingMs(maximum) { const remaining = Math.min(this.deadline - this.now(), this.monotonicDeadline - performance.now()); need(remaining > 0, 'approved runtime deadline elapsed; reconciliation required'); return Math.max(1, Math.floor(Math.min(remaining, maximum))); }
  async gateway(action, data) {
    const url = httpsEndpoint(this.env.ASSET_FORGE_SPEND_GATEWAY_URL, 'gateway');
    need(url.pathname.endsWith('/api/worker/production-spend') && !url.search, 'canonical gateway route required');
    need(httpsEndpoint(this.env.ASSET_FORGE_SPEND_GATEWAY_ORIGIN, 'protected gateway origin').toString() === `${url.origin}/`, 'gateway origin differs from protected issuer configuration');
    const token = this.env.ASSET_FORGE_SPEND_WORKER_TOKEN; need(typeof token === 'string' && token.length >= 32, 'protected worker authentication required');
    const response = await this.fetch(url.toString(), { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, ...data }), redirect: 'error', signal: AbortSignal.timeout(Math.min(10000, this.remainingMs(10000))) });
    const result = await boundedJson(response, MAX_GATEWAY_BYTES); need(response.ok && result.ok === true, 'protected gateway rejected or unavailable'); return result;
  }
  savePreviewCheckpoint(taskId, model) {
    const attempt = this.records.at(-1);
    need(this.provider === 'meshy' && typeof taskId === 'string' && taskId && attempt?.reported_task_id === taskId && attempt.status === 'submission-returned', 'preview submission identity missing');
    const checkpoint = { schema_version: 1, provider: 'meshy', asset: this.asset, model, source_spec_sha256: this.sourceSpecSha256, job_id: attempt.job_id, account_id: attempt.account_id, attempt_id: attempt.attempt_id, preview_task_id: taskId, request_sha256: attempt.request_sha256, executor_source_sha: attempt.executor_source_sha, credential_sha256: attempt.credential_sha256, semantic_headers_sha256: attempt.semantic_headers_sha256, source_input_sha256: attempt.source_input_sha256, content_type: attempt.content_type, provider_call_authorized: false };
    if (this.evidenceDir) fs.writeFileSync(path.join(this.evidenceDir, 'meshy-preview-continuation.json'), `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpoint;
  }
  async verifiedPreview(endpoint, init, model) {
    const sourceSha = verifiedSourceSha(this.env);
    const checkpoint = this.previewCheckpoint;
    need(this.provider === 'meshy' && checkpoint?.schema_version === 1 && checkpoint.provider === 'meshy' && checkpoint.asset === this.asset && checkpoint.model === model && checkpoint.source_spec_sha256 === this.sourceSpecSha256 && checkpoint.provider_call_authorized === false, 'preview checkpoint identity changed');
    const request = await freezeRequest(endpoint, init, this.provider);
    need(checkpoint.request_sha256 === request.request_sha256 && typeof checkpoint.job_id === 'string' && checkpoint.job_id && typeof checkpoint.attempt_id === 'string' && checkpoint.attempt_id, 'preview checkpoint request changed');
    need(typeof checkpoint.account_id === 'string' && checkpoint.account_id, 'preview checkpoint account binding missing');
    const binding = { job_id: checkpoint.job_id, account_id: checkpoint.account_id, provider: this.provider, model, asset: this.asset, endpoint: request.endpoint, request_sha256: request.request_sha256, request_size: request.request_size, executor_source_sha: sourceSha, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, source_input_sha256: this.sourceSpecSha256, content_type: request.content_type };
    for (const field of ['executor_source_sha', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type']) need(checkpoint[field] === binding[field], 'preview checkpoint transport binding changed');
    const snapshot = await this.gateway('snapshot', binding);
    need(snapshot.provider_call_authorized === false && snapshot.execution_performed === false, 'preview snapshot cannot authorize a call');
    const job = protectedBinding(snapshot, { ...binding, checked_at: this.now() }, checkpoint.account_id);
    const attempt = job.attempts?.find(a => a.attempt_id === checkpoint.attempt_id);
    need(attempt?.status === 'SUCCEEDED' && attempt.charges_reconciled === true && typeof attempt.task_id === 'string' && attempt.task_id && attempt.task_id === checkpoint.preview_task_id && /^[0-9a-f]{64}$/.test(attempt.charge_receipt_sha256 || ''), 'preview requires authentic successful charge reconciliation');
    return attempt.task_id;
  }
  async submit(endpoint, init, model) {
    need(typeof model === 'string' && model.trim(), 'exact provider model required');
    const sourceSha = verifiedSourceSha(this.env);
    const request = await freezeRequest(endpoint, init, this.provider);
    const binding = { provider: this.provider, model, asset: this.asset, endpoint: request.endpoint, request_sha256: request.request_sha256, request_size: request.request_size, executor_source_sha: sourceSha, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, source_input_sha256: this.sourceSpecSha256, content_type: request.content_type };
    if (this.evidenceDir) { fs.mkdirSync(this.evidenceDir, { recursive: true }); fs.writeFileSync(path.join(this.evidenceDir, `spend-request-${request.request_sha256}.json`), `${JSON.stringify({ ...binding, source_spec_sha256: this.sourceSpecSha256, content_type: request.content_type, provider_call_authorized: false }, null, 2)}\n`); }
    let jobs; try { jobs = JSON.parse(this.env.MODEL_FORGE_SPEND_JOB_IDS_JSON || '{}'); } catch { need(false, 'job map invalid'); }
    need(jobs && typeof jobs === 'object' && !Array.isArray(jobs), 'job map invalid');
    const jobId = jobs[request.request_sha256]; need(typeof jobId === 'string' && jobId.trim(), `protected exact request job missing (${request.request_sha256})`);
    need(!this.submitted.has(request.request_sha256), 'same session cannot resubmit a paid request');
    const input = { job_id: jobId, ...binding };
    const preflight = await this.gateway('preflight', input);
    need(preflight.provider_call_authorized === false && preflight.execution_performed === false && preflight.envelope, 'preflight is non-authorizing');
    const proofDeadline = admissionTime(preflight.admission_expires_at);
    need(this.now() < proofDeadline, 'absolute preflight admission expired');
    const job = protectedBinding(preflight.envelope, { ...input, checked_at: this.now() });
    input.account_id = job.account_id;
    const digest = jobDigest(job);
    const admissionStarted = this.now();
    const monotonicStarted = performance.now();
    const reservation = await this.gateway('reserve', { ...input, job_digest: digest });
    need(reservation.provider_call_authorized === true && reservation.execution_performed === false && reservation.job_digest === digest && reservation.executor_source_sha === sourceSha && typeof reservation.attempt_id === 'string' && reservation.attempt_id, 'atomic reservation did not authorize this exact request');
    for (const field of ['account_id', 'credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type']) need(reservation[field] === input[field], 'atomic reservation binding differs from actual transport');
    need(Number.isSafeInteger(reservation.max_runtime_seconds) && reservation.max_runtime_seconds > 0 && reservation.max_runtime_seconds <= 86400, 'approved runtime bound invalid');
    need(reservation.max_runtime_seconds === job.budget.max_runtime_seconds, 'atomic reservation changed approved runtime cap');
    const reservedAt = admissionTime(reservation.reserved_at), admittedUntil = admissionTime(reservation.admission_expires_at);
    need(reservedAt <= this.now() && admittedUntil > reservedAt && admittedUntil <= proofDeadline && admittedUntil <= reservedAt + reservation.max_runtime_seconds * 1000, 'atomic absolute admission window changed');
    this.submitted.add(request.request_sha256);
    this.deadline = Math.min(this.deadline, admittedUntil, admissionStarted + reservation.max_runtime_seconds * 1000);
    this.monotonicDeadline = Math.min(this.monotonicDeadline, monotonicStarted + reservation.max_runtime_seconds * 1000, performance.now() + admittedUntil - this.now());
    const record = { job_id: jobId, account_id: input.account_id, attempt_id: reservation.attempt_id, request_sha256: request.request_sha256, executor_source_sha: sourceSha, credential_sha256: request.credential_sha256, semantic_headers_sha256: request.semantic_headers_sha256, source_input_sha256: this.sourceSpecSha256, content_type: request.content_type, status: 'unknown-outcome', reconciliation_required: true };
    this.records.push(record);
    if (this.evidenceDir) fs.writeFileSync(path.join(this.evidenceDir, `spend-attempt-${request.request_sha256}.json`), `${JSON.stringify(record, null, 2)}\n`);
    try {
      need(verifiedSourceSha(this.env) === sourceSha, 'executor source changed after reservation');
      protectedBinding(preflight.envelope, { ...input, checked_at: this.now() });
      const response = await this.fetch(request.endpoint, { method: 'POST', headers: request.headers, body: request.body, redirect: 'error', signal: AbortSignal.timeout(this.remainingMs(120000)) });
      const payload = await boundedJson(response, MAX_GATEWAY_BYTES);
      this.remainingMs(120000);
      record.http_status = response.status;
      need(response.ok, `paid provider returned HTTP ${response.status}; no automatic retry`);
      record.status = 'submission-returned';
      record.reported_task_id = typeof (payload.id || payload.result || payload.uuid || payload.data?.task_id) === 'string' ? (payload.id || payload.result || payload.uuid || payload.data.task_id) : null;
      return { payload, response };
    } finally {
      // Worker reports are observations only. Gateway retains the entire hold until
      // authentic independent charge reconciliation; no local charge or retry claim.
      try { await this.gateway('record', { ...input, attempt_id: reservation.attempt_id, status: record.status === 'submission-returned' ? 'succeeded' : 'failed', request_id: record.reported_task_id || undefined }); } catch { record.outcome_delivery = 'unknown'; }
      if (this.evidenceDir) fs.writeFileSync(path.join(this.evidenceDir, `spend-attempt-${request.request_sha256}.json`), `${JSON.stringify(record, null, 2)}\n`);
    }
  }
}
