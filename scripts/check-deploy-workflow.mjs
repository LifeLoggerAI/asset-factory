#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/deploy-asset-factory.yml');
const productionReadinessPath = path.join(root, '.github/workflows/production-readiness.yml');

function fail(message) {
  console.error(`FAIL deploy workflow: ${message}`);
  process.exit(1);
}

for (const requiredPath of [workflowPath, productionReadinessPath]) {
  if (!fs.existsSync(requiredPath)) {
    fail(`missing ${path.relative(root, requiredPath)}`);
  }
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const productionReadiness = fs.readFileSync(productionReadinessPath, 'utf8');

const requiredPhrases = [
  'name: Deploy Asset Factory',
  'workflow_dispatch:',
  'confirm:',
  'DEPLOY_ASSET_FACTORY_STAGING',
  "environment: ${{ inputs.environment == 'production' && 'asset-factory-production' || 'staging' }}",
  'Checkout exact dispatch commit',
  'ref: ${{ github.sha }}',
  'persist-credentials: false',
  'Verify exact clean dispatch identity',
  'test "$GITHUB_REF" = refs/heads/main',
  'Production deployment is retired in this workflow.',
  'Deploy Firebase Studio to staging',
  "inputs.deploy && inputs.environment == 'staging'",
  'Use Node.js 22',
  "node-version: '22'",
  'Use Java 21 for Firebase CLI',
  "java-version: '21'",
  'npm run doctor',
  'npm run test:launch-readiness',
  'npm run test:completion-lock',
  'npm run verify:local',
  'Validate required secrets',
  'FIREBASE_TOKEN',
  'ASSET_FACTORY_API_KEY',
  'ASSET_FACTORY_BEARER_TOKEN',
  'ASSET_FACTORY_OTHER_BEARER_TOKEN',
  'CRON_SECRET',
  'npm run deploy:studio',
  'https://staging.uraiassetfactory.com',
  'https://urai-4dc1d.web.app',
  'prod-smoke',
  'prod-smoke-denied',
  'smoke-tenant-a',
  'smoke-tenant-b',
  'npm run smoke:website',
  'npm run smoke:staging',
  'npm run smoke:prod',
  'Deploy allowed by this workflow: staging only',
  'Production deploy workflow: Asset Factory Production Readiness',
  'Production deployment retired from this workflow: true',
  'Two-token support isolation smoke required: true',
  'Upload release evidence',
  'actions/upload-artifact@v4',
  'This artifact is a workflow run summary, not final completion-lock evidence.',
  'Evidence artifact type: workflow run summary (not final completion-lock evidence)',
  'Workflow run URL: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}',
  'Final evidence template: docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md',
  'Final evidence path: docs/release-evidence/YYYY-MM-DD-environment.md',
  'Final validator command: npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md',
  'Latest evidence validator command: npm run check:release-evidence:latest',
  'copy concrete evidence into docs/release-evidence/YYYY-MM-DD-environment.md',
  'only update the completion lock after staging and production evidence pass'
];

for (const phrase of requiredPhrases) {
  if (!workflow.includes(phrase)) {
    fail(`missing required phrase ${JSON.stringify(phrase)}`);
  }
}

const canonicalProductionPhrases = [
  'name: Asset Factory Production Readiness',
  'workflow_dispatch:',
  "confirm == 'DEPLOY_ASSET_FACTORY'",
  'environment: asset-factory-production',
  'FIREBASE_SERVICE_ACCOUNT',
  'github.ref == \'refs/heads/main\'',
  'Remove service-account file'
];
for (const phrase of canonicalProductionPhrases) {
  if (!productionReadiness.includes(phrase)) {
    fail(`canonical production deploy workflow missing ${JSON.stringify(phrase)}`);
  }
}

const deploySection = workflow
  .split('- name: Deploy Firebase Studio to staging', 2)[1]
  ?.split('- name: Read-only smoke', 1)[0];
if (!deploySection) {
  fail('cannot isolate staging deploy step');
}
if (!deploySection.includes("inputs.deploy && inputs.environment == 'staging'")) {
  fail('staging deploy step is not restricted to the staging target');
}
if (deploySection.includes("inputs.environment == 'production'")) {
  fail('alternate workflow contains a production deploy condition');
}

const forbiddenPhrases = [
  'environment: ${{ inputs.environment }}',
  '- name: Deploy Firebase Studio\n        if: ${{ inputs.deploy }}',
  'npm run deploy:firebase -- --token',
  'fully production ready',
  'system of systems complete',
  'WARN ASSET_FACTORY_OTHER_BEARER_TOKEN missing; skipping two-token support tenant isolation smoke',
  'This artifact is final completion-lock evidence',
  'Evidence artifact type: final completion-lock evidence',
  'update the completion lock after this workflow passes'
];

for (const phrase of forbiddenPhrases) {
  if (workflow.includes(phrase)) {
    fail(`forbidden fragile or premature phrase found: ${JSON.stringify(phrase)}`);
  }
}

console.log('PASS deploy workflow static checks');
