import type { GenerateRequest } from './assetFactoryValidation';

export type VideoProviderRenderResult = {
  assetBuffer: Buffer;
  assetMimeType: string;
  extension: 'mp4' | 'webm';
  metadata: Record<string, unknown>;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_POLL_MS = 2_000;

function env(name: string) {
  return String(process.env[name] ?? '').trim();
}

function numberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.startsWith('127.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonRecord> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) throw new Error(`Video provider request failed ${response.status}: ${text.slice(0, 1000)}`);
  return (body && typeof body === 'object' ? body : {}) as JsonRecord;
}

function firstArtifactUrl(value: unknown): string | null {
  if (typeof value === 'string') return publicUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstArtifactUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as JsonRecord)) {
      const found = firstArtifactUrl(item);
      if (found) return found;
    }
  }
  return null;
}

async function downloadVideo(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), numberEnv('ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Video artifact fetch failed ${response.status}`);
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    const maxBytes = numberEnv('ASSET_FACTORY_VIDEO_PROVIDER_MAX_BYTES', DEFAULT_MAX_BYTES);
    if (contentLength > maxBytes) throw new Error(`Video artifact exceeds max bytes: ${contentLength}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new Error(`Video artifact exceeds max bytes after download: ${buffer.byteLength}`);
    const mime = response.headers.get('content-type') ?? 'video/mp4';
    return { buffer, mime };
  } finally {
    clearTimeout(timeout);
  }
}

function videoMetadata(input: GenerateRequest) {
  const metadata = input.metadata ?? {};
  const durationSeconds = Number(metadata.durationSeconds ?? 4);
  const fps = Number(metadata.fps ?? 24);
  const motionStrength = Number(metadata.motionStrength ?? 0.75);
  const referenceImageUrl = publicUrl(metadata.referenceImageUrl);
  const referenceVideoUrl = publicUrl(metadata.referenceVideoUrl);
  return {
    durationSeconds: Number.isFinite(durationSeconds) ? Math.min(Math.max(durationSeconds, 1), 20) : 4,
    fps: Number.isFinite(fps) ? Math.min(Math.max(Math.round(fps), 12), 60) : 24,
    motionStrength: Number.isFinite(motionStrength) ? Math.min(Math.max(motionStrength, 0), 1) : 0.75,
    referenceImageUrl,
    referenceVideoUrl,
  };
}

function replicateInput(input: GenerateRequest) {
  const meta = videoMetadata(input);
  const providerInput: JsonRecord = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio || '9:16',
    duration: meta.durationSeconds,
    fps: meta.fps,
  };
  if (meta.referenceImageUrl) providerInput.start_image = meta.referenceImageUrl;
  if (meta.referenceVideoUrl) providerInput.video = meta.referenceVideoUrl;
  if (process.env.ASSET_FACTORY_ALLOW_VIDEO_INPUT_OVERRIDES === 'true' && input.metadata?.providerInput && typeof input.metadata.providerInput === 'object') {
    Object.assign(providerInput, input.metadata.providerInput as JsonRecord);
  }
  return providerInput;
}

async function renderReplicate(input: GenerateRequest): Promise<VideoProviderRenderResult> {
  const token = env('REPLICATE_API_TOKEN');
  if (!token) throw new Error('REPLICATE_API_TOKEN is required for video rendering');
  const model = env('ASSET_FACTORY_REPLICATE_VIDEO_MODEL');
  if (!model) throw new Error('ASSET_FACTORY_REPLICATE_VIDEO_MODEL is required for video rendering');

  const [owner, nameAndVersion] = model.split('/', 2);
  if (!owner || !nameAndVersion) throw new Error('ASSET_FACTORY_REPLICATE_VIDEO_MODEL must be owner/model or owner/model:version');
  const [name, version] = nameAndVersion.split(':', 2);
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    prefer: 'wait=60',
  };
  const createUrl = version
    ? 'https://api.replicate.com/v1/predictions'
    : `https://api.replicate.com/v1/models/${owner}/${name}/predictions`;
  const payload: JsonRecord = { input: replicateInput(input) };
  if (version) payload.version = version;

  let prediction = await fetchJson(createUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
  const deadline = Date.now() + numberEnv('ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  while (!['succeeded', 'failed', 'canceled'].includes(String(prediction.status ?? ''))) {
    if (Date.now() > deadline) throw new Error('Video provider polling timed out');
    const getUrl = publicUrl((prediction.urls as JsonRecord | undefined)?.get);
    if (!getUrl) throw new Error('Video provider response missing prediction polling URL');
    await new Promise((resolve) => setTimeout(resolve, numberEnv('ASSET_FACTORY_VIDEO_PROVIDER_POLL_MS', DEFAULT_POLL_MS)));
    prediction = await fetchJson(getUrl, { headers: { authorization: `Bearer ${token}` } });
  }
  if (prediction.status !== 'succeeded') throw new Error(`Video provider prediction ${String(prediction.status)}: ${JSON.stringify(prediction.error ?? '')}`);
  const artifactUrl = firstArtifactUrl(prediction.output);
  if (!artifactUrl) throw new Error('Video provider did not return a downloadable artifact URL');
  const artifact = await downloadVideo(artifactUrl);
  const extension = artifact.mime.includes('webm') ? 'webm' : 'mp4';
  return {
    assetBuffer: artifact.buffer,
    assetMimeType: artifact.mime,
    extension,
    metadata: {
      provider: 'replicate',
      providerModel: model,
      providerPredictionId: prediction.id ?? null,
      video: videoMetadata(input),
    },
  };
}

async function renderConfiguredHttpProvider(input: GenerateRequest, provider: 'fal' | 'runway'): Promise<VideoProviderRenderResult> {
  const endpoint = env(`ASSET_FACTORY_${provider.toUpperCase()}_VIDEO_ENDPOINT`);
  const apiKey = provider === 'fal' ? env('FAL_KEY') : env('RUNWAY_API_KEY');
  if (!endpoint || !apiKey) throw new Error(`${provider} video runtime requires an approved endpoint and API key`);
  const safeEndpoint = publicUrl(endpoint);
  if (!safeEndpoint) throw new Error(`${provider} video endpoint must be a public HTTP(S) URL`);
  const result = await fetchJson(safeEndpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: input.prompt, aspectRatio: input.aspectRatio || '9:16', ...videoMetadata(input) }),
  });
  const artifactUrl = firstArtifactUrl(result.output ?? result.video ?? result.url);
  if (!artifactUrl) throw new Error(`${provider} video endpoint did not return an artifact URL`);
  const artifact = await downloadVideo(artifactUrl);
  return {
    assetBuffer: artifact.buffer,
    assetMimeType: artifact.mime,
    extension: artifact.mime.includes('webm') ? 'webm' : 'mp4',
    metadata: { provider, providerModel: result.model ?? null, providerJobId: result.id ?? null, video: videoMetadata(input) },
  };
}

export async function renderVideoWithConfiguredProvider(input: GenerateRequest): Promise<VideoProviderRenderResult | null> {
  const provider = env('ASSET_FACTORY_VIDEO_PROVIDER') || env('ASSET_FACTORY_MEDIA_PROVIDER') || 'local-proof';
  if (provider === 'local-proof') return null;
  if (provider === 'replicate') return renderReplicate(input);
  if (provider === 'fal') return renderConfiguredHttpProvider(input, 'fal');
  if (provider === 'runway') return renderConfiguredHttpProvider(input, 'runway');
  throw new Error(`Configured provider ${provider} does not support canonical video rendering`);
}
