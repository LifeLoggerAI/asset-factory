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
  'Deploy workflow boundary gate', 'https://staging.uraiassetfactory.com', 'https://urai-4dc1d.web.app',
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

const failClosedRequired = [
  'name: Asset Factory Production Readiness', 'workflow_dispatch:', 'deploy:', 'confirm:',
  "inputs.deploy == true", 'Production deployment fail-closed',
  'Checkout exact dispatch candidate', 'Verify exact clean dispatch identity',
  'Fail closed until dedicated Asset Factory hosting target is provider-proven',
  'provider-native inventory has not yet proved the dedicated Asset Factory hosting target',
  'The consumer Firebase Hosting site urai-4dc1d is explicitly prohibited as the Asset Factory web target.',
  'No OIDC token, Firebase credential, hosting mutation, function deployment, DNS mutation, or production data mutation is performed by this workflow.',
  'exit 1'
];
for (const phrase of failClosedRequired) if (!productionReadiness.includes(phrase)) fail(`production fail-closed workflow missing ${JSON.stringify(phrase)}`);

const productionForbidden = [
  'firebase deploy', 'Install Firebase CLI', 'google-github-actions/auth@', 'id-token: write',
  'GCP_WIF_PROVIDER', 'GCP_DEPLOY_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_TOKEN', 'credentials_json', '--token',
  'firebase-service-account.json', 'Write service account', 'Remove service-account file',
  'GOOGLE_APPLICATION_CREDENTIALS', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'GOOGLE_GHA_CREDS_PATH'
];
for (const phrase of productionForbidden) if (productionReadiness.includes(phrase)) fail(`production readiness must remain mutation-disabled until a dedicated provider target is proven: ${JSON.stringify(phrase)}`);

if (!productionReadiness.includes("test \"${{ inputs.confirm }}\" = \"DEPLOY_ASSET_FACTORY\"")) fail('fail-closed dispatch must require exact steward confirmation before evaluating the provider boundary');
if (!productionReadiness.includes('test "$GITHUB_REF" = "refs/heads/main"')) fail('fail-closed dispatch must require main');
if (!productionReadiness.includes('test "$(git rev-parse HEAD)" = "$ASSET_FACTORY_EXACT_HEAD"')) fail('fail-closed dispatch must verify exact head');
if (!productionReadiness.includes('test -z "$(git status --porcelain --untracked-files=all)"')) fail('fail-closed dispatch must verify a clean checkout');

console.log('PASS deploy workflow static checks: verification-only smoke retained; production mutation fails closed until dedicated Asset Factory target is provider-proven');
