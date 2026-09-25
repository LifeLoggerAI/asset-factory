#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowsDir = path.join(root, '.github', 'workflows');
const smokeRelative = '.github/workflows/replicate-bounded-model3d-smoke.yml';
const grantRelative = '.github/workflows/grant-replicate-apphosting-secret.yml';
const smokePath = path.join(root, smokeRelative);
const grantPath = path.join(root, grantRelative);

function fail(message) {
  console.error(`FAIL Replicate paid-smoke boundary: ${message}`);
  process.exit(1);
}

for (const file of [smokePath, grantPath]) {
  if (!fs.existsSync(file)) fail(`missing ${path.relative(root, file)}`);
}

const smoke = fs.readFileSync(smokePath, 'utf8');
const grant = fs.readFileSync(grantPath, 'utf8');
const historicalProject = 'urai-4dc1d';
const historicalProviderPrefix = 'projects/952723774155/';
const historicalServiceAccount = 'asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com';
const exactConfirmation = 'RUN_ONE_REPLICATE_MODEL3D_SMOKE';

for (const required of [
  'workflow_dispatch:',
  'confirm_paid_smoke:',
  exactConfirmation,
  "test \"$GITHUB_REF\" = 'refs/heads/main'",
  'environment: asset-factory-production',
  'PROJECT_ID: ${{ vars.ASSET_FACTORY_FIREBASE_PROJECT_ID }}',
  'GCP_WIF_PROVIDER: ${{ vars.GCP_WIF_PROVIDER }}',
  'GCP_DEPLOY_SERVICE_ACCOUNT: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}',
  'REPLICATE_MODEL3D_SMOKE_COMPLETED=',
  'https://api.replicate.com/v1/predictions',
  'Automatic prediction retries: **0**',
]) {
  if (!smoke.includes(required)) fail(`smoke workflow missing ${JSON.stringify(required)}`);
}

for (const forbidden of [
  'workflow_run:',
  'schedule:',
  'push:',
  'pull_request:',
  'repository_dispatch:',
]) {
  if (smoke.includes(forbidden)) fail(`smoke workflow contains forbidden automatic trigger ${JSON.stringify(forbidden)}`);
}

if (!smoke.includes(`test \"$CONFIRM_PAID_SMOKE\" = '${exactConfirmation}'`)) {
  fail('smoke workflow does not enforce the exact paid-smoke confirmation phrase');
}
if (!smoke.includes('count="$(gh issue view 63')) fail('smoke workflow lost the issue #63 one-time marker guard');
if (!smoke.includes('if [ "$count" -gt 0 ]')) fail('smoke workflow does not refuse a second completed paid smoke');
if (!smoke.includes('create_credentials_file: true') || !smoke.includes('export_environment_variables: false')) {
  fail('smoke WIF credential boundary drifted');
}
if (!smoke.includes('Remove ephemeral Google credential')) fail('smoke workflow must remove Google credential before provider execution');
if (smoke.indexOf('Remove ephemeral Google credential') > smoke.indexOf('Run exactly one Replicate model3d prediction')) {
  fail('Google credential cleanup must precede the Replicate provider call');
}

for (const required of [
  'EXPECTED_PROJECT_ID: ${{ vars.ASSET_FACTORY_FIREBASE_PROJECT_ID }}',
  'GCP_WIF_PROVIDER: ${{ vars.GCP_WIF_PROVIDER }}',
  'GCP_DEPLOY_SERVICE_ACCOUNT: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}',
  'google-github-actions/auth@v3',
]) {
  if (!grant.includes(required)) fail(`grant workflow missing protected dedicated-target contract ${JSON.stringify(required)}`);
}
for (const required of [
  'firebase apphosting:backends:get assetfactory-studio',
  "jq -r '.result.uri // empty'",
  'firebase apphosting:rollouts:create assetfactory-studio',
  '--git_commit "$GITHUB_SHA"',
]) {
  if (!grant.includes(required)) fail(`grant workflow missing stable App Hosting verification contract ${JSON.stringify(required)}`);
}
if (grant.includes('firebase apphosting:backends:list')) {
  fail('grant workflow must not use the historical brittle App Hosting backend list parser');
}
for (const [label, text] of [['smoke', smoke], ['grant', grant]]) {
  if (text.includes(`PROJECT_ID: ${historicalProject}`) || text.includes(`EXPECTED_PROJECT_ID: ${historicalProject}`)) {
    fail(`${label} workflow must not pin historical project ${historicalProject}`);
  }
  const historicalProviderConfigured =
    text.includes(`GCP_WIF_PROVIDER: ${historicalProviderPrefix}`) ||
    text.includes(`workload_identity_provider: ${historicalProviderPrefix}`);
  if (historicalProviderConfigured) {
    fail(`${label} workflow must not configure historical WIF project authority`);
  }
  const historicalServiceAccountConfigured =
    text.includes(`GCP_DEPLOY_SERVICE_ACCOUNT: ${historicalServiceAccount}`) ||
    text.includes(`service_account: ${historicalServiceAccount}`);
  if (historicalServiceAccountConfigured) {
    fail(`${label} workflow must not configure historical deploy service account`);
  }
}
if (!grant.includes('projects/952723774155/*)')) {
  fail('grant workflow must explicitly reject the historical urai-4dc1d WIF provider');
}
if (!grant.includes(historicalServiceAccount)) {
  fail('grant workflow must explicitly reject the historical urai-4dc1d deploy service account');
}
if (grant.includes('--git-commit')) {
  fail('grant workflow must not use the obsolete hyphenated Firebase rollout flag');
}
if (grant.includes('apphosting:rollouts:create assetfactory-studio') && grant.includes('\n            --force')) {
  fail('grant workflow must not pass undocumented --force to apphosting:rollouts:create');
}
for (const forbidden of ['REPLICATE_API_TOKEN=%', 'https://api.replicate.com/v1/predictions', 'workflow_run:']) {
  if (grant.includes(forbidden)) fail(`no-spend grant workflow contains paid/provider execution capability ${JSON.stringify(forbidden)}`);
}

const workflowFiles = fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));
for (const name of workflowFiles) {
  const relative = `.github/workflows/${name}`;
  const text = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
  if (text.includes('https://api.replicate.com/v1/predictions') && relative !== smokeRelative) {
    fail(`Replicate prediction endpoint appears outside the single governed smoke workflow: ${relative}`);
  }
  if (text.includes('REPLICATE_MODEL3D_SMOKE_COMPLETED=') && relative !== smokeRelative) {
    fail(`Replicate completion marker is writable outside the single governed smoke workflow: ${relative}`);
  }
}

console.log('PASS Replicate paid-smoke boundary: manual-only, exact-confirmation, one-time provider path');
