#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const smokeWorkflowPath = path.join(root, '.github/workflows/deploy-asset-factory.yml');
const productionReadinessPath = path.join(root, '.github/workflows/production-readiness.yml');

function fail(message) {
  console.error(`FAIL deploy workflow: ${message}`);
  process.exit(1);
}

for (const requiredPath of [smokeWorkflowPath, productionReadinessPath]) {
  if (!fs.existsSync(requiredPath)) fail(`missing ${path.relative(root, requiredPath)}`);
}

const smokeWorkflow = fs.readFileSync(smokeWorkflowPath, 'utf8');
const productionReadiness = fs.readFileSync(productionReadinessPath, 'utf8');

const smokeRequired = [
  'name: Verify Deployed Asset Factory', 'workflow_dispatch:',
  'description: Existing deployed target to verify',
  "environment: ${{ inputs.environment == 'production' && 'asset-factory-production' || 'staging' }}",
  'Checkout exact dispatch commit', 'ref: ${{ github.sha }}', 'persist-credentials: false',
  'Verify exact clean dispatch identity and smoke-only boundary', "ASSET_FACTORY_SMOKE_READONLY: 'true'",
  'Deploy workflow boundary gate', 'https://staging.uraiassetfactory.com', 'vars.ASSET_FACTORY_BASE_URL',
  'Canonical consumer URL is forbidden.',
  'prod-smoke', 'prod-smoke-denied', 'smoke-tenant-a', 'smoke-tenant-b', 'npm run smoke:website',
  'Authenticated read-only smoke', 'npm run smoke:staging', 'npm run smoke:prod',
  'test "$ASSET_FACTORY_SMOKE_READONLY" = true', 'Deployment performed: false',
  'Production deploy workflow: Asset Factory Production Readiness', 'Production deploy confirmation: DEPLOY_ASSET_FACTORY',
  'Read-only smoke enforced globally: true', 'Authenticated read-only smoke requested:', 'Firebase mutation allowed: false',
  'Upload smoke evidence', 'actions/upload-artifact@v4',
  'This artifact verifies an existing deployment. It performs no Firebase deployment',
  'Final evidence template: docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md',
  'Final evidence path: docs/release-evidence/YYYY-MM-DD-environment.md',
  'Final validator command: npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md'
];
for (const phrase of smokeRequired) if (!smokeWorkflow.includes(phrase)) fail(`smoke-only workflow missing ${JSON.stringify(phrase)}`);

const readonlyAssertions = smokeWorkflow.match(/test "\$ASSET_FACTORY_SMOKE_READONLY" = true/g) ?? [];
if (readonlyAssertions.length < 2) fail('smoke-only workflow must assert read-only mode before dispatch validation and authenticated smoke');

const smokeForbidden = [
  'deploy:', 'confirm:', 'FIREBASE_TOKEN', 'FIREBASE_SERVICE_ACCOUNT', 'firebase deploy', 'npm run deploy:',
  'Install Firebase CLI', 'Use Java 21 for Firebase CLI', 'DEPLOY_ASSET_FACTORY_STAGING', 'Deploy Firebase Studio',
  'Deployment or smoke target', 'Run the staging Firebase Studio deploy', 'Deploy allowed by this workflow',
  'Staging deploy command', 'fully production ready', 'system of systems complete',
  'This artifact is final completion-lock evidence', 'update the completion lock after this workflow passes'
];
for (const phrase of smokeForbidden) if (smokeWorkflow.includes(phrase)) fail(`smoke-only workflow contains forbidden deployment capability: ${JSON.stringify(phrase)}`);

const canonicalProductionRequired = [
  'name: Asset Factory Production Readiness', 'workflow_dispatch:', 'deploy:', 'confirm:',
  "inputs.deploy == true", "inputs.confirm == 'DEPLOY_ASSET_FACTORY'", "github.ref == 'refs/heads/main'",
  'environment: asset-factory-production', 'Require WIF deployment identity', 'GCP_WIF_PROVIDER', 'GCP_DEPLOY_SERVICE_ACCOUNT',
  'Authenticate to Google Cloud with WIF', 'google-github-actions/auth@v2', 'id: google_auth',
  'workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}', 'service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}',
  'create_credentials_file: true', 'export_environment_variables: false', 'Verify ephemeral deployment credential',
  'GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.google_auth.outputs.credentials_file_path }}',
  'ASSET_FACTORY_PROJECT_ID: ${{ vars.ASSET_FACTORY_PROJECT_ID }}',
  'ASSET_FACTORY_HOSTING_SITE: ${{ vars.ASSET_FACTORY_HOSTING_SITE }}',
  'ASSET_FACTORY_BASE_URL: ${{ vars.ASSET_FACTORY_BASE_URL }}',
  'ASSET_FACTORY_CUSTOM_DOMAIN_ALLOWLIST: ${{ vars.ASSET_FACTORY_CUSTOM_DOMAIN_ALLOWLIST }}',
  'ASSET_FACTORY_DIRECT_DEPLOY_CONFIRM: DEPLOY_DEDICATED_ASSET_FACTORY',
  'node scripts/run-dedicated-firebase-deploy.mjs hosting,functions,firestore,storage',
  'Remove ephemeral deployment credential', 'CREDENTIAL_PATH: ${{ steps.google_auth.outputs.credentials_file_path }}'
];
for (const phrase of canonicalProductionRequired) if (!productionReadiness.includes(phrase)) fail(`canonical production deploy workflow missing ${JSON.stringify(phrase)}`);

const productionForbidden = [
  'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_TOKEN', 'credentials_json', '--token',
  'firebase-service-account.json', 'Write service account', 'Remove service-account file', 'export_environment_variables: true'
];
for (const phrase of productionForbidden) if (productionReadiness.includes(phrase)) fail(`canonical production deploy workflow contains forbidden long-lived or globally exported auth path: ${JSON.stringify(phrase)}`);

const workflowPermissionSection = productionReadiness.split('\nconcurrency:', 1)[0];
if (workflowPermissionSection.includes('id-token: write')) fail('workflow-level permissions must not grant OIDC token minting to verification jobs');

const productionDeploySection = productionReadiness.split('\n  deploy:\n', 2)[1];
if (!productionDeploySection) fail('canonical production deploy job is missing');
if (!productionDeploySection.includes("github.event_name == 'workflow_dispatch'")) fail('canonical production deploy is not dispatch-only');
if (!productionDeploySection.includes("inputs.confirm == 'DEPLOY_ASSET_FACTORY'")) fail('canonical production deploy lacks exact confirmation');
if (!productionDeploySection.includes('environment: asset-factory-production')) fail('canonical production deploy lacks protected environment');
if (!productionDeploySection.includes('permissions:\n      contents: read\n      id-token: write')) fail('canonical deploy job must scope OIDC permission to the deploy job');
if (!productionDeploySection.includes("ASSET_FACTORY_SMOKE_READONLY: 'true'")) fail('canonical production deploy must force read-only post-deploy smoke');

function parseSteps(section) {
  const lines = section.split('\n');
  const stepsLine = lines.findIndex((line) => line === '    steps:');
  if (stepsLine < 0) fail('canonical production deploy job has no steps sequence');
  const steps = [];
  let current = null;
  for (let index = stepsLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  \S/.test(line)) break;
    if (/^      -(?:\s.*)?$/.test(line)) {
      if (current) steps.push(current);
      current = { lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) steps.push(current);
  return steps.map((step) => step.lines.join('\n'));
}

function stepByName(steps, name) {
  const marker = `- name: ${name}`;
  const matches = steps.filter((step) => step.includes(marker));
  if (matches.length !== 1) fail(`expected exactly one ${JSON.stringify(name)} step, found ${matches.length}`);
  return matches[0];
}

function exactRunCommands(step) {
  const lines = step.split('\n');
  const runLine = lines.findIndex((line) => /^        run:\s*\|\s*$/.test(line));
  if (runLine < 0) return null;

  const blockLines = [];
  for (let index = runLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^        \S/.test(line)) break;
    if (line.trim() && (line.match(/^\s*/)?.[0].length ?? 0) <= 8) break;
    blockLines.push(line);
  }

  const nonBlank = blockLines.filter((line) => line.trim());
  if (!nonBlank.length) return [];
  const minIndent = Math.min(...nonBlank.map((line) => line.match(/^\s*/)?.[0].length ?? 0));
  if (minIndent <= 8) fail('run block scalar is not indented beneath the step key');

  return blockLines
    .map((line) => line.trim() ? line.slice(minIndent) : '')
    .filter((line) => line !== '');
}

const deploySteps = parseSteps(productionDeploySection);
const names = [
  'Checkout exact main candidate', 'Verify exact clean main identity', 'Install Firebase CLI', 'Install dependencies', 'Build',
  'Authenticate to Google Cloud with WIF', 'Verify ephemeral deployment credential', 'Deploy',
  'Remove ephemeral deployment credential', 'Read-only smoke production finalization endpoints'
];
const indexed = new Map(names.map((name) => [name, deploySteps.indexOf(stepByName(deploySteps, name))]));
for (let index = 1; index < names.length; index += 1) {
  if (indexed.get(names[index - 1]) >= indexed.get(names[index])) fail(`security step order invalid: ${names[index - 1]} must precede ${names[index]}`);
}

const authIndex = indexed.get('Authenticate to Google Cloud with WIF');
const credentialCheckIndex = indexed.get('Verify ephemeral deployment credential');
const deployIndex = indexed.get('Deploy');
const cleanupIndex = indexed.get('Remove ephemeral deployment credential');
const smokeIndex = indexed.get('Read-only smoke production finalization endpoints');
if (credentialCheckIndex !== authIndex + 1 || deployIndex !== credentialCheckIndex + 1 || cleanupIndex !== deployIndex + 1 || smokeIndex !== cleanupIndex + 1) {
  fail('credential lifetime must be exactly auth -> credential check -> deploy -> cleanup -> smoke with no intervening step');
}

const authStep = deploySteps[authIndex];
if (!authStep.includes('id: google_auth') || !authStep.includes('export_environment_variables: false')) fail('WIF auth must expose only its step output and must not export ADC globally');

const credentialCheckStep = deploySteps[credentialCheckIndex];
if (!credentialCheckStep.includes('GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.google_auth.outputs.credentials_file_path }}')) fail('credential check must scope ADC through step env');
const credentialCommands = exactRunCommands(credentialCheckStep);
const expectedCredentialCommands = ['set -euo pipefail', 'test -n "${GOOGLE_APPLICATION_CREDENTIALS:-}"', 'test -f "$GOOGLE_APPLICATION_CREDENTIALS"'];
if (!credentialCommands || JSON.stringify(credentialCommands) !== JSON.stringify(expectedCredentialCommands)) fail('ephemeral credential check must contain only the exact approved commands');

const deployStep = deploySteps[deployIndex];
if (!deployStep.includes('GOOGLE_APPLICATION_CREDENTIALS: ${{ steps.google_auth.outputs.credentials_file_path }}')) fail('deploy must receive ADC only through step env');
if (!deployStep.includes('ASSET_FACTORY_DIRECT_DEPLOY_CONFIRM: DEPLOY_DEDICATED_ASSET_FACTORY')) fail('deploy must require the exact dedicated-target confirmation');
if (!deployStep.includes('run: node scripts/run-dedicated-firebase-deploy.mjs hosting,functions,firestore,storage')) fail('deploy must use the dedicated-project/site wrapper');

const cleanupStep = deploySteps[cleanupIndex];
if (!cleanupStep.includes('CREDENTIAL_PATH: ${{ steps.google_auth.outputs.credentials_file_path }}')) fail('cleanup must receive the generated credential path explicitly');
for (const requiredLine of ['rm -f -- "$CREDENTIAL_PATH"', 'test ! -e "$CREDENTIAL_PATH"']) {
  if (!cleanupStep.includes(requiredLine)) fail(`credential cleanup missing ${JSON.stringify(requiredLine)}`);
}

const smokeStep = deploySteps[smokeIndex];
for (const requiredLine of ['test -z "${GOOGLE_APPLICATION_CREDENTIALS:-}"', 'test -z "${CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE:-}"', 'test -z "${GOOGLE_GHA_CREDS_PATH:-}"', 'npm run smoke:production-finalization']) {
  if (!smokeStep.includes(requiredLine)) fail(`read-only smoke missing ${JSON.stringify(requiredLine)}`);
}
if (/GOOGLE_APPLICATION_CREDENTIALS:\s*\$\{\{ steps\.google_auth/.test(smokeStep)) fail('read-only smoke must not receive the deployment ADC');

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dedicatedDeployScript = fs.readFileSync(path.join(root, 'scripts/run-dedicated-firebase-deploy.mjs'), 'utf8');
const deployScripts = ['deploy:firebase', 'deploy:hosting-rules', 'deploy:functions', 'deploy:studio'];
for (const scriptName of deployScripts) {
  const command = packageJson.scripts?.[scriptName] ?? '';
  if (!command.includes('run-dedicated-firebase-deploy.mjs')) fail(`${scriptName} must use the dedicated-target deploy wrapper`);
  if (command.includes('urai-4dc1d') || command.includes('firebase deploy')) fail(`${scriptName} retains direct canonical/deploy authority`);
}
for (const scriptName of ['deploy:verify', 'deploy:verify-readonly', 'deploy:verify-custom-domain']) {
  const command = packageJson.scripts?.[scriptName] ?? '';
  if (command.includes('urai-4dc1d.web.app')) fail(`${scriptName} retains the canonical consumer URL`);
}
for (const manifestPath of ['package.json', 'functions/package.json', 'life-map-pipeline/functions/package.json']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
  for (const [scriptName, command] of Object.entries(manifest.scripts ?? {})) {
    if (!scriptName.startsWith('deploy')) continue;
    if (String(command).includes('firebase deploy')) fail(`${manifestPath} ${scriptName} bypasses the dedicated-target deploy wrapper`);
    if (scriptName === 'deploy' && !String(command).includes('run-dedicated-firebase-deploy.mjs')) {
      fail(`${manifestPath} ${scriptName} must use the dedicated-target deploy wrapper`);
    }
  }
}
for (const phrase of [
  'ASSET_FACTORY_PROJECT_ID', 'ASSET_FACTORY_HOSTING_SITE', 'ASSET_FACTORY_BASE_URL',
  'ASSET_FACTORY_CUSTOM_DOMAIN_ALLOWLIST', 'allowedHosts',
  'DEPLOY_DEDICATED_ASSET_FACTORY', "source.hosting = { ...source.hosting, site: hostingSite }",
  "'--config', runtimeConfig", "'--project', projectId", "'--only', scopes",
  "projectId === 'urai-4dc1d'", "hostingSite === 'urai-4dc1d'",
]) {
  if (!dedicatedDeployScript.includes(phrase)) fail(`dedicated deploy wrapper missing ${JSON.stringify(phrase)}`);
}
if (!dedicatedDeployScript.includes("shell: false")) fail('dedicated deploy wrapper must not invoke a shell');
if (!dedicatedDeployScript.includes("rmSync(runtimeDirectory, { recursive: true, force: true })")) fail('dedicated deploy wrapper must remove its runtime config');

console.log('PASS deploy workflow static checks');
