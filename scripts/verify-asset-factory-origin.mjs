const defaultBase = process.env.ASSET_FACTORY_ORIGIN_BASE_URL || 'https://urai-4dc1d.web.app';

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
