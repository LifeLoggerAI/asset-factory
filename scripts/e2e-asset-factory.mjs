import { spawn } from 'node:child_process';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const shouldSpawnDevServer = !process.env.BASE_URL;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestJson = async (path, options) => {
  const response = await fetch(base + path, options);
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${text}`);
  }

  return body;
};

const dev = shouldSpawnDevServer
  ? spawn('bash', ['-lc', 'cd assetfactory-studio && npm run dev'], {
      stdio: 'ignore',
    })
  : null;

try {
  let serverReady = false;

  for (let i = 0; i < 50; i += 1) {
    try {
      await requestJson('/api/system/health');
      serverReady = true;
      break;
    } catch {
      await sleep(500);
    }
  }

  if (!serverReady) {
    throw new Error('server failed to boot');
  }

  const jobId = `e2e-${Date.now()}`;

  await requestJson('/api/system/manifest');

  await requestJson('/api/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jobId,
      tenantId: 'e2e',
      prompt: 'e2e prompt',
      type: 'body/neutral',
    }),
  });

  await requestJson(`/api/jobs/${jobId}/materialize`, {
    method: 'POST',
  });

  await requestJson(`/api/jobs/${jobId}`);
  await requestJson(`/api/assets/${jobId}`);
  await requestJson(`/api/generated-assets/${jobId}.svg`);
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

  console.log('PASS E2E');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('FAIL', message);
  process.exitCode = 1;
} finally {
  if (dev && !dev.killed) {
    dev.kill('SIGTERM');
  }
}