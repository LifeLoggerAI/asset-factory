import type { GenerateRequest } from './assetFactoryValidation';
import { configuredProviderName } from './assetProviderAdapters';

type JsonRecord = Record<string, unknown>;

type VideoProviderResult = {
  assetBuffer: Buffer;
  assetMimeType: string;
  extension: 'mp4' | 'webm' | 'mov';
  metadata: Record<string, unknown>;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

function env(name: string) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function positiveNumber(value: unknown, fallback: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function timeoutMs() {
  return numberFromEnv('ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
}

function maxBytes() {
  return numberFromEnv('ASSET_FACTORY_VIDEO_PROVIDER_MAX_BYTES', DEFAULT_MAX_BYTES);
}

function abortSignal() {
  return AbortSignal.timeout(timeoutMs());
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

function assertPublicUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Video provider returned an invalid artifact URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Video artifact URL must use HTTPS, received ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error('Video artifact URL points to a private or local host');
  }

  return parsed.toString();
}

async function readJson(response: Response) {
  const text = await response.text();
  let payload: JsonRecord;
  try {
    const parsed = JSON.parse(text);
    payload = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : { value: parsed };
  } catch {
    payload = { error: text || 'non-JSON provider response' };
  }
  if (!response.ok) {
    throw new Error(`Video provider request failed ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function postJson(url: string, headers: Record<string, string>, body: JsonRecord) {
  return readJson(await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: abortSignal(),
  }));
}

async function getJson(url: string, headers: Record<string, string>) {
  return readJson(await fetch(assertPublicUrl(url), {
    method: 'GET',
    headers,
    signal: abortSignal(),
  }));
}

function firstUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('https://')) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstUrl(item);
      if (nested) return nested;
    }
  }
  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value as JsonRecord)) {
      const nested = firstUrl(nestedValue);
      if (nested) return nested;
    }
  }
  return null;
}

function extensionFromVideo(mimeType: string, url: string): 'mp4' | 'webm' | 'mov' {
  const lowerMime = mimeType.toLowerCase();
  const lowerUrl = url.toLowerCase().split('?')[0];
  if (lowerMime.includes('webm') || lowerUrl.endsWith('.webm')) return 'webm';
  if (lowerMime.includes('quicktime') || lowerUrl.endsWith('.mov')) return 'mov';
  if (lowerMime.includes('mp4') || lowerUrl.endsWith('.mp4')) return 'mp4';
  throw new Error(`Video provider artifact is not a supported video format: ${mimeType || 'unknown MIME'}`);
}

async function fetchVideo(url: string) {
  const safeUrl = assertPublicUrl(url);
  const response = await fetch(safeUrl, { signal: abortSignal() });
  if (!response.ok) throw new Error(`Video artifact fetch failed ${response.status}`);

  const declaredLength = Number(response.headers.get('content-length'));
  const limit = maxBytes();
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error(`Video artifact exceeds configured byte limit before download: ${declaredLength}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > limit) throw new Error(`Video artifact exceeds configured byte limit: ${buffer.byteLength}`);
    const mimeType = response.headers.get('content-type') ?? '';
    return { buffer, mimeType, extension: extensionFromVideo(mimeType, safeUrl) };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        reader.cancel('video artifact byte limit exceeded').catch(() => {});
        throw new Error(`Video artifact exceeds configured byte limit during download: ${total}`);
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  const mimeType = response.headers.get('content-type') ?? '';
  return {
    buffer: Buffer.concat(chunks, total),
    mimeType,
    extension: extensionFromVideo(mimeType, safeUrl),
  };
}

function providerInput(input: GenerateRequest) {
  const metadata = input.metadata ?? {};
  return {
    prompt: input.prompt,
    duration: positiveNumber(metadata.durationSeconds, 6, 90),
    aspect_ratio: input.aspectRatio ?? '16:9',
    width: input.size?.width ?? 1920,
    height: input.size?.height ?? 1080,
    fps: Math.round(positiveNumber(metadata.fps, 24, 60)),
    negative_prompt: typeof metadata.negativePrompt === 'string' ? metadata.negativePrompt : undefined,
    seed: typeof metadata.seed === 'number' && Number.isFinite(metadata.seed) ? metadata.seed : undefined,
  };
}

async function renderReplicate(input: GenerateRequest, model: string): Promise<VideoProviderResult> {
  const token = env('REPLICATE_API_TOKEN');
  if (!token) throw new Error('REPLICATE_API_TOKEN is required for provider-backed video');

  const headers = { authorization: `Token ${token}` };
  let prediction = await postJson(
    'https://api.replicate.com/v1/predictions',
    headers,
    { version: model, input: providerInput(input) },
  );

  const predictionId = typeof prediction.id === 'string' ? prediction.id : null;
  const getUrl = typeof (prediction.urls as JsonRecord | undefined)?.get === 'string'
    ? String((prediction.urls as JsonRecord).get)
    : '';
  if (!getUrl) throw new Error('Replicate video prediction did not provide a status URL');

  const deadline = Date.now() + timeoutMs();
  while (Date.now() < deadline) {
    const status = typeof prediction.status === 'string' ? prediction.status : '';
    if (status === 'succeeded') break;
    if (status === 'failed' || status === 'canceled') throw new Error(`Replicate video prediction ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    prediction = await getJson(getUrl, headers);
  }

  if (prediction.status !== 'succeeded') throw new Error('Replicate video prediction timed out');
  const outputUrl = firstUrl(prediction.output);
  if (!outputUrl) throw new Error('Replicate video prediction did not return an artifact URL');
  const artifact = await fetchVideo(outputUrl);
  return {
    assetBuffer: artifact.buffer,
    assetMimeType: artifact.mimeType || `video/${artifact.extension}`,
    extension: artifact.extension,
    metadata: {
      provider: 'replicate',
      providerModel: model,
      predictionId,
      productionReady: false,
      reviewRequired: true,
    },
  };
}

async function renderFal(input: GenerateRequest, model: string): Promise<VideoProviderResult> {
  const token = env('FAL_KEY');
  if (!token) throw new Error('FAL_KEY is required for provider-backed video');
  const payload = await postJson(
    `https://fal.run/${model}`,
    { authorization: `Key ${token}` },
    providerInput(input),
  );
  const outputUrl = firstUrl(payload);
  if (!outputUrl) throw new Error('Fal video response did not return an artifact URL');
  const artifact = await fetchVideo(outputUrl);
  return {
    assetBuffer: artifact.buffer,
    assetMimeType: artifact.mimeType || `video/${artifact.extension}`,
    extension: artifact.extension,
    metadata: {
      provider: 'fal',
      providerModel: model,
      productionReady: false,
      reviewRequired: true,
    },
  };
}

export async function renderVideoWithConfiguredProvider(input: GenerateRequest): Promise<VideoProviderResult | null> {
  const provider = configuredProviderName();
  if (provider === 'local-proof') return null;

  const model = env('ASSET_FACTORY_VIDEO_MODEL');
  if (!model) {
    throw new Error(`ASSET_FACTORY_VIDEO_MODEL is required when ${provider} is selected for video generation`);
  }

  if (provider === 'replicate') return renderReplicate(input, model);
  if (provider === 'fal') return renderFal(input, model);

  throw new Error(`Configured provider ${provider} has no verified video adapter`);
}