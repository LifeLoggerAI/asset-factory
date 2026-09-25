#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
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

expectBlocked('consumer host forbidden', {
  ASSET_FACTORY_FIREBASE_PROJECT_ID: 'synthetic-asset-factory-prod',
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: 'synthetic-asset-factory-site',
  ASSET_FACTORY_BASE_URL: 'https://urai-4dc1d.web.app',
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

console.log('PRODUCTION_TARGET_BOUNDARY=GREEN');
console.log('PROVIDER_CALLS=0');
console.log('DEPLOYMENT_PERFORMED=false');
