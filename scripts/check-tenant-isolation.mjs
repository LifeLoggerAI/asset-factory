#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const protectedRoutes = [
  {
    path: 'assetfactory-studio/app/api/generate/route.ts',
    mustContain: ['authorizeAssetRequest', 'request.tenantId', 'tenantId'],
  },
  {
    path: 'assetfactory-studio/app/api/generated-assets/[file]/route.ts',
    mustContain: ['findAsset', 'authorizeAssetRequest', 'assetRecord.tenantId'],
  },
  {
    path: 'assetfactory-studio/app/api/jobs/[jobId]/materialize/route.ts',
    mustContain: ['getAssetQueueItem', 'authorizeAssetRequest', 'item.tenantId'],
  },
  {
    path: 'assetfactory-studio/app/api/jobs/[jobId]/queue/route.ts',
    mustContain: ['getAssetQueueItem', 'authorizeAssetRequest', 'item.tenantId'],
  },
  {
    path: 'assetfactory-studio/app/api/jobs/[jobId]/publish/route.ts',
    mustContain: ['findJob', 'authorizeAssetRequest', 'job.tenantId'],
  },
  {
    path: 'assetfactory-studio/app/api/jobs/[jobId]/approve/route.ts',
    mustContain: ['findAsset', 'authorizeAssetRequest', 'existingAsset.tenantId', "'publisher'"],
  },
  {
    path: 'assetfactory-studio/app/api/jobs/[jobId]/rollback/route.ts',
    mustContain: ['findAsset', 'authorizeAssetRequest', 'existingAsset.tenantId', "'publisher'"],
  },
  {
    path: 'assetfactory-studio/app/api/admin/queue/requeue/route.ts',
    mustContain: ['authorizeAssetRequest', "'operator'"],
  },
];

const failures = [];

for (const route of protectedRoutes) {
  const absolutePath = path.join(root, route.path);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${route.path}: missing route file`);
    continue;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  for (const needle of route.mustContain) {
    if (!source.includes(needle)) failures.push(`${route.path}: missing ${needle}`);
  }
}

const authPath = path.join(root, 'assetfactory-studio/lib/server/assetAuth.ts');
const apiKeyPath = path.join(root, 'assetfactory-studio/lib/server/apiAuth.ts');
const authSource = fs.existsSync(authPath) ? fs.readFileSync(authPath, 'utf8') : '';
const apiKeySource = fs.existsSync(apiKeyPath) ? fs.readFileSync(apiKeyPath, 'utf8') : '';

for (const needle of [
  'ASSET_FACTORY_REQUIRE_AUTH',
  'ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH',
  'ASSET_FACTORY_JWT_HS256_SECRET',
  'ASSET_FACTORY_REQUIRE_JWT_SIGNATURE',
  'ASSET_FACTORY_TENANT_CLAIM',
  'ASSET_FACTORY_ROLE_CLAIM',
  'Tenant mismatch',
]) {
  if (!authSource.includes(needle)) failures.push(`assetAuth.ts: missing ${needle}`);
}

for (const needle of ['x-asset-factory-api-key', 'timingSafeEqual']) {
  if (!apiKeySource.includes(needle)) failures.push(`apiAuth.ts: missing ${needle}`);
}

if (failures.length > 0) {
  console.error('FAIL tenant isolation guard checks');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS tenant isolation guard checks');
