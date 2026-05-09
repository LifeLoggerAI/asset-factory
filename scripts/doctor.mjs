import fs from 'node:fs';
import { execSync } from 'node:child_process';

const checks = [];
let failed = false;

function check(name, ok, details = '') {
  checks.push({ name, ok, details });
  if (!ok) failed = true;
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    return { __error: error instanceof Error ? error.message : String(error) };
  }
}

function command(commandLine) {
  try {
    return execSync(commandLine, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return '';
  }
}

const rootPkg = readJson('package.json');
const studioPkg = readJson('assetfactory-studio/package.json');
const gitBranch = command('git rev-parse --abbrev-ref HEAD');
const gitHead = command('git rev-parse --short HEAD');
const originMain = command('git rev-parse --short origin/main');
const upstream = command('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
const nodeVersion = command('node --version');
const npmVersion = command('npm --version');

check('node is installed', Boolean(nodeVersion), 'Expected Node.js >=20.');
check('npm is installed', Boolean(npmVersion), 'Expected npm 10+.');
check('NPM_CONFIG_PREFIX is unset', !process.env.NPM_CONFIG_PREFIX, process.env.NPM_CONFIG_PREFIX ? `Currently ${process.env.NPM_CONFIG_PREFIX}` : 'OK');
check('root package.json readable', !rootPkg.__error, rootPkg.__error ?? 'OK');
check('studio package.json readable', !studioPkg.__error, studioPkg.__error ?? 'OK');
check('root test:launch-readiness script exists', Boolean(rootPkg.scripts?.['test:launch-readiness']), 'Run git fetch origin && git reset --hard origin/main if missing.');
check('root smoke:staging script exists', Boolean(rootPkg.scripts?.['smoke:staging']), 'Run git fetch origin && git reset --hard origin/main if missing.');
check('studio test script exists', Boolean(studioPkg.scripts?.test), 'Run git fetch origin && git reset --hard origin/main if missing.');
check('studio typecheck script exists', Boolean(studioPkg.scripts?.typecheck), 'Run git fetch origin && git reset --hard origin/main if missing.');
check('launch readiness file exists', fs.existsSync('LAUNCH_READINESS.md'), 'Expected LAUNCH_READINESS.md at repo root.');
check('unit behavior test exists', fs.existsSync('scripts/test-asset-factory-units.mjs'), 'Expected targeted unit behavior test script.');
check('remote smoke script exists', fs.existsSync('scripts/smoke-asset-factory-remote.mjs'), 'Expected remote smoke script.');
check('studio node_modules installed', fs.existsSync('assetfactory-studio/node_modules'), 'Run npm --prefix assetfactory-studio install if missing.');
check('git branch detected', Boolean(gitBranch), 'Run from inside the asset-factory git checkout.');
if (originMain) {
  check('local HEAD matches origin/main', gitHead === originMain, `HEAD=${gitHead || 'unknown'} origin/main=${originMain}`);
} else {
  check('origin/main available', false, 'Run git fetch origin.');
}

console.log('\nAsset Factory repo doctor\n');
console.log(`Node: ${nodeVersion || 'missing'}`);
console.log(`npm: ${npmVersion || 'missing'}`);
console.log(`Branch: ${gitBranch || 'unknown'}`);
console.log(`HEAD: ${gitHead || 'unknown'}`);
console.log(`Upstream: ${upstream || 'none'}`);
console.log(`origin/main: ${originMain || 'unknown'}`);

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.details ? ` - ${item.details}` : ''}`);
}

if (failed) {
  console.log('\nRecommended recovery commands:\n');
  console.log('unset NPM_CONFIG_PREFIX');
  console.log('git fetch origin');
  console.log('git checkout main');
  console.log('git reset --hard origin/main');
  console.log('npm install');
  console.log('npm --prefix assetfactory-studio install');
  console.log('npm run doctor');
  console.log('npm run test:launch-readiness');
  console.log('npm --prefix assetfactory-studio test');
  console.log('npm --prefix assetfactory-studio run typecheck');
  process.exit(1);
}

console.log('\nPASS Asset Factory repo doctor\n');
