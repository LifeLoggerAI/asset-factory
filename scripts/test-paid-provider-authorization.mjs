import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studioRoot = path.join(root, 'assetfactory-studio');
const typescriptPath = path.join(studioRoot, 'node_modules', 'typescript', 'lib', 'typescript.js');
if (!fs.existsSync(typescriptPath)) {
  console.error(`Missing TypeScript dependency at ${typescriptPath}.`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const sourcePath = path.join(studioRoot, 'lib', 'server', 'assetProviderAdapters.ts');
const source = fs.readFileSync(sourcePath, 'utf8').replace(
  "import type { CanonicalAssetType } from './assetFactoryTypes';",
  "type CanonicalAssetType = 'graphic' | 'model3d' | 'audio' | 'bundle';",
);
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paid-provider-auth-'));
const modulePath = path.join(tmpDir, 'assetProviderAdapters.mjs');
fs.writeFileSync(modulePath, output);

const original = {
  provider: process.env.ASSET_FACTORY_MEDIA_PROVIDER,
  enabled: process.env.ASSET_FACTORY_ENABLE_PAID_MEDIA,
  approval: process.env.ASSET_FACTORY_PAID_APPROVAL_ID,
  ceiling: process.env.ASSET_FACTORY_PAID_MAX_COST_CENTS,
};

try {
  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'replicate';
  process.env.ASSET_FACTORY_ENABLE_PAID_MEDIA = 'true';
  process.env.ASSET_FACTORY_PAID_APPROVAL_ID = 'test-approval';

  const adapters = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);

  process.env.ASSET_FACTORY_PAID_MAX_COST_CENTS = '1';
  assert.equal(adapters.configuredProviderName(), 'local-proof');
  assert.equal(adapters.getPaidProviderAuthorization().authorized, false);
  assert.throws(
    () => adapters.assertPaidProviderRequestAuthorized(2),
    /not authorized|exceeds approved ceiling/,
  );

  process.env.ASSET_FACTORY_PAID_MAX_COST_CENTS = '34';
  assert.equal(adapters.configuredProviderName(), 'replicate');
  assert.equal(adapters.getPaidProviderAuthorization().authorized, true);
  assert.doesNotThrow(() => adapters.assertPaidProviderRequestAuthorized(34));

  process.env.ASSET_FACTORY_PAID_MAX_COST_CENTS = '40';
  assert.throws(
    () => adapters.assertPaidProviderRequestAuthorized(41),
    /exceeds approved ceiling/,
  );

  console.log('PASS paid provider authorization ceilings');
} finally {
  for (const [key, value] of Object.entries(original)) {
    const envName = {
      provider: 'ASSET_FACTORY_MEDIA_PROVIDER',
      enabled: 'ASSET_FACTORY_ENABLE_PAID_MEDIA',
      approval: 'ASSET_FACTORY_PAID_APPROVAL_ID',
      ceiling: 'ASSET_FACTORY_PAID_MAX_COST_CENTS',
    }[key];
    if (value === undefined) delete process.env[envName];
    else process.env[envName] = value;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
