#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const READ_ONLY_URLS = new Set(['https://api.meshy.ai/openapi/v1/balance', 'https://openapi.tripo3d.ai/v3/account/balance']);
const MAX_METADATA_BYTES = 65536;

// This metadata read never grants paid execution or protected account authority.
export async function getJson(url, token) {
  if (!READ_ONLY_URLS.has(url) || typeof token !== 'string' || !token || /[\s\u0000-\u001f\u007f]/.test(token)) throw new Error('Provider metadata endpoint or credential is invalid');
  const signal = AbortSignal.timeout(30000);
  const wait = promise => new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(new Error('Provider metadata deadline exceeded')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, () => { cleanup(); reject(new Error('Provider metadata transport failed or redirect rejected')); });
  });
  const response = await wait(Promise.resolve().then(() => fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal })));
  let reader, completed = false;
  try {
    if (!response.body) throw new Error('Provider metadata response is invalid');
    reader = response.body.getReader();
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > MAX_METADATA_BYTES)) throw new Error('Provider metadata response exceeds the byte bound');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '', bytes = 0;
    while (true) {
      const chunk = await wait(reader.read());
      if (chunk.done) { completed = true; break; }
      if (!(chunk.value instanceof Uint8Array) || (bytes += chunk.value.byteLength) > MAX_METADATA_BYTES) throw new Error('Provider metadata response exceeds the byte bound');
      try { text += decoder.decode(chunk.value, { stream: true }); } catch { throw new Error('Provider metadata response is not valid UTF-8'); }
    }
    try { text += decoder.decode(); } catch { throw new Error('Provider metadata response is not valid UTF-8'); }
    if (!response.ok) throw new Error('Provider metadata HTTP request failed');
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('Provider metadata response is not valid JSON'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Provider metadata response must be a JSON object');
    const pending = [[payload, 0]];
    let nodes = 0;
    while (pending.length) {
      const [value, depth] = pending.pop();
      if (++nodes > 4096 || depth > 64 || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('Provider metadata JSON exceeds structural bounds');
      if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push([child, depth + 1]);
    }
    return payload;
  } finally {
    if (reader) {
      if (!completed) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} }
      try { reader.releaseLock(); } catch {}
    }
  }
}

export const providerChecks = [
  { provider: 'meshy', env: 'MESHY_API_KEY', url: 'https://api.meshy.ai/openapi/v1/balance', read: payload => ({ balance: payload.balance ?? null }) },
  { provider: 'tripo', env: 'TRIPO_API_KEY', url: 'https://openapi.tripo3d.ai/v3/account/balance', read: payload => {
    if (payload.code !== 0 || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw new Error('Tripo V3 account metadata is invalid');
    for (const field of ['balance', 'frozen']) {
      const value = payload.data[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw new Error('Tripo V3 account credits are invalid');
    }
    return { balance: payload.data.balance, frozen: payload.data.frozen };
  } },
  { provider: 'rodin', env: 'RODIN_API_KEY', url: null, read: null, note: 'Credential presence only; current generation response records consumed credits. Balance URL is intentionally not guessed.' },
  { provider: 'replicate', env: 'REPLICATE_API_TOKEN', url: null, read: null, note: 'Credential presence only in this forge; existing Asset Factory Replicate runtime owns provider billing.' },
];

export async function providerPreflight({ live = false, env = process.env, readJson = getJson } = {}) {
  const receipt = { schemaVersion: 'urai-model-provider-preflight-v1', live, provider_call_authorized: false, execution_performed: false, protected_account_binding_verified: false, providers: [] };
  for (const check of providerChecks) {
    const configured = Boolean(env[check.env]);
    const row = { provider: check.provider, requiredEnv: check.env, configured, balanceChecked: false };
    if (live && configured && check.url) {
      try { Object.assign(row, check.read(await readJson(check.url, env[check.env])), { balanceChecked: true, status: 'reachable' }); }
      catch (error) {
        const allowed = new Set(['Provider metadata endpoint or credential is invalid', 'Provider metadata deadline exceeded', 'Provider metadata transport failed or redirect rejected', 'Provider metadata response is invalid', 'Provider metadata response exceeds the byte bound', 'Provider metadata response is not valid UTF-8', 'Provider metadata HTTP request failed', 'Provider metadata response is not valid JSON', 'Provider metadata response must be a JSON object', 'Provider metadata JSON exceeds structural bounds', 'Tripo V3 account metadata is invalid', 'Tripo V3 account credits are invalid']);
        Object.assign(row, { status: 'preflight-failed', error: allowed.has(error?.message) ? error.message : 'Provider metadata read failed' });
      }
    } else {
      row.status = configured ? 'configured-not-queried' : 'blocked-missing-credential';
      if (check.note) row.note = check.note;
    }
    receipt.providers.push(row);
  }
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const live = process.argv.includes('--live');
  const receipt = await providerPreflight({ live });
  fs.writeFileSync('model-forge-provider-preflight.json', `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
  if (live && receipt.providers.some(row => row.configured && row.status === 'preflight-failed')) process.exitCode = 1;
}
