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
  'CRON_SECRET',
  'Deploy Firebase Studio',
  'npm run deploy:studio',
  'https://staging.uraiassetfactory.com',
  'https://www.uraiassetfactory.com',
  'prod-smoke',
  'prod-smoke-denied',
  'smoke-tenant-a',
  'smoke-tenant-b',
  'npm run smoke:website',
  'npm run smoke:staging',
  'npm run smoke:prod',
  'Deploy command: npm run deploy:studio',
  'Node runtime: 22',
  'Java runtime: 21',
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
  'npm run deploy:firebase -- --token',
  'Use Node.js 20\n        uses: actions/setup-node@v4\n        with:\n          node-version: \'20.19.0\'',
  'fully production ready',
  'system of systems complete'
];

for (const phrase of forbiddenPhrases) {
  if (workflow.includes(phrase)) {
    fail(`forbidden fragile or premature phrase found: ${JSON.stringify(phrase)}`);
  }
}

console.log('PASS deploy workflow static checks');
