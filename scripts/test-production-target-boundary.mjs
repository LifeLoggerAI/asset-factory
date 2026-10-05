#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

const script = 'scripts/run-dedicated-firebase-deploy.mjs';

function run(env) {
  return spawnSync(process.execPath, [script, '--check-only'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function expectBlocked(name, env, expected) {
  const result = run(env);
  if (result.status === 0) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: ${name} unexpectedly passed`);
    process.exit(1);
  }
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (!output.includes(expected)) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: ${name} blocked for the wrong reason`);
    console.error(output);
    process.exit(1);
  }
}

expectBlocked('missing authority', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: '',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: '',
  ASSET_FACTORY_BASE_URL: '',
}, 'ASSET_FACTORY_FIREBASE_PROJECT_ID is required');

expectBlocked('consumer project forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'urai-4dc1d',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
}, 'legacy/shared Firebase project');

expectBlocked('historical dev project forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'asset-factory-dev-id',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
}, 'legacy/shared Firebase project');

expectBlocked('shared geturai landing project forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'geturai-landing-hub',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
}, 'legacy/shared Firebase project');

expectBlocked('shared geturai landing host forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://geturai-landing-hub.web.app',
}, 'legacy/shared host');

expectBlocked('shared geturai landing host with DNS root dot forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://geturai-landing-hub.web.app.',
}, 'legacy/shared host');

expectBlocked('historical shared asset-factory-prod site forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'asset-factory-prod',
  ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
}, 'legacy/shared Hosting site');

expectBlocked('historical shared asset-factory-admin site forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'asset-factory-admin',
  ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
}, 'legacy/shared Hosting site');

expectBlocked('consumer host forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://urai-4dc1d.web.app',
}, 'legacy/shared host');

expectBlocked('consumer host with DNS root dot forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://urai-4dc1d.web.app.',
}, 'legacy/shared host');

expectBlocked('consumer hosting site forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'urai-4dc1d',
  ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
}, 'legacy/shared Hosting site');

const accepted = run({
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
});
if (accepted.status !== 0) {
  console.error('PRODUCTION_TARGET_BOUNDARY=RED: explicit synthetic dedicated target should pass check-only validation');
  console.error(accepted.stdout || '');
  console.error(accepted.stderr || '');
  process.exit(1);
}
if (!(accepted.stdout || '').includes('ASSET_FACTORY_PRODUCTION_TARGET=VALIDATED')) {
  console.error('PRODUCTION_TARGET_BOUNDARY=RED: success marker missing');
  process.exit(1);
}

const activeDomainAuthorityFiles = [
  'scripts/diagnose-custom-domain.mjs',
  'deploy/custom-domain/asset-factory-api-proxy.vercel.json',
  'scripts/finish-custom-domain-production.mjs',
  'scripts/verify-asset-factory-origin.mjs',
  'scripts/verify-asset-factory-launch.mjs',
  'scripts/asset-factory-production-authority.mjs',
];

for (const file of activeDomainAuthorityFiles) {
  const content = readFileSync(file, 'utf8');
  if (content.includes('https://urai-4dc1d.web.app/api/:path*')) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: ${file} still routes custom-domain API traffic through shared consumer Hosting`);
    process.exit(1);
  }
  if (content.includes('Hosting site urai-4dc1d or')) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: ${file} still instructs operators to use shared consumer Hosting`);
    process.exit(1);
  }
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const customDomainScript = String(packageJson.scripts?.['deploy:verify-custom-domain'] || '');
if (!customDomainScript.includes('npm run smoke:production-finalization') || customDomainScript.includes('npm run smoke-production-finalization')) {
  console.error('PRODUCTION_TARGET_BOUNDARY=RED: deploy:verify-custom-domain must invoke the existing smoke:production-finalization script');
  process.exit(1);
}

const authorityScript = readFileSync('scripts/asset-factory-production-authority.mjs', 'utf8');
for (const required of ['ASSET_FACTORY_FIREBASE_PROJECT_ID', 'ASSET_FACTORY_FIREBASE_HOSTING_SITE', 'ASSET_FACTORY_BASE_URL']) {
  if (!authorityScript.includes(required)) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: canonical authority script missing ${required}`);
    process.exit(1);
  }
}
for (const forbidden of ["requiredEnv('ASSET_FACTORY_FIREBASE_PROJECT')", "requiredEnv('ASSET_FACTORY_FIREBASE_SITE')"]) {
  if (authorityScript.includes(forbidden)) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: canonical authority script still uses stale env contract ${forbidden}`);
    process.exit(1);
  }
}

const legacyVerifierHosts = [
  'urai-4dc1d.web.app',
  'urai-4dc1d.firebaseapp.com',
  'asset-factory-dev-id.web.app',
  'asset-factory-dev-id.firebaseapp.com',
  'geturai-landing-hub.web.app',
  'geturai-landing-hub.firebaseapp.com',
  'urai.app',
  'www.urai.app',
];

const finishCustomDomain = readFileSync('scripts/finish-custom-domain-production.mjs', 'utf8');
for (const staleAlias of ['ASSET_FACTORY_FIREBASE_PROJECT ||', 'ASSET_FACTORY_FIREBASE_SITE ||']) {
  if (finishCustomDomain.includes(staleAlias)) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: finish-custom-domain still accepts stale env alias ${staleAlias}`);
    process.exit(1);
  }
}
for (const required of ['validate:production-target', 'asset-factory-dev-id', 'geturai-landing-hub', 'asset-factory-prod', 'asset-factory-admin']) {
  if (!finishCustomDomain.includes(required)) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: finish-custom-domain missing dedicated authority guard ${required}`);
    process.exit(1);
  }
}

for (const verifierPath of ['scripts/verify-asset-factory-origin.mjs', 'scripts/verify-asset-factory-launch.mjs']) {
  const verifier = readFileSync(verifierPath, 'utf8');
  if (verifier.includes("|| 'https://urai-4dc1d.web.app'") || verifier.includes("const defaultBase = 'https://urai-4dc1d.web.app'")) {
    console.error(`PRODUCTION_TARGET_BOUNDARY=RED: ${verifierPath} still defaults to shared consumer Hosting`);
    process.exit(1);
  }
  for (const host of legacyVerifierHosts) {
    if (!verifier.includes(host)) {
      console.error(`PRODUCTION_TARGET_BOUNDARY=RED: ${verifierPath} does not explicitly reject known legacy host ${host}`);
      process.exit(1);
    }
  }
}

console.log('PRODUCTION_TARGET_BOUNDARY=GREEN');
console.log('PROVIDER_CALLS=0');
console.log('DEPLOYMENT_PERFORMED=false');
