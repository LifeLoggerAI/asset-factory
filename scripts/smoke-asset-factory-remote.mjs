const base = process.env.ASSET_FACTORY_BASE_URL || process.env.BASE_URL;
const apiKey = process.env.ASSET_FACTORY_API_KEY;
const bearerToken = process.env.ASSET_FACTORY_BEARER_TOKEN;
const otherBearerToken = process.env.ASSET_FACTORY_OTHER_BEARER_TOKEN;
const tenantId = process.env.ASSET_FACTORY_TENANT_ID || 'smoke-tenant-a';
const otherTenantId = process.env.ASSET_FACTORY_OTHER_TENANT_ID || 'smoke-tenant-b';
const cronSecret = process.env.CRON_SECRET || process.env.ASSET_FACTORY_CRON_SECRET;
const skipMutations = process.env.ASSET_FACTORY_SMOKE_READONLY === 'true';
const expectedPersistenceMode = process.env.ASSET_FACTORY_EXPECT_PERSISTENCE_MODE;

const cases = [
  { type: 'graphic', extension: 'svg', prompt: 'remote smoke graphic proof' },
  { type: 'model3d', extension: 'gltf', prompt: 'remote smoke model proof' },
  { type: 'audio', extension: 'wav', prompt: 'remote smoke sound proof', metadata: { durationSeconds: 1 } },
  { type: 'bundle', extension: 'json', prompt: 'remote smoke bundle proof', metadata: { assets: [] } },
];

if (!base) {
  console.error('FAIL ASSET_FACTORY_BASE_URL or BASE_URL is required for remote smoke tests');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function defaultHeaders(extra = {}, token = bearerToken) {
  const headers = {
    'content-type': 'application/json',
    'x-tenant-id': tenantId,
    'x-asset-tenant-id': tenantId,
    'x-asset-role': 'admin',
    'x-asset-roles': 'admin,creator,publisher,viewer',
    ...extra,
  };

  if (apiKey) headers['x-asset-factory-key'] = apiKey;
  if (token) headers.authorization = `Bearer ${token}`;

  return headers;
}

async function request(path, options = {}, expectedStatuses = [200]) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${path} -> expected ${expectedStatuses.join('/')} got ${response.status}: ${
        typeof body === 'string' ? body : JSON.stringify(body)
      }`
    );
  }

  return { response, body };
}

async function requestJson(path, options = {}, expectedStatuses = [200]) {
  return (await request(path, options, expectedStatuses)).body;
}

async function waitForHealth(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await requestJson('/api/system/health');
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error(`health did not respond at ${base}`);
}

async function assertPublicDiagnosticsRedacted() {
  const publicHealth = await requestJson('/api/system/health');
  const publicManifest = await requestJson('/api/system/manifest');

  const publicText = JSON.stringify({ publicHealth, publicManifest }).toLowerCase();
  const sensitiveHints = [
    'private_key',
    'firebase_private_key',
    'service account',
    'client_email',
    'jwks_uri',
    'stripe_webhook_secret',
    'api_key',
  ];

  for (const hint of sensitiveHints) {
    if (publicText.includes(hint)) {
      throw new Error(`public diagnostics appear to expose sensitive hint: ${hint}`);
    }
  }

  if (expectedPersistenceMode && publicText.includes('local-json')) {
    throw new Error(`public diagnostics indicate local-json while ${expectedPersistenceMode} was expected`);
  }

  if (apiKey) {
    await requestJson('/api/system/manifest?full=true', {
      headers: defaultHeaders(),
    });
  } else {
    console.warn('WARN ASSET_FACTORY_API_KEY missing; skipping full diagnostics positive check');
  }

  await requestJson('/api/system/manifest?full=true', {}, [401, 403]);
}

async function assertContractRoutes() {
  const contract = await requestJson('/api/system/integration-contract');
  const openapi = await requestJson('/api/system/openapi');

  const contractText = JSON.stringify(contract).toLowerCase();
  for (const expected of ['urai-studio', 'urai-spatial', 'urai-jobs', '/api/generate', '/api/jobs', '/api/admin/queue']) {
    if (!contractText.includes(expected)) {
      throw new Error(`integration contract missing ${expected}`);
    }
  }

  const openapiText = JSON.stringify(openapi).toLowerCase();
  for (const expected of ['/api/support/account-data', '/api/support/account-deletion']) {
    if (!openapiText.includes(expected)) {
      throw new Error(`openapi contract missing ${expected}`);
    }
  }

  if (!openapi || typeof openapi !== 'object') {
    throw new Error('openapi route did not return JSON metadata');
  }
}

async function assertOperatorQueueSurface() {
  const page = await request('/admin/queue', {}, [200, 307, 308]);
  const pageText = typeof page.body === 'string' ? page.body : JSON.stringify(page.body);
  if (page.response.status === 200 && !pageText.includes('Operator Console') && !pageText.includes('Queue failures')) {
    throw new Error('operator queue page did not include expected operator UI text');
  }

  if (!apiKey && !bearerToken) {
    console.warn('WARN no operator credentials provided; skipping admin queue API positive smoke');
    return;
  }

  const queue = await requestJson('/api/admin/queue?status=dead-lettered&limit=5', {
    headers: defaultHeaders(),
  });

  if (!queue || typeof queue !== 'object' || !('items' in queue)) {
    throw new Error('admin queue API did not return a queue summary with items');
  }

  await requestJson('/api/admin/queue?status=dead-lettered&limit=5', {}, [400, 401, 403, 503]);
}

async function exerciseAssetType(testCase) {
  const requestedJobId = `remote-smoke-${testCase.type}-${Date.now()}`;

  const generated = await requestJson('/api/generate', {
    method: 'POST',
    headers: defaultHeaders(),
    body: JSON.stringify({
      jobId: requestedJobId,
      tenantId,
      prompt: testCase.prompt,
      type: testCase.type,
      metadata: testCase.metadata ?? {},
    }),
  });

  const jobId = generated?.jobId || requestedJobId;

  const materialized = await requestJson(`/api/jobs/${jobId}/materialize`, {
    method: 'POST',
    headers: defaultHeaders(),
  });

  const canonicalType = materialized?.asset?.manifest?.metadata?.canonicalType;
  if (canonicalType !== testCase.type) {
    throw new Error(`${testCase.type} canonical type mismatch: ${canonicalType}`);
  }

  await requestJson(`/api/jobs/${jobId}`, {
    headers: defaultHeaders(),
  });

  await requestJson(`/api/assets/${jobId}`, {
    headers: defaultHeaders(),
  });

  await request(`/api/generated-assets/${jobId}.${testCase.extension}`, {
    headers: defaultHeaders(),
  });

  await requestJson(`/api/generated-assets/${jobId}.json`, {
    headers: defaultHeaders(),
  });

  await requestJson(`/api/jobs/${jobId}/publish`, {
    method: 'POST',
    headers: defaultHeaders(),
  });

  await requestJson(`/api/jobs/${jobId}/approve`, {
    method: 'POST',
    headers: defaultHeaders(),
    body: JSON.stringify({ status: 'approved' }),
  });

  return jobId;
}

async function assertTenantIsolation(jobId) {
  const otherHeaders = defaultHeaders({
    'x-tenant-id': otherTenantId,
    'x-asset-tenant-id': otherTenantId,
  }, otherBearerToken || bearerToken);

  await requestJson(`/api/jobs/${jobId}`, { headers: otherHeaders }, [401, 403, 404]);
  await requestJson(`/api/assets/${jobId}`, { headers: otherHeaders }, [401, 403, 404]);
}

async function assertSupportWorkflows() {
  await requestJson('/api/support/account-data', {}, [401, 403]);
  await requestJson('/api/support/account-deletion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: 'unauthenticated remote smoke deletion request must be rejected' }),
  }, [401, 403]);

  if (!apiKey && !bearerToken) {
    console.warn('WARN no support credentials provided; skipping support workflow positive smoke');
    return;
  }

  const exportResult = await requestJson('/api/support/account-data', {
    headers: defaultHeaders(),
  });

  if (!exportResult?.ok || exportResult.tenantId !== tenantId || !exportResult.exportId) {
    throw new Error(`account data export returned unexpected payload: ${JSON.stringify(exportResult)}`);
  }

  if (!exportResult.counts || typeof exportResult.counts !== 'object') {
    throw new Error('account data export did not include counts');
  }

  const deletionResult = await requestJson('/api/support/account-deletion', {
    method: 'POST',
    headers: defaultHeaders(),
    body: JSON.stringify({ reason: 'remote smoke deletion request - must remain pending manual review' }),
  }, [202]);

  if (!deletionResult?.ok || deletionResult.tenantId !== tenantId || deletionResult.status !== 'pending-manual-review') {
    throw new Error(`account deletion request returned unexpected payload: ${JSON.stringify(deletionResult)}`);
  }

  if (otherBearerToken) {
    const otherHeaders = defaultHeaders({
      'x-tenant-id': otherTenantId,
      'x-asset-tenant-id': otherTenantId,
    }, otherBearerToken);

    const otherExport = await requestJson('/api/support/account-data', { headers: otherHeaders });
    if (!otherExport?.ok || otherExport.tenantId !== otherTenantId || otherExport.tenantId === tenantId) {
      throw new Error(`other-tenant account export returned unexpected payload: ${JSON.stringify(otherExport)}`);
    }
  } else {
    console.warn('WARN ASSET_FACTORY_OTHER_BEARER_TOKEN missing; skipping two-token support tenant isolation smoke');
  }
}

async function assertCronSecret() {
  await requestJson('/api/cron/integrity-check', {}, [401, 403, 405]);

  if (!cronSecret) {
    console.warn('WARN CRON_SECRET missing; skipping positive cron check');
    return;
  }

  await requestJson('/api/cron/integrity-check', {
    method: 'POST',
    headers: defaultHeaders({ 'x-cron-secret': cronSecret }),
  }, [200, 202, 204]);
}

async function assertStripeWebhookRejectsUnsignedPayload() {
  await requestJson('/api/stripe/webhooks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'evt_smoke_unsigned', type: 'checkout.session.completed' }),
  }, [400, 401, 403, 501]);
}

async function run() {
  console.log(`Asset Factory remote smoke target: ${base}`);
  console.log(`Tenant: ${tenantId}; API key: ${redact(apiKey)}; bearer token: ${bearerToken ? 'set' : 'missing'}; other bearer token: ${otherBearerToken ? 'set' : 'missing'}`);

  await waitForHealth();
  await assertPublicDiagnosticsRedacted();
  await assertContractRoutes();
  await assertOperatorQueueSurface();

  if (skipMutations) {
    console.log('PASS remote smoke read-only checks');
    return;
  }

  const jobIds = [];
  for (const testCase of cases) {
    jobIds.push(await exerciseAssetType(testCase));
  }

  if (jobIds[0]) {
    await assertTenantIsolation(jobIds[0]);
  }

  await assertSupportWorkflows();
  await assertCronSecret();
  await assertStripeWebhookRejectsUnsignedPayload();

  console.log('PASS remote smoke asset factory');
}

run().catch((error) => {
  console.error('FAIL', error instanceof Error ? error.message : String(error));
  process.exit(1);
});