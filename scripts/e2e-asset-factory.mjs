import { spawn } from 'node:child_process';

if (!process.env.ASSET_FACTORY_BASE_URL && !process.env.BASE_URL) {
  process.env.ASSET_FACTORY_FORCE_LOCAL = 'true';
  process.env.ASSET_FACTORY_REQUIRE_API_KEY = 'false';
  process.env.ASSET_FACTORY_REQUIRE_AUTH = 'false';
}

const base = process.env.ASSET_FACTORY_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';
const shouldSpawnDevServer = !process.env.ASSET_FACTORY_BASE_URL && !process.env.BASE_URL;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
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
  { type: 'graphic', prompt: 'e2e graphic proof' },
  { type: 'model3d', prompt: 'e2e model proof' },
  { type: 'audio', prompt: 'e2e sound proof', metadata: { durationSeconds: 1 } },
  { type: 'bundle', prompt: 'e2e bundle proof', metadata: { assets: [] } },
];

async function exerciseCase(testCase) {
  const requestedJobId = `e2e-${testCase.type}-${Date.now()}`;
  const generated = await requestJson('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId: requestedJobId,
      tenantId: 'e2e',
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
