const base = (process.env.ASSET_FACTORY_BASE_URL || process.env.BASE_URL || '').replace(/\/$/, '');
const readonly = process.env.ASSET_FACTORY_SMOKE_READONLY === 'true';
const userId = process.env.ASSET_FACTORY_SMOKE_USER_ID || 'smoke-user-production-finalization';

if (!base) {
  console.error('FAIL ASSET_FACTORY_BASE_URL or BASE_URL is required');
  process.exit(1);
}

async function request(path, options = {}, expectedStatuses = [200]) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
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
    throw new Error(`${path} expected ${expectedStatuses.join('/')} got ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }

  return body;
}

async function run() {
  console.log(`Production finalization smoke target: ${base}`);

  const health = await request('/api/health');
  if (!health || health.ok !== true || health.service !== 'asset-factory') {
    throw new Error(`/api/health returned unexpected payload: ${JSON.stringify(health)}`);
  }
  console.log('PASS /api/health');

  if (readonly) {
    console.log('PASS read-only production finalization smoke');
    return;
  }

  const asset = await request('/api/assets', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      projectId: 'urai-production-finalization',
      assetType: 'status-proof',
      format: 'json',
      source: 'production-finalization-smoke',
      prompt: 'Verify Asset Factory production finalization wiring.',
      tags: ['production-finalization', 'smoke'],
      dimensions: { width: 1, height: 1 },
    }),
  }, [202]);

  if (!asset?.assetId || !asset?.queueId || asset.status !== 'queued') {
    throw new Error(`asset intake returned unexpected payload: ${JSON.stringify(asset)}`);
  }
  console.log(`PASS /api/assets assetId=${asset.assetId} queueId=${asset.queueId}`);

  const status = await request(`/api/assets/${asset.assetId}`);
  if (!status?.asset || status.asset.assetId !== asset.assetId) {
    throw new Error(`asset status returned unexpected payload: ${JSON.stringify(status)}`);
  }
  console.log('PASS /api/assets/{assetId}');

  const event = await request('/api/lifemap/events', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      source: 'production-finalization-smoke',
      type: 'asset_factory_smoke_event',
      linkedAssetId: asset.assetId,
      payload: {
        proof: true,
        assetId: asset.assetId,
        queueId: asset.queueId,
      },
    }),
  }, [202]);

  if (!event?.eventId || event.status !== 'accepted') {
    throw new Error(`lifemap ingestion returned unexpected payload: ${JSON.stringify(event)}`);
  }
  console.log(`PASS /api/lifemap/events eventId=${event.eventId}`);

  console.log('PASS production finalization smoke');
}

run().catch((error) => {
  console.error('FAIL', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
