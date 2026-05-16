#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  {
    path: 'assetfactory-studio/lib/server/assetQueueDispatcher.ts',
    required: [
      'retryAfter',
      'retryAfter <= now',
      'leaseId: null',
      'workerId: null',
      'deadLetterSupported: true',
      'retryBackoffSupported: true',
      'dead-lettered',
      'maximum attempts exceeded before claim',
      'completeAssetQueueJob',
      'failAssetQueueJob',
      'heartbeatAssetQueueJob',
    ],
  },
  {
    path: 'assetfactory-studio/app/api/worker/asset-queue/route.ts',
    required: [
      'timingSafeEqual',
      'safeEquals',
      'ASSET_FACTORY_WORKER_SECRET',
      'claim-and-run',
      'heartbeat',
      'complete',
      'fail',
      'claimNextAssetQueueJob',
      'completeAssetQueueJob',
      'failAssetQueueJob',
    ],
  },
  {
    path: 'assetfactory-studio/app/api/admin/queue/requeue/route.ts',
    required: [
      'requeueAssetQueueJob',
      "'operator'",
      'authorizeAssetRequest',
    ],
  },
];

const failures = [];
for (const check of checks) {
  const absolute = path.join(root, check.path);
  if (!fs.existsSync(absolute)) {
    failures.push(`${check.path}: missing file`);
    continue;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  for (const needle of check.required) {
    if (!source.includes(needle)) failures.push(`${check.path}: missing ${needle}`);
  }
}

if (failures.length > 0) {
  console.error('FAIL worker queue hardening checks');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS worker queue hardening checks');
