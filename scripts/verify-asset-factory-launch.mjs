import { execFileSync } from 'node:child_process';

const apexBase = 'https://uraiassetfactory.com';
const wwwBase = 'https://www.uraiassetfactory.com';
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

function dedicatedBase() {
  const raw = String(process.env.ASSET_FACTORY_BASE_URL || '').trim();
  if (!raw) throw new Error('ASSET_FACTORY_BASE_URL is required for launch verification.');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') throw new Error('ASSET_FACTORY_BASE_URL must use HTTPS.');
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (legacyHosts.has(host)) throw new Error(`Refusing legacy/shared Asset Factory launch host ${host}.`);
  return parsed.origin;
}

function run(command, args, env = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

async function fetchJsonHealth(baseUrl) {
  const url = `${baseUrl}/api/health`;
  console.log(`\nGET ${url}`);

  const res = await fetch(url);
  const body = await res.text();
  const poweredBy = res.headers.get('x-powered-by') || '';
  const server = res.headers.get('server') || '';

  console.log(`status=${res.status}`);
  if (server) console.log(`server=${server}`);
  if (poweredBy) console.log(`x-powered-by=${poweredBy}`);

  if (res.status !== 200) throw new Error(`${url} expected 200, got ${res.status}. Body starts: ${body.slice(0, 240)}`);
  if (poweredBy.toLowerCase().includes('next') || body.includes('404: This page could not be found')) {
    throw new Error(`${url} is routed to the wrong host.`);
  }

  let json;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`${url} did not return JSON. Body starts: ${body.slice(0, 240)}`);
  }
  if (json.ok !== true || json.service !== 'asset-factory') {
    throw new Error(`${url} returned unexpected health payload: ${JSON.stringify(json)}`);
  }
  console.log(`[PASS] ${url}`);
  return json;
}

async function main() {
  const base = dedicatedBase();

  run('npm', ['run', 'check:deploy-workflow']);
  run('npm', ['run', 'test:completion-lock']);
  run('npm', ['run', 'smoke:website'], { ASSET_FACTORY_BASE_URL: base });

  await fetchJsonHealth(base);

  let customOk = true;
  for (const customBase of [apexBase, wwwBase]) {
    try {
      await fetchJsonHealth(customBase);
    } catch (error) {
      customOk = false;
      console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!customOk) {
    console.error('\n[BLOCKED] Dedicated Asset Factory runtime is healthy, but custom-domain routing is not complete.');
    console.error('Attach/provision both domains on the provider-proven dedicated Asset Factory Hosting authority:');
    console.error('- uraiassetfactory.com');
    console.error('- www.uraiassetfactory.com');
    console.error('Then rerun with the same dedicated ASSET_FACTORY_BASE_URL.');
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
