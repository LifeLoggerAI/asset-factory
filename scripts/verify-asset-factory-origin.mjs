const legacyHosts = new Set([
  'urai-4dc1d.web.app',
  'urai-4dc1d.firebaseapp.com',
  'asset-factory-dev-id.web.app',
  'asset-factory-dev-id.firebaseapp.com',
  'urai.app',
  'www.urai.app',
]);

const configured = String(process.env.ASSET_FACTORY_ORIGIN_BASE_URL || process.env.ASSET_FACTORY_BASE_URL || '').trim();
if (!configured) {
  console.error('[FAIL] ASSET_FACTORY_ORIGIN_BASE_URL or ASSET_FACTORY_BASE_URL is required; no production origin is assumed.');
  process.exit(1);
}

let originUrl;
try {
  originUrl = new URL(configured);
} catch {
  console.error('[FAIL] Asset Factory origin must be a valid absolute URL.');
  process.exit(1);
}
if (originUrl.protocol !== 'https:') {
  console.error('[FAIL] Asset Factory origin must use HTTPS.');
  process.exit(1);
}
if (legacyHosts.has(originUrl.hostname.toLowerCase())) {
  console.error(`[FAIL] Refusing legacy/shared Asset Factory origin: ${originUrl.hostname}`);
  process.exit(1);
}
const base = originUrl.toString().replace(/\/$/, '');

async function main() {
  const url = `${base}/api/health`;
  console.log(`GET ${url}`);

  const res = await fetch(url);
  const body = await res.text();
  const poweredBy = res.headers.get('x-powered-by') || '';

  console.log(`status=${res.status}`);
  if (poweredBy) console.log(`x-powered-by=${poweredBy}`);

  if (res.status !== 200) {
    throw new Error(`${url} expected 200, got ${res.status}. Body starts: ${body.slice(0, 240)}`);
  }
  if (poweredBy.toLowerCase().includes('next') || body.includes('404: This page could not be found')) {
    throw new Error(`${url} is not serving the Asset Factory API surface.`);
  }

  let json;
  try { json = JSON.parse(body); }
  catch { throw new Error(`${url} did not return JSON. Body starts: ${body.slice(0, 240)}`); }

  if (json.ok !== true || json.service !== 'asset-factory') {
    throw new Error(`${url} returned unexpected payload: ${JSON.stringify(json)}`);
  }

  console.log(`[PASS] Asset Factory dedicated origin is healthy: ${url}`);
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
