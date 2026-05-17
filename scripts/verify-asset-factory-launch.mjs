import { execFileSync } from 'node:child_process';

const defaultBase = 'https://urai-4dc1d.web.app';
const apexBase = 'https://uraiassetfactory.com';
const wwwBase = 'https://www.uraiassetfactory.com';

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

  if (res.status !== 200) {
    throw new Error(`${url} expected 200, got ${res.status}. Body starts: ${body.slice(0, 240)}`);
  }

  if (poweredBy.toLowerCase().includes('next') || body.includes('404: This page could not be found')) {
    throw new Error(`${url} is still routed to the old Next.js host.`);
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
  run('npm', ['run', 'check:deploy-workflow']);
  run('npm', ['run', 'test:completion-lock']);
  run('npm', ['run', 'smoke:website'], { ASSET_FACTORY_BASE_URL: defaultBase });

  await fetchJsonHealth(defaultBase);

  let customOk = true;
  for (const base of [apexBase, wwwBase]) {
    try {
      await fetchJsonHealth(base);
    } catch (error) {
      customOk = false;
      console.error(`[FAIL] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!customOk) {
    console.error('\n[BLOCKED] Asset Factory app/origin is healthy, but custom-domain routing is not complete.');
    console.error('Open Firebase Hosting site urai-4dc1d and attach/provision both domains:');
    console.error('- uraiassetfactory.com');
    console.error('- www.uraiassetfactory.com');
    console.error('Then rerun: npm run verify:launch');
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
