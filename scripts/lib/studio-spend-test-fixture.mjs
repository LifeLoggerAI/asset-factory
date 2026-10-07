// Synthetic client-protocol fixtures only. Never provider authority or real account proof.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const syntheticGatewayUrl = 'https://protected.example.test/api/worker/production-spend';
export const protectedSourceNames = ['protectedProviderRequest.ts', 'assetProviderRuntime.ts', 'assetVideoProviderRuntime.ts', 'higgsfieldClient.ts'];
const hash = value => createHash('sha256').update(value).digest('hex');
function sourceJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(sourceJson).join(',')}]`;
  return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${sourceJson(value[k])}`).join(',')}}`;
}
export function syntheticCleanBuild() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const directory = mkdtempSync(path.join(tmpdir(), 'urai-studio-synthetic-build-'));
  mkdirSync(path.join(directory, 'assetfactory-studio/lib/server'), { recursive: true });
  for (const name of protectedSourceNames) cpSync(path.join(root, 'assetfactory-studio/lib/server', name), path.join(directory, 'assetfactory-studio/lib/server', name));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--quiet'); git('add', '.'); git('-c', 'user.name=Synthetic Fixture', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'Synthetic source fixture, not release authority');
  const sourceSha = git('rev-parse', 'HEAD');
  const keys = ['URAI_SOURCE_SHA', 'ASSET_FACTORY_EXACT_HEAD', 'ASSET_FORGE_SPEND_GATEWAY_URL', 'ASSET_FORGE_SPEND_GATEWAY_ORIGIN', 'ASSET_FORGE_SPEND_WORKER_TOKEN', 'FACTORY_STUDIO_SPEND_JOB_IDS_JSON'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]])), cwd = process.cwd();
  process.chdir(directory);
  process.env.URAI_SOURCE_SHA = sourceSha;
  process.env.ASSET_FORGE_SPEND_GATEWAY_URL = syntheticGatewayUrl;
  process.env.ASSET_FORGE_SPEND_GATEWAY_ORIGIN = new URL(syntheticGatewayUrl).origin;
  process.env.ASSET_FORGE_SPEND_WORKER_TOKEN = 'synthetic-worker-token-not-a-real-credential';
  process.env.FACTORY_STUDIO_SPEND_JOB_IDS_JSON = '{}';
  return { directory, sourceSha, git, restore() { process.chdir(cwd); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } rmSync(directory, { force: true, recursive: true }); } };
}
export function syntheticStudioSpend(input, options, protectedModule) {
  const endpoint = options.endpoint, body = typeof options.body === 'string' ? Buffer.from(options.body) : Buffer.from(options.body);
  const headers = new Headers(options.headers), credentials = Object.fromEntries([...headers.entries()].filter(([key]) => ['authorization', 'xi-api-key', 'x-api-key'].includes(key)));
  const semantic = Object.fromEntries([...headers.entries()].filter(([key]) => !Object.hasOwn(credentials, key)));
  const requestDigest = protectedModule.studioRequestDigest(endpoint, body), inputDigest = protectedModule.studioSourceInputDigest(input), sourceSha = process.env.URAI_SOURCE_SHA;
  const jobId = `SYNTHETIC-${requestDigest}`;
  const observed = new Date(Date.now() - 60_000).toISOString(), expires = new Date(Date.now() + 3_600_000).toISOString();
  const job = { schema_version: 1, job_id: jobId, provider: options.provider, account_id: 'SYNTHETIC-API-ACCOUNT', model_version: options.model, consumer: 'factory-studio', rights_reviewed: true, authority: { repository: 'LifeLoggerAI/asset-factory', sha: sourceSha }, input_sha256: [inputDigest, requestDigest], executor: { source_sha: sourceSha, endpoint, request_sha256: requestDigest, asset: `${input.tenantId || 'default'}/${input.jobId}/${options.lane}`, request_size: String(body.length), content_type: headers.get('content-type'), credential_sha256: hash(sourceJson(credentials)), semantic_headers_sha256: hash(sourceJson(semantic)), source_input_sha256: inputDigest }, budget: { max_usd_micros: 1_000_000, max_credits: 0, max_runtime_seconds: options.runtime ?? 30 }, attempts: [] };
  const mapping = JSON.parse(process.env.FACTORY_STUDIO_SPEND_JOB_IDS_JSON || '{}'); mapping[requestDigest] = jobId;
  job.budget.rates = { usd_micros_per_unit: 1_000_000, credits_per_unit: 0, receipt: 'SYNTHETIC-NOT-PRICE-PROOF', verified_at: observed, expires_at: expires };
  process.env.FACTORY_STUDIO_SPEND_JOB_IDS_JSON = JSON.stringify(mapping);
  const state = { job, reserved: false, observed: [], calls: [], held: false, mutatePreflight: null, mutateReserve: null, failAction: null, loseReserveResponse: false };
  const originalFetch = globalThis.fetch;
  state.wrap = (providerFetch) => async (url, init = {}) => {
    if (String(url) !== syntheticGatewayUrl) return providerFetch(url, init);
    assert.equal(init.redirect, 'error'); assert.equal(init.method, 'POST'); assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${process.env.ASSET_FORGE_SPEND_WORKER_TOKEN}`);
    const fields = JSON.parse(init.body); state.calls.push(fields.action);
    if (state.failAction === fields.action) throw new Error('SYNTHETIC gateway unavailable');
    if (fields.action === 'preflight') {
      for (const key of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type']) assert.equal(fields[key], job.executor[key]);
      const envelope = { job: structuredClone(job), account: { provider: job.provider, account_id: job.account_id, trusted_readback: true, credential_sha256: job.executor.credential_sha256, credential_binding_verified: true, credential_binding_receipt: 'SYNTHETIC-NOT-ACCOUNT-PROOF', observed_at: observed, expires_at: expires }, authority: { binding: structuredClone(job.authority), trusted_readback: true, observed_at: observed, expires_at: expires }, protected_controls: { provider: job.provider, account_id: job.account_id, trusted_readback: true, credential_sha256: job.executor.credential_sha256, semantic_headers_sha256: job.executor.semantic_headers_sha256, source_input_sha256: job.executor.source_input_sha256, content_type: job.executor.content_type, enforcement_source_sha: sourceSha, endpoint, request_sha256: requestDigest, proof_receipt: 'SYNTHETIC-NOT-CONTROL-PROOF', observed_at: observed, expires_at: expires, hard_stop_supported: true, cost_cap_enforced: true, auto_top_up: false, max_usd_micros: job.budget.max_usd_micros, max_credits: job.budget.max_credits, max_runtime_seconds: job.budget.max_runtime_seconds } };
      envelope.protected_pricing = { provider: job.provider, account_id: job.account_id, model_version: job.model_version, request_sha256: job.executor.request_sha256, credential_sha256: job.executor.credential_sha256, semantic_headers_sha256: job.executor.semantic_headers_sha256, source_input_sha256: job.executor.source_input_sha256, content_type: job.executor.content_type, trusted_readback: true, receipt: 'SYNTHETIC-NOT-PRICE-PROOF', observed_at: observed, expires_at: expires, rates: structuredClone(job.budget.rates) };
      state.mutatePreflight?.(envelope, fields);
      return Response.json({ ok: true, envelope, admission_expires_at: expires, provider_call_authorized: false, execution_performed: false });
    }
    if (fields.action === 'reserve') {
      if (state.reserved) return Response.json({ ok: false }, { status: 409 });
      assert.equal(fields.job_digest, protectedModule.protectedJobDigest(job));
      assert.equal(fields.account_id, job.account_id);
      for (const key of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type']) assert.equal(fields[key], job.executor[key]);
      state.reserved = true; state.held = true;
      if (state.loseReserveResponse) throw new Error('SYNTHETIC lost response after reserve');
      const result = { ok: true, attempt_id: 'SYNTHETIC-ATTEMPT', reserved_at: new Date().toISOString(), admission_expires_at: new Date(Date.now() + job.budget.max_runtime_seconds * 1000).toISOString(), job_digest: fields.job_digest, executor_source_sha: sourceSha, max_runtime_seconds: job.budget.max_runtime_seconds, provider_call_authorized: true, execution_performed: false, account_id: job.account_id, credential_sha256: job.executor.credential_sha256, semantic_headers_sha256: job.executor.semantic_headers_sha256, source_input_sha256: job.executor.source_input_sha256, content_type: job.executor.content_type };
      state.mutateReserve?.(result); return Response.json(result);
    }
    if (fields.action === 'record') {
      assert.equal(fields.account_id, job.account_id);
      for (const key of ['credential_sha256', 'semantic_headers_sha256', 'source_input_sha256', 'content_type', 'request_sha256', 'endpoint', 'asset', 'request_size']) assert.equal(fields[key], job.executor[key]);
      assert.equal(fields.provider, job.provider); assert.equal(fields.model, job.model_version); assert.equal(fields.executor_source_sha, job.executor.source_sha);
      assert.equal(fields.attempt_id, 'SYNTHETIC-ATTEMPT'); state.observed.push(fields);
      return Response.json({ ok: true, provider_call_authorized: false, execution_performed: false, reconciliation_required: true });
    }
    throw new Error('Unexpected synthetic gateway action');
  };
  state.restore = () => { globalThis.fetch = originalFetch; };
  return state;
}
