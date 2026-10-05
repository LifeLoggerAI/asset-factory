const legacyHosts = new Set([
  'urai-4dc1d.web.app',
  'urai-4dc1d.firebaseapp.com',
  'asset-factory-dev-id.web.app',
  'asset-factory-dev-id.firebaseapp.com',
  'geturai-landing-hub.web.app',
  'geturai-landing-hub.firebaseapp.com',
  'urai.app',
  'www.urai.app',
]);

function resolveBaseUrl() {
  const raw = String(process.env.ASSET_FACTORY_ORIGIN_BASE_URL || process.env.ASSET_FACTORY_BASE_URL || '').trim();
  if (!raw) {
    throw new Error('ASSET_FACTORY_ORIGIN_BASE_URL or ASSET_FACTORY_BASE_URL is required; no shared/historical production default is allowed.');
  }
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') throw new Error('Asset Factory origin verification requires HTTPS.');
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (legacyHosts.has(host)) throw new Error(`Refusing legacy/shared Asset Factory verification host ${host}.`);
  return parsed.origin;
}

async function main() {
  const base = resolveBaseUrl();
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
    throw new Error(`${url} is routed to the wrong host, not the dedicated Asset Factory runtime.`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`${url} did not return JSON. Body starts: ${body.slice(0, 240)}`);
  }

  if (json.ok !== true || json.service !== 'asset-factory') {
    throw new Error(`${url} returned unexpected payload: ${JSON.stringify(json)}`);
  }

  console.log(`[PASS] Dedicated Asset Factory origin is healthy: ${url}`);
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
