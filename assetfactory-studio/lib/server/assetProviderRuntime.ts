import type { GenerateRequest } from './assetFactoryValidation';
import type { AssetTypeDefinition } from './assetTypeCatalog';
import { configuredProviderName, isAssetProviderName, type AssetProviderName } from './assetProviderAdapters';

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

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
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
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isPrivateIpv4(hostname) ||
    isPrivateIpv6(hostname)
  ) {
    throw new Error('Provider artifact URL points to a private or local host');
  }

  return parsed.toString();
}

function assertTrustedProviderHost(url: string, expectedHostname: string) {
  const safeUrl = assertPublicProviderUrl(url);
  const parsed = new URL(safeUrl);
  if (parsed.hostname.toLowerCase() !== expectedHostname.toLowerCase()) {
    throw new Error(`Provider authenticated URL must remain on ${expectedHostname}`);
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
  if (mimeType.includes('gltf-binary')) return 'glb';
  if (mimeType.includes('gltf')) return 'gltf';
  if (mimeType.includes('glb')) return 'glb';
  return fallback;
}

function providerFromEnv(name: string): AssetProviderName | null {
  const value = env(name).toLowerCase();
  if (!value) return null;
  if (!isAssetProviderName(value)) throw new Error(`Invalid ${name} provider: ${value}`);
  return value;
}

function openAiImageSize(input: GenerateRequest) {
  const requested = input.size?.width && input.size?.height
    ? `${input.size.width}x${input.size.height}`
    : env('ASSET_FACTORY_GRAPHICS_SIZE') || '1024x1024';
  if (requested === 'auto') return requested;

  const match = /^(\d+)x(\d+)$/.exec(requested);
  if (!match) throw new Error(`Invalid OpenAI image size: ${requested}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const pixels = width * height;
  if (
    width % 16 !== 0 ||
    height % 16 !== 0 ||
    longEdge > 3840 ||
    longEdge / shortEdge > 3 ||
    pixels < 655_360 ||
    pixels > 8_294_400
  ) {
    throw new Error(
      `OpenAI image size ${requested} violates GPT Image 2.5 bounds: edges must be multiples of 16, max edge 3840, aspect ratio <= 3:1, total pixels 655360..8294400`
    );
  }
  return requested;
}

function audioLane(input: GenerateRequest): 'speech' | 'sfx' | 'music' | 'audio' {
  const raw = String(input.type ?? '').trim().toLowerCase();
  if (raw === 'music') return 'music';
  if (['sfx', 'sound', 'ambience'].includes(raw)) return 'sfx';
  if (['voice', 'speech', 'tts', 'narration', 'narrator'].includes(raw)) return 'speech';
  return 'audio';
}

export function configuredProviderForRequest(
  input: GenerateRequest,
  definition: AssetTypeDefinition
): AssetProviderName {
  if (definition.canonicalType === 'graphic') {
    return providerFromEnv('ASSET_FACTORY_IMAGE_PROVIDER') ?? configuredProviderName();
  }
  if (definition.canonicalType === 'model3d') {
    return providerFromEnv('ASSET_FACTORY_MODEL3D_PROVIDER') ?? configuredProviderName();
  }
  if (definition.canonicalType === 'audio') {
    const lane = audioLane(input);
    const laneVariable = lane === 'music'
      ? 'ASSET_FACTORY_MUSIC_PROVIDER'
      : lane === 'sfx'
        ? 'ASSET_FACTORY_SFX_PROVIDER'
        : 'ASSET_FACTORY_AUDIO_PROVIDER';
    return providerFromEnv(laneVariable)
      ?? providerFromEnv('ASSET_FACTORY_AUDIO_PROVIDER')
      ?? configuredProviderName();
  }
  return configuredProviderName();
}

async function renderOpenAi(input: GenerateRequest, definition: AssetTypeDefinition): Promise<ProviderRenderResult | null> {
  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) return null;

  if (definition.canonicalType === 'graphic') {
    const size = openAiImageSize(input);
    const model = env('ASSET_FACTORY_OPENAI_IMAGE_MODEL') || env('ASSET_FACTORY_GRAPHICS_MODEL') || 'gpt-image-2.5-sunburst';
    const configuredFormat = (env('ASSET_FACTORY_OPENAI_IMAGE_FORMAT') || env('ASSET_FACTORY_GRAPHICS_FORMAT') || 'png').toLowerCase();
    const outputFormat = configuredFormat === 'jpg' ? 'jpeg' : configuredFormat;
    if (!['png', 'jpeg', 'webp'].includes(outputFormat)) {
      throw new Error(`Invalid OpenAI image output format: ${configuredFormat}`);
    }
    const payload = await postJson(
      'https://api.openai.com/v1/images/generations',
      { authorization: `Bearer ${apiKey}` },
      {
        model,
        prompt: input.prompt,
        size,
        quality: env('ASSET_FACTORY_OPENAI_IMAGE_QUALITY') || 'high',
        output_format: outputFormat,
      }
    );
    const data = Array.isArray(payload.data) ? payload.data[0] as JsonRecord | undefined : undefined;
    const b64 = stringValue(data?.b64_json);
    const url = stringValue(data?.url);
    if (b64) {
      const mimeType = outputFormat === 'jpeg' ? 'image/jpeg' : `image/${outputFormat}`;
      return {
        assetBuffer: Buffer.from(b64, 'base64'),
        assetMimeType: mimeType,
        extension: outputFormat === 'jpeg' ? 'jpg' : outputFormat,
        metadata: { provider: 'openai', providerModel: model, providerOutput: 'b64_json', outputFormat },
      };
    }
    if (url) {
      const binary = await fetchBinary(url);
      return {
        assetBuffer: binary.buffer,
        assetMimeType: binary.mimeType,
        extension: extensionFromMime(binary.mimeType, outputFormat === 'jpeg' ? 'jpg' : outputFormat),
        metadata: { provider: 'openai', providerModel: model, providerOutput: 'url', outputFormat },
      };
    }
    throw new Error('OpenAI image response did not include b64_json or url');
  }

  if (definition.canonicalType === 'audio') {
    const model = env('ASSET_FACTORY_OPENAI_SPEECH_MODEL') || env('ASSET_FACTORY_AUDIO_MODEL') || 'gpt-4o-mini-tts';
    const voice = env('ASSET_FACTORY_OPENAI_VOICE');
    if (!voice) throw new Error('ASSET_FACTORY_OPENAI_VOICE must be explicitly configured; stock voice fallback is prohibited');
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

async function readAudioResponse(
  response: Response,
  provider: string,
  metadata: Record<string, unknown>
): Promise<ProviderRenderResult> {
  if (!response.ok) throw new Error(`${provider} audio request failed ${response.status}: ${await response.text()}`);
  const buffer = await readBinaryWithLimit(response, providerMaxBytes());
  const mimeType = response.headers.get('content-type') ?? 'audio/mpeg';
  return {
    assetBuffer: buffer,
    assetMimeType: mimeType,
    extension: extensionFromMime(mimeType, 'mp3'),
    metadata,
  };
}

async function renderElevenLabs(input: GenerateRequest): Promise<ProviderRenderResult | null> {
  const apiKey = env('ELEVENLABS_API_KEY');
  if (!apiKey) return null;
  const lane = audioLane(input);
  const zeroRetention = enabled('ELEVENLABS_ZERO_RETENTION');
  const outputFormat = env('ELEVENLABS_OUTPUT_FORMAT') || 'mp3_44100_128';

  if (lane === 'sfx') {
    const modelId = env('ASSET_FACTORY_ELEVENLABS_SFX_MODEL') || 'eleven_text_to_sound_v2';
    const endpoint = new URL('https://api.elevenlabs.io/v1/sound-generation');
    endpoint.searchParams.set('output_format', outputFormat);
    const durationSeconds = Math.max(0.5, Math.min(30, Number(input.metadata?.durationSeconds ?? 4)));
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text: input.prompt,
        model_id: modelId,
        duration_seconds: durationSeconds,
        loop: input.metadata?.loop === true,
        prompt_influence: Math.max(0, Math.min(1, Number(input.metadata?.promptInfluence ?? 0.3))),
      }),
      signal: providerAbortSignal(),
    });
    return readAudioResponse(response, 'ElevenLabs sound-effects', {
      provider: 'elevenlabs',
      providerModel: modelId,
      elevenLabsLane: 'sfx',
      durationSeconds,
      loop: input.metadata?.loop === true,
    });
  }

  if (lane === 'music') {
    const modelId = env('ASSET_FACTORY_ELEVENLABS_MUSIC_MODEL') || 'music_v2_5';
    const endpoint = new URL('https://api.elevenlabs.io/v1/music');
    endpoint.searchParams.set('output_format', env('ELEVENLABS_MUSIC_OUTPUT_FORMAT') || 'auto');
    const requestedDuration = Number(input.metadata?.durationSeconds ?? 30);
    const musicLengthMs = Math.round(Math.max(3, Math.min(600, requestedDuration)) * 1000);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        prompt: input.prompt,
        music_length_ms: musicLengthMs,
        model_id: modelId,
        force_instrumental: input.metadata?.forceInstrumental !== false,
        sign_with_c2pa: input.metadata?.signWithC2pa === true,
      }),
      signal: providerAbortSignal(),
    });
    return readAudioResponse(response, 'ElevenLabs music', {
      provider: 'elevenlabs',
      providerModel: modelId,
      elevenLabsLane: 'music',
      musicLengthMs,
      forceInstrumental: input.metadata?.forceInstrumental !== false,
    });
  }

  const voiceId = env('ELEVENLABS_VOICE_ID');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID must be explicitly configured; stock voice fallback is prohibited');
  const modelId = env('ASSET_FACTORY_ELEVENLABS_SPEECH_MODEL') || env('ASSET_FACTORY_AUDIO_MODEL') || 'eleven_v3';
  const endpoint = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`);
  endpoint.searchParams.set('output_format', outputFormat);
  if (zeroRetention) endpoint.searchParams.set('enable_logging', 'false');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text: input.prompt, model_id: modelId }),
    signal: providerAbortSignal(),
  });
  return readAudioResponse(response, 'ElevenLabs speech', {
    provider: 'elevenlabs',
    providerModel: modelId,
    voiceId,
    elevenLabsLane: 'speech',
    zeroRetention,
  });
}

async function renderStability(input: GenerateRequest): Promise<ProviderRenderResult | null> {
  const apiKey = env('STABILITY_API_KEY');
  if (!apiKey) return null;
  const configuredService = (env('ASSET_FACTORY_STABILITY_IMAGE_SERVICE') || env('ASSET_FACTORY_GRAPHICS_MODEL') || 'core').toLowerCase();
  const service = configuredService === 'stable-image-core'
    ? 'core'
    : configuredService === 'stable-image-ultra'
      ? 'ultra'
      : configuredService;
  if (!['core', 'ultra'].includes(service)) {
    throw new Error(`Invalid Stability image service: ${configuredService}; expected core or ultra`);
  }
  const response = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/${service}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'image/*',
    },
    body: (() => {
      const form = new FormData();
      form.set('prompt', input.prompt);
      form.set('output_format', env('ASSET_FACTORY_GRAPHICS_FORMAT') || 'png');
      if (input.aspectRatio) form.set('aspect_ratio', input.aspectRatio);
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
    metadata: { provider: 'stability', providerModel: `stable-image-${service}`, providerService: service },
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
    const voiceId = stringValue(input.metadata?.voiceId, env('ASSET_FACTORY_REPLICATE_SPEECH_VOICE'));
    if (!voiceId) {
      throw new Error('ASSET_FACTORY_REPLICATE_SPEECH_VOICE must be explicitly configured; stock voice fallback is prohibited');
    }
    modelInput = {
      text: input.prompt,
      voice_id: voiceId,
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
    const generateType = input.metadata?.generateType === 'Geometry' ? 'Geometry' : 'Normal';
    modelInput = {
      prompt: input.prompt,
      enable_pbr: generateType === 'Normal' && input.metadata?.enablePbr !== false,
      face_count: 40000,
      generate_type: generateType,
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
    current = await getJson(assertTrustedProviderHost(getUrl, 'api.replicate.com'), { authorization: `Bearer ${apiKey}` });
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


async function pollMeshyTask(
  endpoint: string,
  apiKey: string,
  taskId: string
): Promise<JsonRecord> {
  const deadline = Date.now() + providerTimeoutMs();
  while (true) {
    if (Date.now() >= deadline) throw new Error(`Meshy task timed out after ${providerTimeoutMs()}ms`);
    const task = await getJson(`${endpoint}/${encodeURIComponent(taskId)}`, { authorization: `Bearer ${apiKey}` });
    const status = stringValue(task.status).toUpperCase();
    if (status === 'SUCCEEDED') return task;
    if (['FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED'].includes(status)) {
      throw new Error(`Meshy task ${status.toLowerCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, numberFromEnv('ASSET_FACTORY_MESHY_POLL_MS', 3000)));
  }
}

function meshyModelUrl(task: JsonRecord) {
  const urls = task.model_urls;
  if (!urls || typeof urls !== 'object' || Array.isArray(urls)) return null;
  return stringValue((urls as JsonRecord).glb) || firstUrl(urls);
}

function meshyResolution(name: string, fallback: string, allowed: string[]) {
  const value = env(name) || fallback;
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${name}: ${value}; expected ${allowed.join(', ')}`);
  }
  return value;
}

async function renderMeshy(input: GenerateRequest, definition: AssetTypeDefinition): Promise<ProviderRenderResult | null> {
  if (definition.canonicalType !== 'model3d') return null;
  const apiKey = env('MESHY_API_KEY');
  if (!apiKey) return null;

  const metadata = input.metadata ?? {};
  const imageUrls = Array.isArray(metadata.sourceImageUrls)
    ? metadata.sourceImageUrls.filter((value): value is string => typeof value === 'string' && value.startsWith('https://')).slice(0, 4)
    : [];
  const sourceImageUrl = stringValue(metadata.sourceImageUrl);
  const imageModel = env('ASSET_FACTORY_MESHY_MODEL') || 'meshy-7.1';
  let selectedModel = imageModel;
  let endpoint = 'https://api.meshy.ai/openapi/v2/text-to-3d';
  let createBody: JsonRecord;

  if (imageUrls.length > 1) {
    endpoint = 'https://api.meshy.ai/openapi/v1/multi-image-to-3d';
    createBody = {
      image_urls: imageUrls,
      ai_model: imageModel,
      geometry_resolution: meshyResolution('ASSET_FACTORY_MESHY_MULTI_IMAGE_GEOMETRY_RESOLUTION', '2k', ['standard', '2k']),
      should_texture: true,
      enable_pbr: true,
      target_formats: ['glb'],
    };
  } else if (sourceImageUrl || imageUrls[0]) {
    endpoint = 'https://api.meshy.ai/openapi/v1/image-to-3d';
    createBody = {
      image_url: sourceImageUrl || imageUrls[0],
      ai_model: imageModel,
      geometry_resolution: meshyResolution('ASSET_FACTORY_MESHY_GEOMETRY_RESOLUTION', '4k', ['standard', '2k', '4k']),
      should_texture: true,
      enable_pbr: true,
      target_formats: ['glb'],
    };
  } else {
    const textModel = env('ASSET_FACTORY_MESHY_TEXT_MODEL') || imageModel;
    selectedModel = textModel;
    createBody = {
      mode: 'preview',
      prompt: String(input.prompt).slice(0, 800),
      ai_model: textModel,
      geometry_resolution: meshyResolution(
        'ASSET_FACTORY_MESHY_TEXT_GEOMETRY_RESOLUTION',
        env('ASSET_FACTORY_MESHY_GEOMETRY_RESOLUTION') || '4k',
        ['standard', '2k', '4k']
      ),
      model_type: env('ASSET_FACTORY_MESHY_MODEL_TYPE') || 'standard',
      should_remesh: false,
      moderation: true,
      target_formats: ['glb'],
    };
  }

  const created = await postJson(endpoint, { authorization: `Bearer ${apiKey}` }, createBody);
  const taskId = stringValue(created.result);
  if (!taskId) throw new Error('Meshy create response did not include a task id');
  let task = await pollMeshyTask(endpoint, apiKey, taskId);

  if (endpoint.endsWith('/text-to-3d')) {
    const refine = await postJson(endpoint, { authorization: `Bearer ${apiKey}` }, {
      mode: 'refine',
      preview_task_id: taskId,
      enable_pbr: true,
      texture_resolution: env('ASSET_FACTORY_MESHY_TEXTURE_RESOLUTION') || '4k',
      target_formats: ['glb'],
      auto_size: enabled('ASSET_FACTORY_MESHY_AUTO_SIZE'),
    });
    const refineId = stringValue(refine.result);
    if (!refineId) throw new Error('Meshy refine response did not include a task id');
    task = await pollMeshyTask(endpoint, apiKey, refineId);
  }

  const outputUrl = meshyModelUrl(task);
  if (!outputUrl) throw new Error('Meshy task did not return a GLB artifact URL');
  const binary = await fetchBinary(outputUrl);
  return {
    assetBuffer: binary.buffer,
    assetMimeType: binary.mimeType === 'application/octet-stream' ? 'model/gltf-binary' : binary.mimeType,
    extension: 'glb',
    metadata: {
      provider: 'meshy',
      providerModel: selectedModel,
      providerTaskId: task.id ?? taskId,
      generationMode: endpoint.includes('multi-image') ? 'multi-image-to-3d' : endpoint.includes('image-to-3d') ? 'image-to-3d' : 'text-to-3d',
      pbrRequested: true,
      canonicalCandidateOnly: true,
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
  const provider = configuredProviderForRequest(input, definition);
  if (provider === 'local-proof') return null;
  if (!enabled('ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED')) {
    throw new Error(`External provider ${provider} is selected but ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED is not true`);
  }

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
  if (provider === 'meshy') return renderMeshy(input, definition);
  return null;
}
