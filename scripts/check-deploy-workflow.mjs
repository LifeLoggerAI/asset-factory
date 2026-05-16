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
  'environment:',
  'staging',
  'production',
  'npm run doctor',
  'npm run test:launch-readiness',
  'npm run test:completion-lock',
  'npm run verify:local',
  'Validate required secrets',
  'FIREBASE_TOKEN',
  'ASSET_FACTORY_API_KEY',
  'ASSET_FACTORY_BEARER_TOKEN',
  'CRON_SECRET',
  'https://staging.uraiassetfactory.com',
  'https://www.uraiassetfactory.com',
  'prod-smoke',
  'prod-smoke-denied',
  'smoke-tenant-a',
  'smoke-tenant-b',
  'npm run smoke:website',
  'npm run smoke:staging',
  'npm run smoke:prod',
  'Upload release evidence',
  'actions/upload-artifact@v4'
];

for (const phrase of requiredPhrases) {
  if (!workflow.includes(phrase)) {
    fail(`missing required phrase ${JSON.stringify(phrase)}`);
  }
}

const forbiddenPhrases = [
  'ASSET_FACTORY_TENANT_ID: smoke-tenant-a\n          ASSET_FACTORY_OTHER_TENANT_ID: smoke-tenant-b\n        run: |\n          if [ "${{ inputs.environment }}" = "production" ]',
  'fully production ready',
  'system of systems complete'
];

for (const phrase of forbiddenPhrases) {
  if (workflow.includes(phrase)) {
    fail(`forbidden fragile or premature phrase found: ${JSON.stringify(phrase)}`);
  }
}

console.log('PASS deploy workflow static checks');
