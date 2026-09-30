#!/usr/bin/env node
import fs from 'node:fs';

const path = '.github/workflows/grant-replicate-apphosting-secret.yml';
const text = fs.readFileSync(path, 'utf8');

function fail(message) {
  console.error(`FAIL Replicate rollout trigger boundary: ${message}`);
  process.exit(1);
}

if (!text.includes('workflow_dispatch:')) {
  fail('workflow must remain explicit manual workflow_dispatch only');
}

for (const forbidden of ['workflow_run:', 'schedule:', 'push:', 'pull_request:', 'repository_dispatch:']) {
  if (text.includes(forbidden)) fail(`forbidden automatic trigger present: ${forbidden}`);
}

console.log('PASS Replicate rollout trigger boundary: manual-only');
