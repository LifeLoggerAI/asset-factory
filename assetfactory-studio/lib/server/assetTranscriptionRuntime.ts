import { createHash } from 'node:crypto';

type TranscriptWord = {
  text?: string;
  start?: number;
  end?: number;
  type?: string;
  speaker_id?: string;
  logprob?: number;
};

export type AssetTranscriptionResult = {
  provider: 'elevenlabs';
  providerModel: string;
  languageCode?: string;
  languageProbability?: number;
  text: string;
  words: TranscriptWord[];
  sourceSha256: string;
  sourceBytes: number;
  sourceMimeType: string;
};

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

function env(name: string) {
  return String(process.env[name] ?? '').trim();
}

function configuredMaxBytes() {
  const value = Number(process.env.ASSET_FACTORY_STT_MAX_BYTES);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_BYTES;
}

export async function transcribeAssetFile(input: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  languageCode?: string;
}): Promise<AssetTranscriptionResult> {
  const provider = env('ASSET_FACTORY_STT_PROVIDER') || 'local-proof';
  if (provider === 'local-proof') throw new Error('STT provider is not activated');
  if (provider !== 'elevenlabs') throw new Error(`Unsupported STT provider: ${provider}`);
  if (process.env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED !== 'true') {
    throw new Error('External STT provider is selected but ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED is not true');
  }

  const apiKey = env('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required for STT');
  if (!input.bytes.length) throw new Error('Transcription source is empty');
  if (input.bytes.length > configuredMaxBytes()) throw new Error('Transcription source exceeds ASSET_FACTORY_STT_MAX_BYTES');

  const modelId = env('ASSET_FACTORY_ELEVENLABS_STT_MODEL') || 'scribe_v2';
  const endpoint = new URL('https://api.elevenlabs.io/v1/speech-to-text');
  if (process.env.ELEVENLABS_ZERO_RETENTION === 'true') endpoint.searchParams.set('enable_logging', 'false');

  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType || 'application/octet-stream' }), input.filename || 'source-audio');
  form.set('model_id', modelId);
  form.set('diarize', 'true');
  form.set('tag_audio_events', 'true');
  if (input.languageCode) form.set('language_code', input.languageCode);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  const raw = await response.text();
  if (!response.ok) throw new Error(`ElevenLabs STT request failed ${response.status}: ${raw.slice(0, 1000)}`);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('ElevenLabs STT returned invalid JSON');
  }

  const text = String(payload.text ?? '').trim();
  if (!text) throw new Error('ElevenLabs STT returned an empty transcript');
  const words = Array.isArray(payload.words) ? payload.words as TranscriptWord[] : [];

  return {
    provider: 'elevenlabs',
    providerModel: modelId,
    languageCode: typeof payload.language_code === 'string' ? payload.language_code : undefined,
    languageProbability: typeof payload.language_probability === 'number' ? payload.language_probability : undefined,
    text,
    words,
    sourceSha256: createHash('sha256').update(input.bytes).digest('hex'),
    sourceBytes: input.bytes.length,
    sourceMimeType: input.mimeType || 'application/octet-stream',
  };
}
