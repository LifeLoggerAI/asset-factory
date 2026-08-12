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
const exactProvider = 'projects/952723774155/locations/global/workloadIdentityPools/urai-github/providers/asset-factory-github';
const exactServiceAccount = 'asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com';
const exactConfirmation = 'RUN_ONE_REPLICATE_MODEL3D_SMOKE';

for (const required of [
  'workflow_dispatch:',
  'confirm_paid_smoke:',
  exactConfirmation,
  "test \"$GITHUB_REF\" = 'refs/heads/main'",
  'environment: asset-factory-production',
  exactProvider,
  exactServiceAccount,
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

for (const required of [exactProvider, exactServiceAccount, 'google-github-actions/auth@v3']) {
  if (!grant.includes(required)) fail(`grant workflow missing pinned WIF contract ${JSON.stringify(required)}`);
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
