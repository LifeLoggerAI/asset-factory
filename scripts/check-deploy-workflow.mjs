#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowPath = path.join(root, '.github/workflows/deploy-asset-factory.yml');

function fail(message) {
  console.error(`FAIL deploy workflow: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(workflowPath)) {
  fail('missing .github/workflows/deploy-asset-factory.yml');
}

const workflow = fs.readFileSync(workflowPath, 'utf8');

const requiredPhrases = [
  'name: Deploy Asset Factory',
  'workflow_dispatch:',
  'permissions:',
  'contents: read',
  'environment:',
  'staging',
  'production',
  'Use Node.js 22',
  "node-version: '22'",
  'Use Java 21 for Firebase CLI',
  "java-version: '21'",
  'Record exact workflow commit',
  'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
  'npm run doctor',
  'npm run test:launch-readiness',
  'npm run test:completion-lock',
  'npm run verify:local',
  'Validate required secrets',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'python -m json.tool "$GOOGLE_APPLICATION_CREDENTIALS"',
  'ASSET_FACTORY_API_KEY',
  'ASSET_FACTORY_BEARER_TOKEN',
  'ASSET_FACTORY_OTHER_BEARER_TOKEN',
  'CRON_SECRET',
  'Deploy Firebase Studio',
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
  'Deploy command: npm run deploy:studio',
  'Firebase authentication: application default credentials from environment-scoped service-account JSON',
  'Two-token support isolation smoke required: true',
  'Node runtime: 22',
  'Java runtime: 21',
  'Remove Firebase service account',
  'rm -f "$GOOGLE_APPLICATION_CREDENTIALS"',
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

const forbiddenPhrases = [
  'FIREBASE_TOKEN',
  '--token "$FIREBASE_TOKEN"',
  'ASSET_FACTORY_TENANT_ID: smoke-tenant-a\n          ASSET_FACTORY_OTHER_TENANT_ID: smoke-tenant-b\n        run: |\n          if [ "${{ inputs.environment }}" = "production" ]',
  'npm run deploy:firebase -- --token',
  'Use Node.js 20\n        uses: actions/setup-node@v4\n        with:\n          node-version: \'20.19.0\'',
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
