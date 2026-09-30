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
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.higgsfield.ai') {
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
  const host = parsed.hostname.toLowerCase();
  if (
    host === ['local', 'host'].join('') ||
    host === '::1' ||
    host.endsWith(`.${['local', 'host'].join('')}`) ||
    host.endsWith('.local') ||
    isPrivateIpv4(host)
  ) {
    throw new Error('Higgsfield output URL points to a private or local host');
  }
  return parsed.toString();
}

function authHeader() {
  const keyId = env('HIGGSFIELD_API_KEY_ID');
  const secret = env('HIGGSFIELD_API_KEY_SECRET');
  if (!keyId || !secret) throw new Error('Higgsfield credentials are not configured');
  return `Key ${keyId}:${secret}`;
}

async function readJson(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { detail: text.slice(0, 1000) };
  }
  if (!response.ok) {
    const detail = typeof body === 'object' && body
      ? JSON.stringify(body).slice(0, 1000)
      : String(body).slice(0, 1000);
    throw new Error(`Higgsfield request failed ${response.status}: ${detail}`);
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
  idempotencyKey: string
): Promise<HiggsfieldCompletedRequest> {
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
  const submit = await fetch(`${HIGGSFIELD_BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(Math.min(timeoutMs, 120_000)),
  });
  let current = await readJson(submit);
  const requestId = String(current.request_id ?? '').trim();
  if (!requestId) throw new Error('Higgsfield response did not include request_id');

  let status = String(current.status ?? '').trim();
  if (status === 'completed') return current as HiggsfieldCompletedRequest;
  if (terminalFailure(status)) {
    throw new Error(`Higgsfield generation ended with status ${status}: ${JSON.stringify(current.error ?? '').slice(0, 1000)}`);
  }

  const statusUrl = assertHiggsfieldApiUrl(
    current.status_url ?? `${HIGGSFIELD_BASE_URL}/requests/${encodeURIComponent(requestId)}/status`
  );
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: { authorization: headers.authorization },
      signal: AbortSignal.timeout(Math.min(120_000, Math.max(1_000, deadline - Date.now()))),
    });
    current = await readJson(response);
    status = String(current.status ?? '').trim();
    if (status === 'completed') return current as HiggsfieldCompletedRequest;
    if (terminalFailure(status)) {
      throw new Error(`Higgsfield generation ended with status ${status}: ${JSON.stringify(current.error ?? '').slice(0, 1000)}`);
    }
    if (status !== 'queued' && status !== 'in_progress') {
      throw new Error(`Higgsfield returned unknown request status: ${status || 'missing'}`);
    }
  }

  throw new Error(`Higgsfield generation timed out after ${timeoutMs}ms`);
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
  const response = await fetch(safeUrl, { signal: AbortSignal.timeout(options.timeoutMs) });
  if (!response.ok) throw new Error(`Higgsfield artifact fetch failed ${response.status}`);

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > options.maxBytes) {
    throw new Error(`Higgsfield artifact exceeds max bytes: ${contentLength}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > options.maxBytes) {
    throw new Error(`Higgsfield artifact exceeds max bytes after download: ${buffer.byteLength}`);
  }

  return {
    buffer,
    mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}
