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
const projectVar = 'PROJECT_ID: ${{ vars.ASSET_FACTORY_FIREBASE_PROJECT_ID }}';
const grantProjectVar = 'EXPECTED_PROJECT_ID: ${{ vars.ASSET_FACTORY_FIREBASE_PROJECT_ID }}';
const providerVar = 'GCP_WIF_PROVIDER: ${{ vars.GCP_WIF_PROVIDER }}';
const serviceAccountVar = 'GCP_DEPLOY_SERVICE_ACCOUNT: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}';
const exactConfirmation = 'RUN_ONE_REPLICATE_MODEL3D_SMOKE';

for (const required of [
  'workflow_dispatch:',
  'confirm_paid_smoke:',
  exactConfirmation,
  "test \"$GITHUB_REF\" = 'refs/heads/main'",
  'environment: asset-factory-production',
  projectVar,
  providerVar,
  serviceAccountVar,
  "test \"$PROJECT_ID\" != 'urai-4dc1d'",
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
  'issue_comment:',
  "github.event.issue.number == 315",
  "github.event.comment.body == 'AUTHORIZE_ONE_HOME_ARCHITECTURAL_CHALLENGER'",
  "github.event.comment.author_association == 'OWNER'",
  'github.actor == github.repository_owner',
  'HOME_CHALLENGER_ATTEMPT_STARTED=',
  'provider=replicate',
  'model=tencent/hunyuan-3d-3.1',
  'maximum_predictions=1',
  'expected_cost_usd=0.50',
  'automatic_retries=0',
  "URAI_MODEL_FORGE_SPEND_AUTHORIZED: '1'",
  '--providers replicate',
  '.generationPolicy.maxProviderAttempts == 1',
]) {
  if (!smoke.includes(required)) fail(`trusted Home challenger lane missing ${JSON.stringify(required)}`);
}
if (!smoke.includes("smoke:\n    if: github.event_name == 'workflow_dispatch'")) {
  fail('legacy Replicate smoke must remain workflow_dispatch-only');
}
if (!smoke.includes("report:\n    if: github.event_name == 'workflow_dispatch' && always()")) {
  fail('legacy smoke report must not run for Home issue-comment authorization');
}
if (!smoke.includes('count="$(gh issue view "$HOME_AUTHORIZATION_ISSUE"')) {
  fail('Home challenger lost issue #315 one-time marker guard');
}
if (!smoke.includes('test "$count" = 0')) {
  fail('Home challenger no longer refuses a started one-shot attempt');
}
if (!smoke.includes('Remove ephemeral Google credential before Home provider call')) {
  fail('Home challenger must remove Google credentials before the Replicate call');
}
if (smoke.indexOf('Remove ephemeral Google credential before Home provider call') > smoke.indexOf('Execute exactly one Replicate Home challenger')) {
  fail('Home challenger Google credential cleanup must precede provider execution');
}
if (smoke.indexOf('Record irreversible Home attempt marker') > smoke.indexOf('Execute exactly one Replicate Home challenger')) {
  fail('Home challenger attempt marker must precede provider execution');
}

const exactGoogleAuth = 'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093';
const smokeAuthRefs = [...smoke.matchAll(/google-github-actions\/auth@([^\s#]+)/g)].map((match) => match[0]);
if (smokeAuthRefs.length === 0) fail('Replicate smoke workflow is missing Google WIF auth');
for (const ref of smokeAuthRefs) {
  if (ref !== exactGoogleAuth) fail(`Replicate smoke workflow contains noncanonical Google auth reference ${JSON.stringify(ref)}`);
}

for (const required of [grantProjectVar, providerVar, serviceAccountVar, "test \"$EXPECTED_PROJECT_ID\" != 'urai-4dc1d'", 'google-github-actions/auth@7c6bc770dae815cd3e89ee6cdf493a5fab2cc093']) {
  if (!grant.includes(required)) fail(`grant workflow missing protected dedicated-target/WIF contract ${JSON.stringify(required)}`);
}
for (const [label, workflow] of [['smoke', smoke], ['grant', grant]]) {
  for (const forbidden of ['PROJECT_ID: urai-4dc1d', 'EXPECTED_PROJECT_ID: urai-4dc1d', 'asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com']) {
    if (workflow.includes(forbidden)) fail(`${label} workflow still hard-codes shared provider authority ${JSON.stringify(forbidden)}`);
  }
}
for (const forbidden of ['REPLICATE_API_TOKEN=%', 'https://api.replicate.com/v1/predictions', 'workflow_run:', 'google-github-actions/auth@v3']) {
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
