import { readFile } from 'node:fs/promises';
import process from 'node:process';

const FORBIDDEN_CONSUMER_SITE = 'urai-4dc1d';
const FORBIDDEN_CONSUMER_HOSTS = new Set([
  'urai-4dc1d.web.app',
  'urai-4dc1d.firebaseapp.com',
]);
const HOSTING_TARGET = 'asset-factory-production';

function fail(message) {
  console.error(`[asset-factory-production-authority] ${message}`);
  process.exit(1);
}

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) fail(`${name} is required; provider authority must be supplied explicitly.`);
  return value;
}

function requireProject() {
  return requiredEnv('ASSET_FACTORY_FIREBASE_PROJECT');
}

function requireHosting() {
  requireProject();
  const site = requiredEnv('ASSET_FACTORY_FIREBASE_SITE');
  if (site === FORBIDDEN_CONSUMER_SITE) {
    fail('Refusing consumer URAI Hosting site urai-4dc1d. Supply the provider-proven dedicated Asset Factory Hosting site.');
  }
  return site;
}

function requireBaseUrl() {
  const value = requiredEnv('ASSET_FACTORY_BASE_URL');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('ASSET_FACTORY_BASE_URL must be a valid absolute URL.');
  }
  if (parsed.protocol !== 'https:') fail('ASSET_FACTORY_BASE_URL must use HTTPS for production verification.');
  if (FORBIDDEN_CONSUMER_HOSTS.has(parsed.hostname)) {
    fail(`Refusing consumer URAI host ${parsed.hostname}; supply the provider-proven Asset Factory runtime URL.`);
  }
  return parsed;
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

async function staticCheck() {
  const [pkg, firebase, firebaseRc, studioFirebase] = await Promise.all([
    readJson('package.json'),
    readJson('firebase.json'),
    readJson('.firebaserc'),
    readJson('assetfactory-studio/firebase.json'),
  ]);

  const boundedScripts = [
    'deploy:firebase',
    'deploy:hosting-rules',
    'deploy:functions',
    'deploy:studio',
    'deploy:verify',
    'deploy:verify-readonly',
    'deploy:production',
    'deploy:partial',
  ];

  for (const name of boundedScripts) {
    const command = String(pkg.scripts?.[name] || '');
    if (!command) fail(`Missing required bounded script ${name}.`);
    if (command.includes(FORBIDDEN_CONSUMER_SITE) || [...FORBIDDEN_CONSUMER_HOSTS].some((host) => command.includes(host))) {
      fail(`${name} still embeds consumer URAI deployment authority.`);
    }
  }

  if (pkg.scripts?.['deploy:bind-hosting-target']?.includes('ASSET_FACTORY_FIREBASE_SITE') !== true) {
    fail('deploy:bind-hosting-target must require an explicit provider-proven Hosting site.');
  }
  if (pkg.scripts?.['deploy:verify']?.includes('require-base-url') !== true
      || pkg.scripts?.['deploy:verify-readonly']?.includes('require-base-url') !== true) {
    fail('Production verification scripts must require an explicit provider-proven base URL.');
  }

  const rootHosting = firebase.hosting;
  if (!rootHosting || Array.isArray(rootHosting)) fail('Root firebase.json must define one bounded Hosting configuration.');
  if ('site' in rootHosting) fail('Root firebase.json must not embed a concrete Hosting site ID.');
  if (rootHosting.target !== HOSTING_TARGET) fail(`Root Hosting must use symbolic target ${HOSTING_TARGET}.`);

  const studioHosting = studioFirebase.hosting;
  if (!studioHosting || Array.isArray(studioHosting)) fail('Studio firebase.json must define one bounded Hosting configuration.');
  if ('site' in studioHosting) fail('Studio firebase.json must not embed a concrete Hosting site ID.');
  if (studioHosting.target !== HOSTING_TARGET) fail(`Studio Hosting must use symbolic target ${HOSTING_TARGET}.`);

  const rcText = JSON.stringify(firebaseRc);
  if (rcText.includes(FORBIDDEN_CONSUMER_SITE)) {
    fail('.firebaserc still binds Asset Factory to the consumer URAI Firebase project/site.');
  }

  console.log('Asset Factory production authority boundary OK: symbolic target only; provider project/site/base URL remain explicit runtime inputs.');
}

const mode = process.argv[2] || 'check';

if (mode === 'check') {
  await staticCheck();
} else if (mode === 'require-project') {
  requireProject();
  console.log('Asset Factory Firebase project input present.');
} else if (mode === 'require-hosting') {
  requireHosting();
  console.log('Asset Factory provider-proven project/site inputs present; consumer Hosting site is rejected.');
} else if (mode === 'require-base-url') {
  requireBaseUrl();
  console.log('Asset Factory provider-proven HTTPS verification URL present; consumer URAI hosts are rejected.');
} else {
  fail(`Unknown mode: ${mode}`);
}
