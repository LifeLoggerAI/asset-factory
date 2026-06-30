#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['assetfactory-studio/app/api/generate/route.ts', ['requireAssetFactoryApiKey(req)', 'authorizeAssetRequest(req']],
  ['assetfactory-studio/app/api/jobs/route.ts', ['requireAssetFactoryApiKey(req)', 'authorizeAssetRequest(req']],
  ['assetfactory-studio/app/api/jobs/[jobId]/materialize/route.ts', ['requireAssetFactoryApiKey(req)', 'authorizeAssetRequest(req']],
  ['assetfactory-studio/app/api/jobs/[jobId]/publish/route.ts', ['requireAssetFactoryApiKey(req)', 'authorizeAssetRequest(req']],
  ['assetfactory-studio/app/api/jobs/[jobId]/approve/route.ts', ['requireAssetFactoryApiKey(req)', 'findAsset(jobId)', 'authorizeAssetRequest(req, existingAsset.tenantId']],
];

const failures = [];
for (const [file, markers] of checks) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    failures.push(`missing file: ${file}`);
    continue;
  }
  const source = fs.readFileSync(full, 'utf8');
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${file} missing ${marker}`);
  }
}

if (failures.length) {
  console.error('FAIL asset factory route guard check');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS asset factory route guard check');
