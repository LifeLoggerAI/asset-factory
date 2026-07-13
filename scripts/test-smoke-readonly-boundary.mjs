#!/usr/bin/env node
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requests = [];

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  requests.push({ method: request.method ?? 'GET', path: url.pathname, search: url.search });

  if (url.pathname === '/api/system/health' || url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'asset-factory' });
    return;
  }
  if (url.pathname === '/api/system/manifest') {
    if (url.searchParams.get('full') === 'true' && !request.headers['x-asset-factory-key']) {
      sendJson(response, 401, { ok: false });
    } else {
      sendJson(response, 200, { ok: true, service: 'asset-factory' });
    }
    return;
  }
  if (url.pathname === '/api/system/integration-contract') {
    sendJson(response, 200, {
      systems: ['urai-studio', 'urai-spatial', 'urai-jobs'],
      routes: ['/api/generate', '/api/jobs', '/api/admin/queue'],
    });
    return;
  }
  if (url.pathname === '/api/system/openapi') {
    sendJson(response, 200, {
      paths: {
        '/api/support/account-data': {},
        '/api/support/account-deletion': {},
      },
    });
    return;
  }
  if (url.pathname === '/admin/queue') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<main>Operator Console</main>');
    return;
  }
  if (url.pathname === '/api/admin/queue') {
    if (request.headers.authorization || request.headers['x-asset-factory-key']) {
      sendJson(response, 200, { items: [] });
    } else {
      sendJson(response, 401, { ok: false });
    }
    return;
  }

  sendJson(response, 404, { ok: false, path: url.pathname });
});

function runScript(script, baseUrl, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, script)], {
      cwd: root,
      env: {
        ...process.env,
        ASSET_FACTORY_BASE_URL: baseUrl,
        ASSET_FACTORY_SMOKE_READONLY: 'true',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${script} exited ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not expose a TCP address');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const remoteStart = requests.length;
  const remote = await runScript('scripts/smoke-asset-factory-remote.mjs', baseUrl, {
    ASSET_FACTORY_API_KEY: 'test-api-key',
    ASSET_FACTORY_BEARER_TOKEN: 'test-bearer-token',
    ASSET_FACTORY_OTHER_BEARER_TOKEN: 'test-other-token',
  });
  if (!remote.stdout.includes('PASS remote smoke read-only checks')) {
    throw new Error('remote smoke did not prove its read-only exit');
  }
  const remoteRequests = requests.slice(remoteStart);

  const productionStart = requests.length;
  const production = await runScript('scripts/smoke-production-finalization.mjs', baseUrl);
  if (!production.stdout.includes('PASS read-only production finalization smoke')) {
    throw new Error('production finalization smoke did not prove its read-only exit');
  }
  const productionRequests = requests.slice(productionStart);

  for (const [label, observed] of [
    ['remote smoke', remoteRequests],
    ['production finalization smoke', productionRequests],
  ]) {
    if (observed.length === 0) throw new Error(`${label} made no verification requests`);
    const mutations = observed.filter((entry) => entry.method !== 'GET' && entry.method !== 'HEAD');
    if (mutations.length) {
      throw new Error(`${label} issued mutation requests in read-only mode: ${JSON.stringify(mutations)}`);
    }
  }

  const forbiddenPaths = ['/api/assets', '/api/lifemap/events', '/api/generate'];
  for (const entry of requests) {
    if (forbiddenPaths.some((prefix) => entry.path === prefix || entry.path.startsWith(`${prefix}/`))) {
      throw new Error(`read-only smoke reached mutation path ${entry.method} ${entry.path}`);
    }
  }

  console.log('PASS executable read-only smoke boundary');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
