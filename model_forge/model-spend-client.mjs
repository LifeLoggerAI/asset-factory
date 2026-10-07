/** Model Forge client for the protected #436 account gateway; no local approval. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_GATEWAY_BYTES = 65536;
const PROVIDER_ORIGINS = { meshy: 'https://api.meshy.ai', tripo: 'https://api.tripo3d.ai', rodin: 'https://api.hyper3d.com', replicate: 'https://api.replicate.com' };
const EXECUTOR_FILES = ['model_forge/forge.mjs', 'model_forge/model-spend-client.mjs'];
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
  return { endpoint: url.toString(), body, headers, request_sha256: hash(Buffer.concat([Buffer.from(`POST\n${url.toString()}\n`), body])), content_type: headers.get('content-type') || '', request_size: body.length };
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
    this.env = env; this.fetch = fetchImpl; this.now = now; this.records = []; this.deadline = Infinity; this.submitted = new Set();
  }
  remainingMs(maximum) { const remaining = this.deadline - this.now(); need(remaining > 0, 'approved runtime deadline elapsed; reconciliation required'); return Math.max(1, Math.min(remaining, maximum)); }
  async gateway(action, data) {
    const url = httpsEndpoint(this.env.ASSET_FORGE_SPEND_GATEWAY_URL, 'gateway');
    need(url.pathname.endsWith('/api/worker/production-spend') && !url.search, 'canonical gateway route required');
    const token = this.env.ASSET_FORGE_SPEND_WORKER_TOKEN; need(typeof token === 'string' && token.length >= 32, 'protected worker authentication required');
    const response = await this.fetch(url.toString(), { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, ...data }), redirect: 'error', signal: AbortSignal.timeout(Math.min(10000, this.remainingMs(10000))) });
    const result = await boundedJson(response, MAX_GATEWAY_BYTES); need(response.ok && result.ok === true, 'protected gateway rejected or unavailable'); return result;
  }
  savePreviewCheckpoint(taskId, model) {
    const attempt = this.records.at(-1);
    need(this.provider === 'meshy' && typeof taskId === 'string' && taskId && attempt?.reported_task_id === taskId && attempt.status === 'submission-returned', 'preview submission identity missing');
    const checkpoint = { schema_version: 1, provider: 'meshy', asset: this.asset, model, source_spec_sha256: this.sourceSpecSha256, job_id: attempt.job_id, attempt_id: attempt.attempt_id, preview_task_id: taskId, request_sha256: attempt.request_sha256, provider_call_authorized: false };
    if (this.evidenceDir) fs.writeFileSync(path.join(this.evidenceDir, 'meshy-preview-continuation.json'), `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpoint;
  }
  async verifiedPreview(endpoint, init, model) {
    verifiedSourceSha(this.env);
    const checkpoint = this.previewCheckpoint;
    need(this.provider === 'meshy' && checkpoint?.schema_version === 1 && checkpoint.provider === 'meshy' && checkpoint.asset === this.asset && checkpoint.model === model && checkpoint.source_spec_sha256 === this.sourceSpecSha256 && checkpoint.provider_call_authorized === false, 'preview checkpoint identity changed');
    const request = await freezeRequest(endpoint, init, this.provider);
    need(checkpoint.request_sha256 === request.request_sha256 && typeof checkpoint.job_id === 'string' && checkpoint.job_id && typeof checkpoint.attempt_id === 'string' && checkpoint.attempt_id, 'preview checkpoint request changed');
    const snapshot = await this.gateway('snapshot', { job_id: checkpoint.job_id });
    need(snapshot.provider_call_authorized === false && snapshot.execution_performed === false, 'preview snapshot cannot authorize a call');
    const job = snapshot.job;
    need(job?.job_id === checkpoint.job_id && job.provider === this.provider && job.model_version === model && job.executor?.asset === this.asset && job.executor.endpoint === request.endpoint && job.executor.request_sha256 === request.request_sha256 && job.executor.request_size === request.request_size && job.executor.content_type === request.content_type && job.input_sha256?.includes(this.sourceSpecSha256) && job.input_sha256?.includes(request.request_sha256), 'protected preview source/request differs');
    const attempt = job.attempts?.find(a => a.attempt_id === checkpoint.attempt_id);
    need(attempt?.status === 'SUCCEEDED' && attempt.charges_reconciled === true && typeof attempt.task_id === 'string' && attempt.task_id && attempt.task_id === checkpoint.preview_task_id && /^[0-9a-f]{64}$/.test(attempt.charge_receipt_sha256 || ''), 'preview requires authentic successful charge reconciliation');
    return attempt.task_id;
  }
  async submit(endpoint, init, model) {
    need(typeof model === 'string' && model.trim(), 'exact provider model required');
    const sourceSha = verifiedSourceSha(this.env);
    const request = await freezeRequest(endpoint, init, this.provider);
    const binding = { provider: this.provider, model, asset: this.asset, endpoint: request.endpoint, request_sha256: request.request_sha256, request_size: request.request_size, executor_source_sha: sourceSha };
    if (this.evidenceDir) { fs.mkdirSync(this.evidenceDir, { recursive: true }); fs.writeFileSync(path.join(this.evidenceDir, `spend-request-${request.request_sha256}.json`), `${JSON.stringify({ ...binding, source_spec_sha256: this.sourceSpecSha256, content_type: request.content_type, provider_call_authorized: false }, null, 2)}\n`); }
    let jobs; try { jobs = JSON.parse(this.env.MODEL_FORGE_SPEND_JOB_IDS_JSON || '{}'); } catch { need(false, 'job map invalid'); }
    need(jobs && typeof jobs === 'object' && !Array.isArray(jobs), 'job map invalid');
    const jobId = jobs[request.request_sha256]; need(typeof jobId === 'string' && jobId.trim(), `protected exact request job missing (${request.request_sha256})`);
    need(!this.submitted.has(request.request_sha256), 'same session cannot resubmit a paid request');
    const input = { job_id: jobId, ...binding };
    const preflight = await this.gateway('preflight', input);
    need(preflight.provider_call_authorized === false && preflight.execution_performed === false && preflight.envelope, 'preflight is non-authorizing');
    const { job } = preflight.envelope;
    need(job?.job_id === jobId && job.provider === this.provider && job.model_version === model && job.executor?.source_sha === sourceSha, 'approved job identity changed');
    need(job.executor.endpoint === request.endpoint && job.executor.request_sha256 === request.request_sha256 && job.executor.request_size === request.request_size && job.executor.asset === this.asset && job.executor.content_type === request.content_type, 'actual request differs from protected approval');
    need(Array.isArray(job.input_sha256) && job.input_sha256.includes(this.sourceSpecSha256) && job.input_sha256.includes(request.request_sha256), 'approved source/input hashes missing');
    need(job.executor.remote_reference_inputs !== true, 'remote-reference fixity requires a protected materializer');
    const digest = jobDigest(job);
    const reservation = await this.gateway('reserve', { ...input, job_digest: digest });
    need(reservation.provider_call_authorized === true && reservation.execution_performed === false && reservation.job_digest === digest && reservation.executor_source_sha === sourceSha && typeof reservation.attempt_id === 'string' && reservation.attempt_id, 'atomic reservation did not authorize this exact request');
    need(Number.isSafeInteger(reservation.max_runtime_seconds) && reservation.max_runtime_seconds > 0 && reservation.max_runtime_seconds <= 86400, 'approved runtime bound invalid');
    this.submitted.add(request.request_sha256);
    this.deadline = Math.min(this.deadline, this.now() + reservation.max_runtime_seconds * 1000);
    const record = { job_id: jobId, attempt_id: reservation.attempt_id, request_sha256: request.request_sha256, status: 'unknown-outcome', reconciliation_required: true };
    this.records.push(record);
    if (this.evidenceDir) fs.writeFileSync(path.join(this.evidenceDir, `spend-attempt-${request.request_sha256}.json`), `${JSON.stringify(record, null, 2)}\n`);
    try {
      const response = await this.fetch(request.endpoint, { method: 'POST', headers: request.headers, body: request.body, redirect: 'error', signal: AbortSignal.timeout(this.remainingMs(120000)) });
      const payload = await boundedJson(response, MAX_GATEWAY_BYTES);
      record.http_status = response.status;
      need(response.ok, `paid provider returned HTTP ${response.status}; no automatic retry`);
      record.status = 'submission-returned';
      record.reported_task_id = typeof (payload.id || payload.result || payload.uuid || payload.data?.task_id) === 'string' ? (payload.id || payload.result || payload.uuid || payload.data.task_id) : null;
      return { payload, response };
    } finally {
      // Worker reports are observations only. Gateway retains the entire hold until
      // authentic independent charge reconciliation; no local charge or retry claim.
      try { await this.gateway('record', { job_id: jobId, attempt_id: reservation.attempt_id, status: record.status === 'submission-returned' ? 'succeeded' : 'failed', request_id: record.reported_task_id || undefined }); } catch { record.outcome_delivery = 'unknown'; }
      if (this.evidenceDir) fs.writeFileSync(path.join(this.evidenceDir, `spend-attempt-${request.request_sha256}.json`), `${JSON.stringify(record, null, 2)}\n`);
    }
  }
}
