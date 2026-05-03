import { spawn } from 'node:child_process';

const base = process.env.ASSET_FACTORY_BASE_URL || 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function requestJson(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
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

async function run() {
  let dev;
  let startedByScript = false;

  try {
    const alreadyUp = await waitForServer(2000);
    if (!alreadyUp) {
      startedByScript = true;
      const studioDir = process.cwd().endsWith('assetfactory-studio') ? '.' : 'assetfactory-studio';
      dev = spawn('bash', ['-lc', `cd ${studioDir} && npm run dev -- --hostname 127.0.0.1 --port 3000`], {
        stdio: 'inherit',
      });

      const up = await waitForServer(120000);
      if (!up) {
        throw new Error('server failed to boot');
      }
    }

    const requestedJobId = `e2e-${Date.now()}`;

    await requestJson('/api/system/manifest');
    const generateResult = await requestJson('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: requestedJobId,
        tenantId: 'e2e',
        prompt: 'e2e prompt',
        type: 'body/neutral',
      }),
    });

    const jobId = generateResult?.jobId || requestedJobId;

    await requestJson(`/api/jobs/${jobId}/materialize`, { method: 'POST' });
    await requestJson(`/api/jobs/${jobId}`);
    await requestJson(`/api/assets/${jobId}`);
    await requestJson(`/api/generated-assets/${jobId}.svg`);
    await requestJson(`/api/generated-assets/${jobId}.json`);
    await requestJson(`/api/jobs/${jobId}/publish`, { method: 'POST' });
    await requestJson(`/api/jobs/${jobId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    console.log('PASS E2E');
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
