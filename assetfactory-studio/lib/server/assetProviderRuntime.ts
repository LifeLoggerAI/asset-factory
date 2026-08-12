import type { GenerateRequest } from './assetFactoryValidation';
import type { AssetTypeDefinition } from './assetTypeCatalog';
import { configuredProviderName, type AssetProviderName } from './assetProviderAdapters';

type ProviderRenderResult = {
  assetBuffer: Buffer;
  assetMimeType: string;
  extension: string;
  metadata: Record<string, unknown>;
};

type JsonRecord = Record<string, unknown>;

type ReplicateModelSelection = {
  model: string;
  lane: 'graphic' | 'model3d' | 'audio' | 'speech';
  legacyPredictionRoute: boolean;
};

const DEFAULT_PROVIDER_TIMEOUT_MS = 120_000;
const DEFAULT_PROVIDER_MAX_BYTES = 100 * 1024 * 1024;

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function env(name: string) {
  return stringValue(process.env[name]);
}

function enabled(name: string) {
  return process.env[name] === 'true';
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function providerTimeoutMs() {
  return numberFromEnv('ASSET_FACTORY_PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS);
}

function providerMaxBytes() {
  return numberFromEnv('ASSET_FACTORY_PROVIDER_MAX_BYTES', DEFAULT_PROVIDER_MAX_BYTES);
}

function providerAbortSignal() {
  return AbortSignal.timeout(providerTimeoutMs());
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

function assertPublicProviderUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Provider returned an invalid artifact URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Provider artifact URL uses unsupported protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error('Provider artifact URL points to a private or local host');
  }

  return parsed.toString();
}

async function readProviderPayload(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`Provider request failed ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }

  return payload as JsonRecord;
}

async function postJson(url: string, headers: Record<string, string>, body: JsonRecord) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
    signal: providerAbortSignal(),
  });

  return readProviderPayload(response);
}

async function getJson(url: string, headers: Record<string, string>) {
  const response = await fetch(assertPublicProviderUrl(url), {
    method: 'GET',
    headers,
    signal: providerAbortSignal(),
  });

  return readProviderPayload(response);
}

async function readBinaryWithLimit(response: Response, maxBytes: number) {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error(`Provider artifact exceeds max bytes after download: ${buffer.byteLength}`);
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel(`Provider artifact exceeds max bytes during download: ${totalBytes}`).catch(() => {});
        throw new Error(`Provider artifact exceeds max bytes during download: ${totalBytes}`);
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  return Buffer.concat(chunks, totalBytes);
}

async function fetchBinary(url: string, headers: Record<string, string> = {}) {
  const safeUrl = assertPublicProviderUrl(url);
  const response = await fetch(safeUrl, { headers, signal: providerAbortSignal() });
  if (!response.ok) throw new Error(`Provider artifact fetch failed ${response.status}`);

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  const maxBytes = providerMaxBytes();
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Provider artifact exceeds max bytes before download: ${contentLength}`);
  }

  const buffer = await readBinaryWithLimit(response, maxBytes);

  return {
    buffer,
    mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

function firstUrl(value: unknown): string | null {
  if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) return value;
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

function extensionFromMime(mimeType: string, fallback: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('flac')) return 'flac';
  if (mimeType.includes('gltf')) return 'gltf';
  if (mimeType.includes('glb')) return 'glb';
  return fallback;
}

async function renderOpenAi(input: GenerateRequest, definition: AssetTypeDefinition): Promise<ProviderRenderResult | null> {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return null;

  if (definition.canonicalType === 'graphic') {
    const size = input.size?.width && input.size?.height
      ? `${input.size.width}x${input.size.height}`
      : env('ASSET_FACTORY_GRAPHICS_SIZE') || '1024x1024';
    const model = env('ASSET_FACTORY_GRAPHICS_MODEL') || 'gpt-image-1';
    const payload = await postJson(
      'https://api.openai.com/v1/images/generations',
      { authorization: `Bearer ${apiKey}` },
      { model, prompt: input.prompt, size, response_format: 'b64_json' }
    );
    const data = Array.isArray(payload.data) ? payload.data[0] as JsonRecord | undefined : undefined;
    const b64 = stringValue(data?.b64_json);
    const url = stringValue(data?.url);
    if (b64) {
      return {
        assetBuffer: Buffer.from(b64, 'base64'),
        assetMimeType: 'image/png',
        extension: 'png',
        metadata: { provider: 'openai', providerModel: model, providerOutput: 'b64_json' },
      };
    }
    if (url) {
      const binary = await fetchBinary(url);
      return {
        assetBuffer: binary.buffer,
        assetMimeType: binary.mimeType,
        extension: extensionFromMime(binary.mimeType, 'png'),
        metadata: { provider: 'openai', providerModel: model, providerOutput: 'url' },
      };
    }
    throw new Error('OpenAI image response did not include b64_json or url');
  }

  if (definition.canonicalType === 'audio') {
    const model = env('ASSET_FACTORY_AUDIO_MODEL') || 'gpt-4o-mini-tts';
    const voice = env('ASSET_FACTORY_OPENAI_VOICE') || 'alloy';
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, voice, input: input.prompt, response_format: 'wav' }),
      signal: providerAbortSignal(),
    });
    if (!response.ok) throw new Error(`OpenAI audio request failed ${response.status}: ${await response.text()}`);
    return {
      assetBuffer: Buffer.from(await response.arrayBuffer()),
      assetMimeType: response.headers.get('content-type') ?? 'audio/wav',
      extension: 'wav',
      metadata: { provider: 'openai', providerModel: model, voice },
    };
  }

  return null;
}

async function renderElevenLabs(input: GenerateRequest): Promise<ProviderRenderResult | null> {
  const apiKey = env('ELEVENLABS_API_KEY');
  if (!apiKey) return null;
  const voiceId = env('ELEVENLABS_VOICE_ID') || '21m00Tcm4TlvDq8ikWAM';
  const modelId = env('ASSET_FACTORY_AUDIO_MODEL') || 'eleven_multilingual_v2';
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text: input.prompt, model_id: modelId }),
    signal: providerAbortSignal(),
  });
  if (!response.ok) throw new Error(`ElevenLabs audio request failed ${response.status}: ${await response.text()}`);
  return {
    assetBuffer: Buffer.from(await response.arrayBuffer()),
    assetMimeType: response.headers.get('content-type') ?? 'audio/mpeg',
    extension: 'mp3',
    metadata: { provider: 'elevenlabs', providerModel: modelId, voiceId },
  };
}

async function renderStability(input: GenerateRequest): Promise<ProviderRenderResult | null> {
  const apiKey = env('STABILITY_API_KEY');
  if (!apiKey) return null;
  const engine = env('ASSET_FACTORY_GRAPHICS_MODEL') || 'stable-image-core';
  const response = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/${engine}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'image/*',
    },
    body: (() => {
      const form = new FormData();
      form.set('prompt', input.prompt);
      form.set('output_format', env('ASSET_FACTORY_GRAPHICS_FORMAT') || 'png');
      return form;
    })(),
    signal: providerAbortSignal(),
  });
  if (!response.ok) throw new Error(`Stability image request failed ${response.status}: ${await response.text()}`);
  const mimeType = response.headers.get('content-type') ?? 'image/png';
  return {
    assetBuffer: Buffer.from(await response.arrayBuffer()),
    assetMimeType: mimeType,
    extension: extensionFromMime(mimeType, 'png'),
    metadata: { provider: 'stability', providerModel: engine },
  };
}

function replicateLane(input: GenerateRequest, definition: AssetTypeDefinition): ReplicateModelSelection['lane'] {
  if (definition.canonicalType === 'graphic') return 'graphic';
  if (definition.canonicalType === 'model3d') return 'model3d';

  const requestedMode = stringValue(input.metadata?.replicateAudioMode ?? input.metadata?.audioMode).toLowerCase();
  const rawType = String(input.type ?? '').trim().toLowerCase();
  if (
    requestedMode === 'speech' ||
    requestedMode === 'tts' ||
    ['voice', 'speech', 'tts', 'narration', 'narrator'].includes(rawType)
  ) {
    return 'speech';
  }
  return 'audio';
}

function configuredReplicateModel(input: GenerateRequest, definition: AssetTypeDefinition): ReplicateModelSelection | null {
  const lane = replicateLane(input, definition);
  const requestOverride = stringValue(input.metadata?.replicateModel);
  if (requestOverride) {
    if (!enabled('ASSET_FACTORY_ALLOW_REPLICATE_MODEL_OVERRIDE')) {
      throw new Error('replicateModel request override is disabled');
    }
    return { model: requestOverride, lane, legacyPredictionRoute: false };
  }

  const explicit = lane === 'graphic'
    ? env('ASSET_FACTORY_REPLICATE_GRAPHICS_MODEL')
    : lane === 'model3d'
      ? env('ASSET_FACTORY_REPLICATE_MODEL3D_MODEL')
      : lane === 'speech'
        ? env('ASSET_FACTORY_REPLICATE_SPEECH_MODEL')
        : env('ASSET_FACTORY_REPLICATE_AUDIO_MODEL');

  if (explicit) return { model: explicit, lane, legacyPredictionRoute: false };

  const legacy = lane === 'graphic'
    ? env('ASSET_FACTORY_GRAPHICS_MODEL')
    : lane === 'model3d'
      ? env('ASSET_FACTORY_MODEL3D_MODEL')
      : env('ASSET_FACTORY_AUDIO_MODEL');

  if (!legacy) return null;
  return { model: legacy, lane, legacyPredictionRoute: true };
}

function replicateInput(input: GenerateRequest, selection: ReplicateModelSelection): JsonRecord {
  const modelName = selection.model.split(':', 1)[0].toLowerCase();
  let modelInput: JsonRecord;

  if (selection.lane === 'speech' && modelName === 'minimax/speech-02-hd') {
    modelInput = {
      text: input.prompt,
      voice_id: stringValue(input.metadata?.voiceId, env('ASSET_FACTORY_REPLICATE_SPEECH_VOICE') || 'Friendly_Person'),
      emotion: stringValue(input.metadata?.emotion, 'auto'),
      language_boost: stringValue(input.metadata?.languageBoost, 'English'),
      english_normalization: input.metadata?.englishNormalization !== false,
    };
  } else if (selection.lane === 'graphic' && modelName === 'black-forest-labs/flux-schnell') {
    modelInput = {
      prompt: input.prompt,
      num_outputs: 1,
      aspect_ratio: input.aspectRatio || '1:1',
      output_format: env('ASSET_FACTORY_GRAPHICS_FORMAT') || 'webp',
      output_quality: 80,
    };
  } else if (selection.lane === 'audio' && modelName === 'google/lyria-2') {
    modelInput = { prompt: input.prompt };
    const negativePrompt = stringValue(input.metadata?.negativePrompt);
    if (negativePrompt) modelInput.negative_prompt = negativePrompt;
  } else if (selection.lane === 'model3d' && modelName === 'tencent/hunyuan-3d-3.1') {
    modelInput = {
      prompt: input.prompt,
      enable_pbr: input.metadata?.enablePbr === true,
      face_count: 40000,
      generate_type: input.metadata?.generateType === 'Normal' ? 'Normal' : 'Geometry',
    };
  } else {
    modelInput = { prompt: input.prompt };
  }

  const extraInput = input.metadata?.replicateInput;
  if (extraInput !== undefined) {
    if (!enabled('ASSET_FACTORY_ALLOW_REPLICATE_INPUT_OVERRIDES')) {
      throw new Error('replicateInput request overrides are disabled');
    }
    if (!extraInput || typeof extraInput !== 'object' || Array.isArray(extraInput)) {
      throw new Error('replicateInput must be an object');
    }
    modelInput = { ...modelInput, ...(extraInput as JsonRecord) };
  }

  return modelInput;
}

function replicatePredictionRequest(selection: ReplicateModelSelection, input: JsonRecord) {
  const colonIndex = selection.model.lastIndexOf(':');
  if (selection.legacyPredictionRoute || colonIndex > 0) {
    const version = colonIndex > 0 ? selection.model.slice(colonIndex + 1) : selection.model;
    if (!version) throw new Error('Replicate version identifier is empty');
    return {
      url: 'https://api.replicate.com/v1/predictions',
      body: { version, input },
    };
  }

  const [owner, name, ...rest] = selection.model.split('/');
  const safePart = /^[a-zA-Z0-9_.-]+$/;
  if (!owner || !name || rest.length || !safePart.test(owner) || !safePart.test(name)) {
    throw new Error(`Invalid Replicate official model identifier: ${selection.model}`);
  }

  return {
    url: `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
    body: { input },
  };
}

async function renderReplicate(input: GenerateRequest, definition: AssetTypeDefinition): Promise<ProviderRenderResult | null> {
  const apiKey = env('REPLICATE_API_TOKEN');
  const selection = configuredReplicateModel(input, definition);
  if (!apiKey || !selection) return null;

  const request = replicatePredictionRequest(selection, replicateInput(input, selection));
  const prediction = await postJson(
    request.url,
    { authorization: `Bearer ${apiKey}` },
    request.body
  );

  let current = prediction;
  const getUrl = stringValue((prediction.urls as JsonRecord | undefined)?.get);
  const deadline = Date.now() + providerTimeoutMs();
  while (getUrl) {
    const status = stringValue(current.status);
    if (status === 'succeeded') break;
    if (status === 'failed' || status === 'canceled') throw new Error(`Replicate prediction ${status}`);
    if (Date.now() >= deadline) {
      throw new Error(`Replicate prediction timed out after ${providerTimeoutMs()}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    current = await getJson(getUrl, { authorization: `Bearer ${apiKey}` });
  }

  const outputUrl = firstUrl(current.output);
  if (!outputUrl) throw new Error('Replicate prediction did not return a downloadable output URL');
  const binary = await fetchBinary(outputUrl);
  return {
    assetBuffer: binary.buffer,
    assetMimeType: binary.mimeType,
    extension: extensionFromMime(binary.mimeType, definition.extension),
    metadata: {
      provider: 'replicate',
      providerModel: selection.model,
      replicateLane: selection.lane,
      predictionId: current.id,
    },
  };
}

async function renderFal(input: GenerateRequest, definition: AssetTypeDefinition): Promise<ProviderRenderResult | null> {
  const apiKey = env('FAL_KEY');
  const model = definition.canonicalType === 'model3d'
    ? env('ASSET_FACTORY_MODEL3D_MODEL')
    : definition.canonicalType === 'audio'
      ? env('ASSET_FACTORY_AUDIO_MODEL')
      : env('ASSET_FACTORY_GRAPHICS_MODEL');
  if (!apiKey || !model) return null;

  const payload = await postJson(
    `https://fal.run/${model}`,
    { authorization: `Key ${apiKey}` },
    { prompt: input.prompt }
  );
  const outputUrl = firstUrl(payload);
  if (!outputUrl) throw new Error('Fal response did not return a downloadable output URL');
  const binary = await fetchBinary(outputUrl);
  return {
    assetBuffer: binary.buffer,
    assetMimeType: binary.mimeType,
    extension: extensionFromMime(binary.mimeType, definition.extension),
    metadata: { provider: 'fal', providerModel: model },
  };
}

export async function renderWithConfiguredProvider(
  input: GenerateRequest,
  definition: AssetTypeDefinition
): Promise<ProviderRenderResult | null> {
  const provider = configuredProviderName();
  if (provider === 'local-proof') return null;

  const result = await renderProvider(provider, input, definition);
  if (!result) {
    throw new Error(`Configured provider ${provider} cannot render ${definition.canonicalType} or is missing required env`);
  }
  return result;
}

async function renderProvider(
  provider: AssetProviderName,
  input: GenerateRequest,
  definition: AssetTypeDefinition
): Promise<ProviderRenderResult | null> {
  if (provider === 'openai') return renderOpenAi(input, definition);
  if (provider === 'elevenlabs' && definition.canonicalType === 'audio') return renderElevenLabs(input);
  if (provider === 'stability' && definition.canonicalType === 'graphic') return renderStability(input);
  if (provider === 'replicate') return renderReplicate(input, definition);
  if (provider === 'fal') return renderFal(input, definition);
  return null;
}
