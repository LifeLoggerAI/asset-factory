import { spawn } from 'node:child_process';

const base =
  process.env.ASSET_FACTORY_BASE_URL ||
  process.env.BASE_URL ||
  'http://127.0.0.1:3000';

const shouldSpawnDevServer =
  !process.env.ASSET_FACTORY_BASE_URL && !process.env.BASE_URL;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `${path} -> ${response.status} ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`
    );
  }

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
  { type: 'graphic', extension: 'svg', prompt: 'e2e graphic proof' },
  { type: 'model3d', extension: 'gltf', prompt: 'e2e model proof' },
  { type: 'audio', extension: 'wav', prompt: 'e2e sound proof', metadata: { durationSeconds: 1 } },
  { type: 'bundle', extension: 'json', prompt: 'e2e bundle proof', metadata: { assets: [] } },
];

async function exerciseCase(testCase) {
  const requestedJobId = `e2e-${testCase.type}-${Date.now()}`;
  const generateResult = await requestJson('/api/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jobId: requestedJobId,
      tenantId: 'e2e',
      prompt: testCase.prompt,
      type: testCase.type,
      metadata: testCase.metadata ?? {},
    }),
  });

  const jobId = generateResult?.jobId || requestedJobId;

  const materialized = await requestJson(`/api/jobs/${jobId}/materialize`, {
    method: 'POST',
  });

  if (materialized?.asset?.manifest?.metadata?.canonicalType !== testCase.type) {
    throw new Error(`${testCase.type} manifest canonicalType mismatch`);
  }

  await requestJson(`/api/jobs/${jobId}`);
  await requestJson(`/api/assets/${jobId}`);
  await request(`/api/generated-assets/${jobId}.${testCase.extension}`);
  await requestJson(`/api/generated-assets/${jobId}.json`);

  await requestJson(`/api/jobs/${jobId}/publish`, {
    method: 'POST',
  });

  await requestJson(`/api/jobs/${jobId}/approve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      status: 'approved',
    }),
  });

  return jobId;
}

async function run() {
  let dev;
  let startedByScript = false;

  try {
    const alreadyUp = await waitForServer(2000);

    if (!alreadyUp && shouldSpawnDevServer) {
      startedByScript = true;

      const studioDir = process.cwd().endsWith('assetfactory-studio')
        ? '.'
        : 'assetfactory-studio';

      dev = spawn(
        'bash',
        ['-lc', `cd ${studioDir} && npm run dev -- --hostname 127.0.0.1 --port 3000`],
        {
          stdio: 'inherit',
        }
      );

      const up = await waitForServer(120000);

      if (!up) {
        throw new Error('server failed to boot');
      }
    }

    if (!alreadyUp && !shouldSpawnDevServer) {
      const up = await waitForServer(120000);

      if (!up) {
        throw new Error(`server failed to respond at ${base}`);
      }
    }

    const manifest = await requestJson('/api/system/manifest');
    for (const testCase of cases) {
      if (!manifest.supportedAssetTypes?.some((assetType) => assetType.canonicalType === testCase.type)) {
        throw new Error(`system manifest missing ${testCase.type}`);
      }
      await exerciseCase(testCase);
    }

    const usage = await requestJson('/api/usage');
    if (!usage?.assetsByType?.graphic || !usage?.assetsByType?.audio || !usage?.assetsByType?.model3d) {
      throw new Error('usage metrics missing multimodal asset counts');
    }

    console.log('PASS E2E multimodal assets');
  } catch (error) {
    console.error('FAIL', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    if (startedByScript && dev && !dev.killed) {
      dev.kill('SIGTERM');
    }
  }
}

await run();