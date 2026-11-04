/** Actual manual smoke leaf. Issue markers and environment flags never reserve funds. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { isIP } from 'node:net';
import { ModelSpendClient, hash, verifiedSourceSha } from '../model_forge/model-spend-client.mjs';
import { parseGlbContainer } from '../model_forge/glb-container.mjs';
import { retrievePublicArtifact } from '../model_forge/protected-artifact.mjs';
const ENDPOINT = 'https://api.replicate.com/v1/predictions';
const SOURCES = ['scripts/protected-replicate-model3d-smoke.mjs', '.github/workflows/replicate-bounded-model3d-smoke.yml'];
const root = fileURLToPath(new URL('../', import.meta.url));
const need = (ok, reason) => { if (!ok) throw new Error(`PROTECTED_SMOKE_BLOCKED: ${reason}`); };
export function smokeSourceSha(env) {
  const head = verifiedSourceSha(env);
  const git = args => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 5_000 });
  const tracked = git(['ls-files', '--error-unmatch', '--', ...SOURCES]), status = git(['status', '--porcelain', '--untracked-files=all', '--', ...SOURCES]);
  need(tracked.status === 0 && tracked.stdout.trim().split('\n').length === SOURCES.length && status.status === 0 && !status.stdout.trim(), 'actual smoke source is changed or untracked');
  return head;
}
export async function runProtectedReplicateSmoke({ requestPath, outputPath, statusPath, env = process.env, fetchImpl = globalThis.fetch, sleep = wait, spendFactory, sourceVerifier = smokeSourceSha, retrieveArtifact = retrievePublicArtifact }) {
  const model = env.MODEL_VERSION, token = env.REPLICATE_API_TOKEN;
  need(typeof model === 'string' && model.trim() && typeof token === 'string' && token.trim(), 'exact model and API account credential required');
  const body = fs.readFileSync(requestPath), source = sourceVerifier(env);
  need(body.length > 0 && body.length <= 65_536, 'request bytes exceed manual smoke bound');
  const spec = { operation: 'replicate-model3d-smoke', model, request_sha256: hash(body) };
  const configuration = { provider: 'replicate', asset: 'replicate-model3d-smoke', sourceSpecSha256: hash(JSON.stringify(spec)), env: { ...env }, fetchImpl };
  const spend = spendFactory ? spendFactory(configuration) : new ModelSpendClient(configuration);
  const check = () => { spend.checkAdmission(); need(sourceVerifier(env) === source, 'actual smoke source changed during execution'); spend.checkAdmission(); };
  let taskId, replaced = false;
  const pending = outputPath + '.pending';
  async function bytes(response, maximum) {
    need(response.ok && response.body, 'provider read rejected or unavailable');
    const length = response.headers.get('content-length'); need(length === null || (/^\d+$/.test(length) && Number(length) <= maximum), 'provider output exceeds bound');
    const reader = response.body.getReader(), chunks = []; let total = 0;
    try {
      while (true) {
        check(); const { done, value } = await reader.read(); check(); if (done) break;
        total += value.length; if (total > maximum) { await reader.cancel(); need(false, 'provider output exceeds bound'); } chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    check(); return Buffer.concat(chunks, total);
  }
  try {
    const submitted = await spend.submit(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body }, model);
    let payload = submitted.payload;
    need(typeof payload.id === 'string' && /^[A-Za-z0-9_-]+$/.test(payload.id), 'ambiguous prediction identity');
    taskId = payload.id;
    const statusUrl = `${ENDPOINT}/${encodeURIComponent(taskId)}`;
    need(payload.urls?.get === statusUrl, 'status origin or admitted task changed');
    for (let attempt = 0; payload.status !== 'succeeded'; attempt++) {
      check(); need(attempt < 60 && !['failed', 'canceled'].includes(payload.status), 'prediction failed or exceeded polling bound; no generation retry');
      await sleep(Math.min(5_000, spend.remainingMs(5_000))); check();
      const response = await fetchImpl(statusUrl, { method: 'GET', headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(spend.remainingMs(30_000)) });
      check(); payload = JSON.parse((await bytes(response, 65_536)).toString('utf8')); need(payload.id === taskId, 'status changed its admitted task');
    }
    const url = new URL(payload.output);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    need(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !isIP(host) && !host.startsWith('[') && host.includes('.') && !/(^|\.)(local(?:host)?|internal)$/.test(host), 'invalid artifact URL');
    check();
    const artifact = await retrieveArtifact(url.toString(), { hosts: spend.artifactHosts, maxBytes: 104_857_600, timeoutMs: spend.remainingMs(120_000), checkAdmission: check });
    check(); const data = artifact.buffer; parseGlbContainer(data, { requireEmbeddedResources: true }); check();
    fs.writeFileSync(pending, data); check(); fs.renameSync(pending, outputPath); replaced = true; check();
    // Operational evidence retains the unknown/full charge hold; it is not settlement.
    fs.writeFileSync(statusPath, JSON.stringify({ ...payload, charges_reconciled: false, actual_spend_usd: null, protected_attempts: spend.records }) + '\n'); check();
    return { prediction_id: taskId, asset_sha256: hash(data), asset_bytes: data.length, charges_reconciled: false };
  } catch (error) {
    fs.rmSync(pending, { force: true }); if (replaced) fs.rmSync(outputPath, { force: true });
    // A kill action targets only the exact already-created task; it cannot generate or retry.
    // Retain the full gateway hold regardless of whether cancellation reaches the provider.
    if (taskId) try { await fetchImpl(`${ENDPOINT}/${encodeURIComponent(taskId)}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(5_000) }); } catch {}
    throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [requestPath, outputPath, statusPath] = process.argv.slice(2);
  need(requestPath && outputPath && statusPath, 'three explicit artifact paths required');
  const result = await runProtectedReplicateSmoke({ requestPath, outputPath, statusPath });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
  console.log(JSON.stringify(result));
}
