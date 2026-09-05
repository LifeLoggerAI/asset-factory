#!/usr/bin/env node
import fs from 'node:fs';

function fail(message) {
  console.error(`FAIL operator deployment authority: ${message}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts || {};
const refusal = 'node scripts/refuse-unprotected-deploy.mjs';
const blockedDeployScripts = [
  'deploy:firebase',
  'deploy:hosting-rules',
  'deploy:functions',
  'deploy:studio',
  'deploy:production',
  'deploy:partial',
  'finish:custom-domain',
];

for (const name of blockedDeployScripts) {
  const value = scripts[name];
  if (typeof value !== 'string' || !value.startsWith(refusal)) {
    fail(`${name} must fail closed through scripts/refuse-unprotected-deploy.mjs`);
  }
}

for (const [name, value] of Object.entries(scripts)) {
  if (typeof value !== 'string') continue;
  if (/\bfirebase\s+deploy\b/i.test(value)) fail(`${name} contains direct Firebase deployment authority`);
  if (/\bfirebase\s+login\b/i.test(value)) fail(`${name} contains interactive Firebase login authority`);
}

for (const name of ['smoke:staging', 'smoke:prod', 'smoke:production-finalization']) {
  const value = scripts[name] || '';
  if (!value.includes('ASSET_FACTORY_SMOKE_READONLY=true')) {
    fail(`${name} must default to read-only mode`);
  }
}

if (scripts['verify:production'] !== 'npm run verify:local && npm run deploy:verify-readonly') {
  fail('verify:production must remain verification-only');
}

const authorityDocs = [
  'README.md',
  'docs/OPERATIONS_RUNBOOK.md',
  'docs/PRODUCTION_DEPLOY_RUNBOOK.md',
  'docs/FIREBASE_SERVICE_ACCOUNT_SETUP.md',
  'docs/DEPLOYMENT_VERIFICATION.md',
  'LAUNCH_READINESS.md',
];

for (const path of authorityDocs) {
  if (!fs.existsSync(path)) fail(`missing authority document ${path}`);
  const text = fs.readFileSync(path, 'utf8');
  if (/\bfirebase\s+login\b/i.test(text)) fail(`${path} still instructs interactive Firebase login`);
  if (/npm\s+run\s+deploy:(?:firebase|hosting-rules|functions|studio|production|partial)\b/i.test(text)) {
    fail(`${path} still instructs an unprotected deploy script`);
  }
  if (/\bfirebase\s+deploy\s+--project\b/i.test(text)) fail(`${path} still instructs direct Firebase CLI deployment`);
  if (/full JSON service account key/i.test(text)) fail(`${path} still instructs user-managed service-account JSON`);
  if (/New repository secret[\s\S]{0,300}FIREBASE_SERVICE_ACCOUNT/i.test(text)) {
    fail(`${path} still instructs a long-lived deployment secret`);
  }
}

const requiredAuthority = fs.readFileSync('docs/PRODUCTION_DEPLOY_RUNBOOK.md', 'utf8');
for (const phrase of [
  'Asset Factory Production Readiness',
  'asset-factory-production',
  'GCP_WIF_PROVIDER',
  'GCP_DEPLOY_SERVICE_ACCOUNT',
  'DEPLOY_ASSET_FACTORY',
  'Verify Deployed Asset Factory',
]) {
  if (!requiredAuthority.includes(phrase)) fail(`production runbook missing ${JSON.stringify(phrase)}`);
}

const accountGuide = fs.readFileSync('docs/FIREBASE_SERVICE_ACCOUNT_SETUP.md', 'utf8');
for (const phrase of ['Workload Identity Federation', 'GCP_WIF_PROVIDER', 'GCP_DEPLOY_SERVICE_ACCOUNT']) {
  if (!accountGuide.includes(phrase)) fail(`deployment identity guide missing ${JSON.stringify(phrase)}`);
}

console.log('PASS operator deployment authority is fail-closed and WIF-only');
