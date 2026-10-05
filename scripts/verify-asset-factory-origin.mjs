const rawBase = String(process.env.ASSET_FACTORY_BASE_URL || process.env.ASSET_FACTORY_ORIGIN_BASE_URL || '').trim();
if (!rawBase) {
  console.error('[FAIL] ASSET_FACTORY_BASE_URL (or ASSET_FACTORY_ORIGIN_BASE_URL for diagnostics) is required; no shared Firebase fallback is allowed.');
  process.exit(1);
}
const parsedBase = new URL(rawBase);
if (parsedBase.protocol !== 'https:') {
  console.error('[FAIL] Asset Factory origin verification requires HTTPS.');
  process.exit(1);
}
const forbiddenHosts = new Set(['urai-4dc1d.web.app', 'urai-4dc1d.firebaseapp.com']);
if (forbiddenHosts.has(parsedBase.hostname.toLowerCase().replace(/\.$/, ''))) {
  console.error('[FAIL] Shared consumer URAI Firebase hosts are forbidden as current Asset Factory production authority.');
  process.exit(1);
}
const defaultBase = parsedBase.origin;

async function main() {
  const url = `${defaultBase}/api/health`;
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
    throw new Error(`${url} is routed to the old Next.js host, not Asset Factory.`);
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

  console.log(`[PASS] Asset Factory Firebase origin is healthy: ${url}`);
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
