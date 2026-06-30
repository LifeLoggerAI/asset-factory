import { spawn } from 'node:child_process';

if (!process.env.ASSET_FACTORY_BASE_URL && !process.env.BASE_URL) {
  process.env.ASSET_FACTORY_FORCE_LOCAL = 'true';
  process.env.ASSET_FACTORY_REQUIRE_API_KEY = 'false';
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'false';
}

const base = process.env.ASSET_FACTORY_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';
const shouldSpawnDevServer = !process.env.ASSET_FACTORY_BASE_URL && !process.env.BASE_URL;
const tenantId = process.env.ASSET_FACTORY_TENANT_ID || 'e2e';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const apiKey = process.env.ASSET_FACTORY_API_KEY;
  const bearerToken = process.env.ASSET_FACTORY_BEARER_TOKEN;

  if (apiKey) headers['x-api-key'] = apiKey;
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  if (process.env.ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH === 'true') {
    headers['x-tenant-id'] = tenantId;
    headers['x-asset-roles'] = 'publisher';
  }

  return headers;
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: authHeaders(options.headers ?? {}),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return { response, body };
}

async function requestJson(path, options) {
  return (await request(path, options)).body;
}

async function waitForServer(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await requestJson('/api/system/health');
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

const cases = [
  { type: 'graphic', prompt: 'e2e graphic proof', expectedExtension: '.svg' },
  { type: 'model3d', prompt: 'e2e model proof', expectedExtension: '.gltf' },
  { type: 'audio', prompt: 'e2e sound proof', metadata: { durationSeconds: 1 }, expectedExtension: '.wav' },
  { type: 'bundle', prompt: 'e2e bundle proof', metadata: { assets: [] }, expectedExtension: '.json' },
];

async function exerciseCase(testCase) {
  const requestedJobId = `e2e-${testCase.type}-${Date.now()}`;
  const generated = await requestJson('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId: requestedJobId,
      tenantId,
      prompt: testCase.prompt,
      type: testCase.type,
      metadata: testCase.metadata ?? {},
    }),
  });

  const jobId = generated?.jobId || requestedJobId;
  if (generated?.canonicalType !== testCase.type) throw new Error(`${testCase.type} canonicalType mismatch`);
  if (generated?.status !== 'queued') throw new Error(`${testCase.type} generation status mismatch`);

  const jobs = await requestJson('/api/jobs');
  if (!Array.isArray(jobs) || !jobs.some((job) => job.jobId === jobId)) {
    throw new Error(`${testCase.type} job missing from jobs list`);
  }

  const materialized = await requestJson(`/api/jobs/${jobId}/materialize`, { method: 'POST' });
  const asset = materialized?.asset;
  if (!asset?.fileName?.endsWith(testCase.expectedExtension)) {
    throw new Error(`${testCase.type} materialized file extension mismatch`);
  }

  const fetched = await request(`/api/generated-assets/${asset.fileName}`);
  if (!fetched.body) throw new Error(`${testCase.type} generated asset fetch returned empty body`);

  const published = await requestJson(`/api/jobs/${jobId}/publish`, { method: 'POST' });
  if (!published?.asset?.published) throw new Error(`${testCase.type} publish failed`);

  const approved = await requestJson(`/api/jobs/${jobId}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved', approvedBy: 'e2e-smoke' }),
  });
  if (approved?.asset?.approvalStatus !== 'approved') throw new Error(`${testCase.type} approve failed`);

  return jobId;
}

async function run() {
  let dev;
  let startedByScript = false;

  try {
    const alreadyUp = await waitForServer(2000);

    if (!alreadyUp && shouldSpawnDevServer) {
      startedByScript = true;
      const studioDir = process.cwd().endsWith('assetfactory-studio') ? '.' : 'assetfactory-studio';
      dev = spawn(
        'bash',
        ['-lc', `cd ${studioDir} && ASSET_FACTORY_FORCE_LOCAL=true ASSET_FACTORY_REQUIRE_API_KEY=false ASSET_FACTORY_REQUIRE_AUTH=false npm run dev -- --hostname 127.0.0.1 --port 3000`],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            ASSET_FACTORY_FORCE_LOCAL: 'true',
            ASSET_FACTORY_REQUIRE_API_KEY: 'false',
            ASSET_FACTORY_REQUIRE_AUTH: 'false',
          },
        }
      );

      const up = await waitForServer(120000);
      if (!up) throw new Error('server failed to boot');
    }

    if (!alreadyUp && !shouldSpawnDevServer) {
      const up = await waitForServer(120000);
      if (!up) throw new Error(`server failed to respond at ${base}`);
    }

    const manifest = await requestJson('/api/system/manifest');
    for (const testCase of cases) {
      if (!manifest.supportedAssetTypes?.some((assetType) => assetType.canonicalType === testCase.type)) {
        throw new Error(`system manifest missing ${testCase.type}`);
      }
      await exerciseCase(testCase);
    }

    const usage = await requestJson('/api/usage');
    if (!usage) throw new Error('usage endpoint missing');

    console.log('PASS E2E multimodal assets');
  } catch (error) {
    console.error('FAIL', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (startedByScript && dev && !dev.killed) dev.kill('SIGTERM');
  }
}

await run();
