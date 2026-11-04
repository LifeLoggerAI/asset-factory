import type { GenerateRequest } from './assetFactoryValidation';
import { paidStudioFetch, readStudioProvider, readStudioBytes, observeStudioProviderTask, waitStudioProvider, withProtectedStudioSession } from './protectedProviderRequest';
import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export type HiggsfieldCompletedRequest = JsonRecord & {
  status: 'completed';
  request_id: string;
};

const HIGGSFIELD_BASE_URL = 'https://api.higgsfield.ai';
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_POLL_MS = 2_000;

function env(name: string) {
  return String(process.env[name] ?? '').trim();
}

function numberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeEndpointId(endpointId: string) {
  const value = endpointId.trim();
  if (!value || value.startsWith('/') || value.includes('..') || !/^[a-zA-Z0-9._/-]+$/.test(value)) {
    throw new Error('Invalid Higgsfield endpoint identifier');
  }
  return value;
}

function assertHiggsfieldApiUrl(value: unknown) {
  if (typeof value !== 'string' || !value) throw new Error('Higgsfield request URL is missing');
  const parsed = new URL(value);
  if (parsed.origin !== HIGGSFIELD_BASE_URL || parsed.username || parsed.password) {
    throw new Error('Higgsfield request URL escaped the approved API origin');
  }
  return parsed.toString();
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

function assertPublicArtifactUrl(value: unknown) {
  if (typeof value !== 'string' || !value) throw new Error('Higgsfield output URL is missing');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Higgsfield output URL uses an unsupported protocol');
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    host === ['local', 'host'].join('') ||
    host.includes(':') ||
    host.endsWith(`.${['local', 'host'].join('')}`) ||
    host.endsWith('.local') ||
    isPrivateIpv4(host)
  ) {
    throw new Error('Higgsfield output URL points to a private or local host');
  }
  if (parsed.username || parsed.password) throw new Error('Higgsfield output URL must not contain credentials');
  const approvedOrigins = env('ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!approvedOrigins.includes(parsed.origin)) throw new Error('Higgsfield output origin is not approved by server policy');
  return parsed.toString();
}

function authHeader() {
  const keyId = env('HIGGSFIELD_API_KEY_ID');
  const secret = env('HIGGSFIELD_API_KEY_SECRET');
  if (!keyId || !secret) throw new Error('Higgsfield credentials are not configured');
  return `Key ${keyId}:${secret}`;
}

async function readJson(response: Response): Promise<JsonRecord> {
  const text = (await readStudioBytes(response, 2 * 1024 * 1024)).toString('utf8');
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text.slice(0, 1000) };
  }
  if (!response.ok) {
    throw new Error(`Higgsfield request failed ${response.status}`);
  }
  return (body && typeof body === 'object' ? body : {}) as JsonRecord;
}

function terminalFailure(status: string) {
  return status === 'failed' || status === 'nsfw' || status === 'canceled';
}

export function higgsfieldCredentialsConfigured() {
  return Boolean(env('HIGGSFIELD_API_KEY_ID') && env('HIGGSFIELD_API_KEY_SECRET'));
}

export function higgsfieldIdempotencyKey(jobId: string, lane: string, endpointId: string) {
  return createHash('sha256')
    .update(`urai:higgsfield:${jobId}:${lane}:${endpointId}`)
    .digest('hex');
}

export async function runHiggsfieldGeneration(
  endpointId: string,
  input: JsonRecord,
  idempotencyKey: string,
  sourceInput?: GenerateRequest,
  lane: 'graphic' | 'video' = 'video'
): Promise<HiggsfieldCompletedRequest> {
  return withProtectedStudioSession(sourceInput, async () => {
  const endpoint = safeEndpointId(endpointId);
  const timeoutMs = numberEnv(
    'ASSET_FACTORY_HIGGSFIELD_TIMEOUT_MS',
    numberEnv('ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
  );
  const pollMs = numberEnv(
    'ASSET_FACTORY_HIGGSFIELD_POLL_MS',
    numberEnv('ASSET_FACTORY_VIDEO_PROVIDER_POLL_MS', DEFAULT_POLL_MS)
  );
  const headers = {
    authorization: authHeader(),
    'content-type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  };
  const submit = await paidStudioFetch('higgsfield', endpoint, lane, `${HIGGSFIELD_BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    redirect: 'error',
    signal: AbortSignal.timeout(Math.min(timeoutMs, 120_000)),
  });
  let current = await readJson(submit);
  const requestId = String(current.request_id ?? '').trim();
  if (!requestId) throw new Error('Higgsfield response did not include request_id');
  observeStudioProviderTask(requestId);

  let status = String(current.status ?? '').trim();
  if (status === 'completed') return current as HiggsfieldCompletedRequest;
  if (terminalFailure(status)) {
    throw new Error(`Higgsfield generation ended with status ${status}`);
  }

  const statusUrl = assertHiggsfieldApiUrl(
    current.status_url ?? `${HIGGSFIELD_BASE_URL}/requests/${encodeURIComponent(requestId)}/status`
  );
  if (statusUrl !== `${HIGGSFIELD_BASE_URL}/requests/${encodeURIComponent(requestId)}/status`) throw new Error('Higgsfield status URL differs from admitted request');
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await waitStudioProvider(pollMs);
    const response = await readStudioProvider(statusUrl, {
      method: 'GET',
      headers: { authorization: headers.authorization },
      redirect: 'error',
      signal: AbortSignal.timeout(Math.min(120_000, Math.max(1_000, deadline - Date.now()))),
    });
    current = await readJson(response);
    if (current.request_id !== requestId) throw new Error('Higgsfield status response differs from admitted request');
    status = String(current.status ?? '').trim();
    if (status === 'completed') return current as HiggsfieldCompletedRequest;
    if (terminalFailure(status)) {
      throw new Error(`Higgsfield generation ended with status ${status}`);
    }
    if (status !== 'queued' && status !== 'in_progress') {
      throw new Error(`Higgsfield returned unknown request status: ${status || 'missing'}`);
    }
  }

  throw new Error(`Higgsfield generation timed out after ${timeoutMs}ms`);
  });
}

export function higgsfieldArtifactUrl(result: JsonRecord, kind: 'image' | 'video') {
  const primary = result[kind];
  if (primary && typeof primary === 'object') {
    const url = (primary as JsonRecord).url;
    if (typeof url === 'string' && url) return assertPublicArtifactUrl(url);
  }

  if (kind === 'image' && Array.isArray(result.images)) {
    for (const entry of result.images) {
      if (entry && typeof entry === 'object' && typeof (entry as JsonRecord).url === 'string') {
        return assertPublicArtifactUrl((entry as JsonRecord).url);
      }
    }
  }

  throw new Error(`Higgsfield completed without a ${kind} output URL`);
}

export async function downloadHiggsfieldArtifact(
  url: string,
  options: { maxBytes: number; timeoutMs: number }
) {
  const safeUrl = assertPublicArtifactUrl(url);
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0 || !Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('Invalid Higgsfield artifact budget');
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(options.timeoutMs)]);
  const response = await readStudioProvider(safeUrl, { signal, redirect: 'error' }, { maxBytes: options.maxBytes });
  if (!response.ok) throw new Error(`Higgsfield artifact fetch failed ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > options.maxBytes) {
    controller.abort();
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Higgsfield artifact exceeds max bytes: ${contentLength}`);
  }

  if (!response.body) throw new Error('Higgsfield artifact response body is missing');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > options.maxBytes) throw new Error('Higgsfield artifact exceeds max bytes while streaming');
      chunks.push(value);
    }
  } catch (error) {
    controller.abort();
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks, bytes);

  return {
    buffer,
    mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

