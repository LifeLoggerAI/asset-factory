const baseUrl = process.env.ASSET_FACTORY_LIVE_URL || process.argv[2];

if (!baseUrl) {
  console.error('Missing ASSET_FACTORY_LIVE_URL or URL argument');
  process.exit(1);
}

const url = new URL('/api/health', baseUrl).toString();
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

try {
  const response = await fetch(url, {
    method: 'GET',
    signal: controller.signal,
    headers: { accept: 'application/json,text/plain,*/*' },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Health check failed: ${response.status} ${response.statusText}`);
    console.error(body.slice(0, 1000));
    process.exit(1);
  }
  const normalized = body.toLowerCase();
  if (!normalized.includes('ok') && !normalized.includes('healthy') && !normalized.includes('asset')) {
    console.error('Health check response did not include an expected health marker');
    console.error(body.slice(0, 1000));
    process.exit(1);
  }
  console.log(`Live deploy health check passed: ${url}`);
} finally {
  clearTimeout(timeout);
}
