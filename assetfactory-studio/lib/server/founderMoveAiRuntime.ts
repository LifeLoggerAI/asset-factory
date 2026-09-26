type JsonRecord = Record<string, unknown>;

function jsonRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export type MoveAiSingleCameraInput = {
  video: Buffer;
  filename: string;
  deviceLabel?: string;
  metadata?: Record<string, unknown>;
  explicitSubjectConsent: true;
};

export type MoveAiJobSnapshot = {
  id: string;
  state: string | null;
  percentageComplete: number | null;
  outputs: Array<{ key: string; url: string }>;
};

const MOVE_API_ENDPOINT = 'https://api.move.ai/ugc/graphql';
const DEFAULT_TIMEOUT_MS = 120_000;

function env(name: string) {
  return String(process.env[name] ?? '').trim();
}

function enabled(name: string) {
  return env(name).toLowerCase() === 'true';
}

function timeoutSignal() {
  const configured = Number(process.env.ASSET_FACTORY_MOVE_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
  return AbortSignal.timeout(timeoutMs);
}

function requireMoveAiExecutionAuthority() {
  if (!enabled('ASSET_FACTORY_MOVE_AI_ENABLED')) {
    throw new Error('Move AI execution is disabled; set ASSET_FACTORY_MOVE_AI_ENABLED=true only for an authorized private production run');
  }
  if (!enabled('ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED')) {
    throw new Error('Move AI execution requires ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED=true');
  }
  const apiKey = env('MOVE_API_KEY');
  if (!apiKey) throw new Error('MOVE_API_KEY is required for Move AI execution');
  return apiKey;
}

function requireMoveAiOutputUseAuthority() {
  if (!enabled('MOVE_AI_OUTPUT_USE_APPROVED')) {
    throw new Error(
      'Move AI output use is fail-closed. Current Move API terms restrict using outputs as input to another AI system; set MOVE_AI_OUTPUT_USE_APPROVED=true only after the intended use is confirmed permitted.'
    );
  }
}

function trustedHttpsUrl(value: unknown, label: string) {
  if (typeof value !== 'string') throw new Error(`${label} missing`);
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  return parsed.toString();
}

async function graphql<T extends JsonRecord>(apiKey: string, query: string, variables: JsonRecord = {}) {
  const response = await fetch(MOVE_API_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    redirect: 'error',
    signal: timeoutSignal(),
  });
  const raw = await response.text();
  let body: JsonRecord;
  try { body = raw ? jsonRecord(JSON.parse(raw)) : {}; } catch { body = { raw }; }
  if (!response.ok) throw new Error(`Move AI request failed ${response.status}: ${raw.slice(0, 1000)}`);
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`Move AI GraphQL error: ${JSON.stringify(body.errors).slice(0, 1500)}`);
  }
  return (body.data ?? {}) as T;
}

export async function createMoveAiUploadSlot() {
  const apiKey = requireMoveAiExecutionAuthority();
  const data = await graphql<{ createFile?: { id?: string; presignedUrl?: string } }>(
    apiKey,
    'mutation CreateFile { createFile(type: "mp4") { id presignedUrl } }'
  );
  const id = String(data.createFile?.id ?? '').trim();
  const presignedUrl = trustedHttpsUrl(data.createFile?.presignedUrl, 'Move AI presigned upload URL');
  if (!id) throw new Error('Move AI createFile response missing id');
  return { id, presignedUrl };
}

export async function uploadMoveAiSource(
  slot: { id: string; presignedUrl: string },
  input: MoveAiSingleCameraInput
) {
  if (input.explicitSubjectConsent !== true) {
    throw new Error('Move AI source upload requires explicit subject consent');
  }
  if (!input.filename.toLowerCase().endsWith('.mp4')) {
    throw new Error('Move AI single-camera adapter currently accepts MP4 source only');
  }
  const response = await fetch(trustedHttpsUrl(slot.presignedUrl, 'Move AI presigned upload URL'), {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4' },
    body: new Uint8Array(input.video),
    redirect: 'error',
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error(`Move AI source upload failed ${response.status}`);
  return { fileId: slot.id, bytes: input.video.byteLength };
}

export async function createMoveAiSingleCameraTake(
  fileId: string,
  deviceLabel = 'cam01',
  metadata: Record<string, unknown> = {}
) {
  const apiKey = requireMoveAiExecutionAuthority();
  const data = await graphql<{ take?: { id?: string } }>(
    apiKey,
    `mutation CreateSingleCamTake($fileId: ID!, $deviceLabel: String!, $metadata: JSON) {
      take: createSingleCamTake(
        sources: [{ deviceLabel: $deviceLabel, fileId: $fileId, format: MP4 }]
        metadata: $metadata
      ) { id }
    }`,
    { fileId, deviceLabel, metadata }
  );
  const id = String(data.take?.id ?? '').trim();
  if (!id) throw new Error('Move AI createSingleCamTake response missing id');
  return { takeId: id };
}

export async function createMoveAiSingleCameraJob(takeId: string) {
  const apiKey = requireMoveAiExecutionAuthority();
  const data = await graphql<{ job?: { id?: string } }>(
    apiKey,
    `mutation CreateSingleCamJob($takeId: ID!) {
      job: createSingleCamJob(takeId: $takeId) { id }
    }`,
    { takeId }
  );
  const id = String(data.job?.id ?? '').trim();
  if (!id) throw new Error('Move AI createSingleCamJob response missing id');
  return { jobId: id };
}

export async function getMoveAiJob(jobId: string): Promise<MoveAiJobSnapshot> {
  const apiKey = requireMoveAiExecutionAuthority();
  const data = await graphql<{ job?: JsonRecord }>(
    apiKey,
    `query GetJob($jobId: ID!) {
      job: getJob(jobId: $jobId) {
        id
        state
        progress { state percentageComplete }
        outputs { key file { presignedUrl } }
      }
    }`,
    { jobId }
  );
  const job = jsonRecord(data.job);
  const progress = jsonRecord(job.progress);
  const outputs = Array.isArray(job.outputs)
    ? job.outputs.flatMap((value: unknown) => {
        const entry = jsonRecord(value);
        const url = jsonRecord(entry.file).presignedUrl;
        if (typeof url !== 'string' || !url.startsWith('https://')) return [];
        return [{ key: String(entry?.key ?? 'output'), url }];
      })
    : [];
  return {
    id: String(job.id ?? jobId),
    state: typeof progress.state === 'string' ? progress.state : typeof job.state === 'string' ? job.state : null,
    percentageComplete: Number.isFinite(Number(progress.percentageComplete))
      ? Number(progress.percentageComplete)
      : null,
    outputs,
  };
}

export async function downloadMoveAiOutput(url: string) {
  requireMoveAiOutputUseAuthority();
  const response = await fetch(trustedHttpsUrl(url, 'Move AI output URL'), {
    redirect: 'error',
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error(`Move AI output download failed ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
    provider: 'move-ai',
    canonicalCandidateOnly: true,
    aiSystemReuseRestricted: true,
  };
}
