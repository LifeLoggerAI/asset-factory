import { readFile } from 'node:fs/promises';
import process from 'node:process';

const FORBIDDEN_PROJECTS = new Set(['urai-4dc1d', 'asset-factory-dev-id', 'geturai-landing-hub']);
const FORBIDDEN_HOSTING_SITES = new Set([...FORBIDDEN_PROJECTS, 'asset-factory-prod', 'asset-factory-admin']);
const FORBIDDEN_HOSTS = new Set([
  'urai-4dc1d.web.app',
  'urai-4dc1d.firebaseapp.com',
  'asset-factory-dev-id.web.app',
  'asset-factory-dev-id.firebaseapp.com',
  'geturai-landing-hub.web.app',
  'geturai-landing-hub.firebaseapp.com',
  'urai.app',
  'www.urai.app',
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
  const project = requiredEnv('ASSET_FACTORY_FIREBASE_PROJECT_ID');
  if (FORBIDDEN_PROJECTS.has(project)) {
    fail(`Refusing legacy/shared Firebase project ${project}. Supply the provider-proven dedicated Asset Factory project.`);
  }
  return project;
}

function requireHosting() {
  requireProject();
  const site = requiredEnv('ASSET_FACTORY_FIREBASE_HOSTING_SITE');
  if (FORBIDDEN_HOSTING_SITES.has(site)) {
    fail(`Refusing legacy/shared Hosting site ${site}. Supply the provider-proven dedicated Asset Factory Hosting site.`);
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
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (FORBIDDEN_HOSTS.has(host)) {
    fail(`Refusing legacy/shared host ${host}; supply the provider-proven dedicated Asset Factory runtime URL.`);
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
    if ([...FORBIDDEN_PROJECTS].some((project) => command.includes(project)) || [...FORBIDDEN_HOSTS].some((host) => command.includes(host))) {
      fail(`${name} still embeds legacy/shared Asset Factory deployment authority.`);
    }
  }

  for (const name of ['deploy:firebase', 'deploy:hosting-rules', 'deploy:functions', 'deploy:studio']) {
    const command = String(pkg.scripts?.[name] || '');
    if (!command.includes('run-dedicated-firebase-deploy.mjs')) {
      fail(`${name} must route through the dedicated Firebase deploy wrapper.`);
    }
  }
  for (const name of ['deploy:verify', 'deploy:verify-readonly']) {
    const command = String(pkg.scripts?.[name] || '');
    if (!command.includes('validate:production-target')) {
      fail(`${name} must validate the explicit provider-proven project/site/base URL before smoke.`);
    }
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
  if ([...FORBIDDEN_PROJECTS].some((project) => rcText.includes(project))) {
    fail('.firebaserc still binds Asset Factory to a legacy/shared Firebase project/site.');
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
  console.log('Asset Factory provider-proven project/site inputs present; legacy/shared Hosting sites are rejected.');
} else if (mode === 'require-base-url') {
  requireBaseUrl();
  console.log('Asset Factory provider-proven HTTPS verification URL present; legacy/shared hosts are rejected.');
} else {
  fail(`Unknown mode: ${mode}`);
}
