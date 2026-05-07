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

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function env(name: string) {
  return stringValue(process.env[name]);
}

async function postJson(url: string, headers: Record<string, string>, body: JsonRecord) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`Provider request failed ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }

  return payload as JsonRecord;
}

async function fetchBinary(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Provider artifact fetch failed ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

function firstUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('http')) return value;
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

async function renderReplicate(input: GenerateRequest, definition: AssetTypeDefinition): Promise<ProviderRenderResult | null> {
  const apiKey = env('REPLICATE_API_TOKEN');
  const version = definition.canonicalType === 'model3d'
    ? env('ASSET_FACTORY_MODEL3D_MODEL')
    : definition.canonicalType === 'audio'
      ? env('ASSET_FACTORY_AUDIO_MODEL')
      : env('ASSET_FACTORY_GRAPHICS_MODEL');
  if (!apiKey || !version) return null;

  const prediction = await postJson(
    'https://api.replicate.com/v1/predictions',
    { authorization: `Token ${apiKey}` },
    { version, input: { prompt: input.prompt } }
  );

  let current = prediction;
  const getUrl = stringValue((prediction.urls as JsonRecord | undefined)?.get);
  for (let attempt = 0; attempt < 60 && getUrl; attempt += 1) {
    const status = stringValue(current.status);
    if (status === 'succeeded') break;
    if (status === 'failed' || status === 'canceled') throw new Error(`Replicate prediction ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    current = await postJson(getUrl, { authorization: `Token ${apiKey}` }, {});
  }

  const outputUrl = firstUrl(current.output);
  if (!outputUrl) throw new Error('Replicate prediction did not return a downloadable output URL');
  const binary = await fetchBinary(outputUrl);
  return {
    assetBuffer: binary.buffer,
    assetMimeType: binary.mimeType,
    extension: extensionFromMime(binary.mimeType, definition.extension),
    metadata: { provider: 'replicate', providerModel: version, predictionId: current.id },
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
