import { execFileSync } from 'node:child_process';

const originBase = String(process.env.ASSET_FACTORY_ORIGIN_BASE_URL || process.env.ASSET_FACTORY_BASE_URL || '').replace(/\/$/, '');
const apexBase = 'https://uraiassetfactory.com';
const wwwBase = 'https://www.uraiassetfactory.com';

if (!originBase) {
  console.error('[BLOCKED] Set ASSET_FACTORY_ORIGIN_BASE_URL to the verified dedicated provider origin before launch verification.');
  process.exit(1);
}

function run(command, args, env = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
}

async function fetchJsonHealth(baseUrl) {
  const url = `${baseUrl}/api/health`;
  console.log(`\nGET ${url}`);
  const res = await fetch(url);
  const body = await res.text();
  const poweredBy = res.headers.get('x-powered-by') || '';
  if (res.status !== 200) throw new Error(`${url} expected 200, got ${res.status}. Body starts: ${body.slice(0, 240)}`);
  if (poweredBy.toLowerCase().includes('next') || body.includes('404: This page could not be found')) {
    throw new Error(`${url} is not serving the Asset Factory API surface.`);
  }
  let json;
  try { json = JSON.parse(body); }
  catch { throw new Error(`${url} did not return JSON.`); }
  if (json.ok !== true || json.service !== 'asset-factory') {
    throw new Error(`${url} returned unexpected health payload: ${JSON.stringify(json)}`);
  }
  console.log(`[PASS] ${url}`);
}

async function main() {
  run('npm', ['run', 'check:deploy-workflow']);
  run('npm', ['run', 'test:completion-lock']);
  run('npm', ['run', 'validate:production-target']);
  run('npm', ['run', 'smoke:website'], { ASSET_FACTORY_BASE_URL: originBase });
  await fetchJsonHealth(originBase);

  let customOk = true;
  for (const base of [apexBase, wwwBase]) {
    try { await fetchJsonHealth(base); }
    catch (error) {
      customOk = false;
      console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!customOk) {
    console.error('\n[BLOCKED] Dedicated provider origin is healthy, but custom-domain routing is not complete.');
    console.error('Attach uraiassetfactory.com and www.uraiassetfactory.com only to the verified dedicated Asset Factory target using provider-generated instructions.');
    process.exit(2);
  }

  run('npm', ['run', 'finish:custom-domain'], { ASSET_FACTORY_BASE_URL: apexBase });
  run('npm', ['run', 'smoke:website'], { ASSET_FACTORY_BASE_URL: wwwBase });
  console.log('\n[PASS] Asset Factory launch verification complete.');
}

main().catch((error) => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
