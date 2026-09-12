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

const commandLinePatterns = [
  [/^\s*(?:\$\s*)?firebase\s+login\b/im, 'interactive Firebase login'],
  [/^\s*(?:\$\s*)?firebase\s+deploy\s+--project\b/im, 'direct Firebase CLI deployment'],
  [/^\s*(?:\$\s*)?npm\s+run\s+deploy:(?:firebase|hosting-rules|functions|studio|production|partial)\b/im, 'an unprotected deploy script'],
];

for (const path of authorityDocs) {
  if (!fs.existsSync(path)) fail(`missing authority document ${path}`);
  const text = fs.readFileSync(path, 'utf8');
  for (const [pattern, label] of commandLinePatterns) {
    if (pattern.test(text)) fail(`${path} still instructs ${label}`);
  }
  if (/full JSON service account key/i.test(text)) fail(`${path} still instructs user-managed service-account JSON`);
  if (/New repository secret[\s\S]{0,300}FIREBASE_SERVICE_ACCOUNT/i.test(text)) {
    fail(`${path} still instructs a long-lived deployment secret`);
  }
}

const requiredAuthority = fs.readFileSync('docs/PRODUCTION_DEPLOY_RUNBOOK.md', 'utf8');
for (const phrase of [
  'Asset Factory Production Readiness',
  'asset-factory-production',
  'ASSET_FACTORY_PROJECT_ID',
  'ASSET_FACTORY_HOSTING_SITE',
  'ASSET_FACTORY_BASE_URL',
  'GCP_WIF_PROVIDER',
  'GCP_DEPLOY_SERVICE_ACCOUNT',
  'DEPLOY_ASSET_FACTORY',
  'Verify Deployed Asset Factory',
  'must not be `urai-4dc1d`',
]) {
  if (!requiredAuthority.includes(phrase)) fail(`production runbook missing ${JSON.stringify(phrase)}`);
}

const operations = fs.readFileSync('docs/OPERATIONS_RUNBOOK.md', 'utf8');
for (const phrase of [
  'ASSET_FACTORY_PROJECT_ID',
  'ASSET_FACTORY_HOSTING_SITE',
  'ASSET_FACTORY_BASE_URL',
  'must not fall back to the consumer project',
]) {
  if (!operations.includes(phrase)) fail(`operations runbook missing ${JSON.stringify(phrase)}`);
}

const readiness = fs.readFileSync('LAUNCH_READINESS.md', 'utf8');
for (const phrase of [
  'Dedicated target gate',
  'ASSET_FACTORY_PROJECT_ID',
  'ASSET_FACTORY_HOSTING_SITE',
  'ASSET_FACTORY_BASE_URL',
  'PROD_ASSET_FACTORY_BASE_URL',
]) {
  if (!readiness.includes(phrase)) fail(`launch readiness missing ${JSON.stringify(phrase)}`);
}
if (/ASSET_FACTORY_BASE_URL=https:\/\/urai-4dc1d\.web\.app/i.test(readiness)) {
  fail('launch readiness still instructs the canonical consumer verification base');
}

const accountGuide = fs.readFileSync('docs/FIREBASE_SERVICE_ACCOUNT_SETUP.md', 'utf8');
for (const phrase of ['Workload Identity Federation', 'GCP_WIF_PROVIDER', 'GCP_DEPLOY_SERVICE_ACCOUNT']) {
  if (!accountGuide.includes(phrase)) fail(`deployment identity guide missing ${JSON.stringify(phrase)}`);
}

console.log('PASS operator deployment authority is fail-closed, dedicated-target, and WIF-only');
