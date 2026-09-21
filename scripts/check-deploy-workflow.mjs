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
  'Deploy workflow boundary gate', 'https://staging.uraiassetfactory.com',
  'Production verification blocked: no dedicated Asset Factory production target has been provider-proven.',
  'consumer Firebase Hosting site urai-4dc1d is prohibited as the Asset Factory target',
  'smoke-tenant-a', 'smoke-tenant-b', 'npm run smoke:website',
  'Authenticated read-only smoke', 'npm run smoke:staging',
  'test "$ASSET_FACTORY_SMOKE_READONLY" = true', 'Deployment performed: false',
  'Production deployment boundary workflow: Asset Factory Production Readiness',
  'Production target provider-proven: false',
  'Read-only smoke enforced globally: true', 'Authenticated read-only smoke requested:', 'Firebase mutation allowed: false',
  'Upload smoke evidence', 'actions/upload-artifact@v4',
  'This artifact verifies an existing deployment only when a provider-proven target exists.',
  'Final evidence template: docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md',
  'Final evidence path: docs/release-evidence/YYYY-MM-DD-environment.md',
  'Final validator command: npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md'
];
for (const phrase of smokeRequired) if (!smokeWorkflow.includes(phrase)) fail(`smoke-only workflow missing ${JSON.stringify(phrase)}`);

const readonlyAssertions = smokeWorkflow.match(/test "\$ASSET_FACTORY_SMOKE_READONLY" = true/g) ?? [];
if (readonlyAssertions.length < 2) fail('smoke-only workflow must assert read-only mode before dispatch validation and authenticated smoke');

const smokeForbidden = [
  'https://urai-4dc1d.web.app',
  'deploy:', 'confirm:', 'FIREBASE_TOKEN', 'FIREBASE_SERVICE_ACCOUNT', 'firebase deploy', 'npm run deploy:',
  'Install Firebase CLI', 'Use Java 21 for Firebase CLI', 'DEPLOY_ASSET_FACTORY_STAGING', 'Deploy Firebase Studio',
  'Deployment or smoke target', 'Run the staging Firebase Studio deploy', 'Deploy allowed by this workflow',
  'Staging deploy command', 'fully production ready', 'system of systems complete',
  'This artifact is final completion-lock evidence', 'update the completion lock after this workflow passes',
  'Production deployment remains a separate explicitly confirmed operation'
];
for (const phrase of smokeForbidden) if (smokeWorkflow.includes(phrase)) fail(`smoke-only workflow contains forbidden deployment or false-target capability: ${JSON.stringify(phrase)}`);

const productionRequired = [
  'name: Asset Factory Production Readiness',
  'workflow_dispatch:',
  'deploy:',
  'confirm:',
  'Production deployment fail-closed',
  'inputs.deploy == true',
  'test "${{ inputs.confirm }}" = "DEPLOY_ASSET_FACTORY"',
  'test "$GITHUB_REF" = "refs/heads/main"',
  'Fail closed until dedicated Asset Factory hosting target is provider-proven',
  'provider-native inventory has not yet proved the dedicated Asset Factory hosting target',
  'The consumer Firebase Hosting site urai-4dc1d is explicitly prohibited as the Asset Factory web target.',
  'No OIDC token, Firebase credential, hosting mutation, function deployment, DNS mutation, or production data mutation is performed by this workflow.',
  'exit 1'
];
for (const phrase of productionRequired) if (!productionReadiness.includes(phrase)) fail(`production readiness workflow missing fail-closed marker ${JSON.stringify(phrase)}`);

const productionForbidden = [
  'id-token: write',
  'google-github-actions/auth@',
  'firebase deploy',
  'Install Firebase CLI',
  'GCP_WIF_PROVIDER',
  'GCP_DEPLOY_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_TOKEN',
  'credentials_json',
  '--token',
  'firebase-service-account.json',
  'Write service account',
  'Remove service-account file',
  'GOOGLE_APPLICATION_CREDENTIALS:'
];
for (const phrase of productionForbidden) if (productionReadiness.includes(phrase)) fail(`production readiness workflow still contains forbidden deployment capability: ${JSON.stringify(phrase)}`);

const providerBoundarySection = productionReadiness.split('\n  provider-boundary:\n', 2)[1];
if (!providerBoundarySection) fail('provider-boundary job is missing');
if (!providerBoundarySection.includes("github.event_name == 'workflow_dispatch'")) fail('provider boundary is not dispatch-only');
if (!providerBoundarySection.includes('permissions:\n      contents: read')) fail('provider boundary must remain contents-read only');
if (providerBoundarySection.includes('environment: asset-factory-production')) fail('provider boundary must not acquire a protected deployment environment before target proof');

console.log('PASS deploy workflow static checks: production deployment and production smoke remain fail-closed until dedicated Asset Factory target is provider-proven');
