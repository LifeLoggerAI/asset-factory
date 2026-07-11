import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const studioRoot = path.join(root, 'assetfactory-studio');
const typescriptPath = path.join(studioRoot, 'node_modules', 'typescript', 'lib', 'typescript.js');

if (!fs.existsSync(typescriptPath)) {
  console.error(`Missing TypeScript dependency at ${typescriptPath}. Run npm --prefix assetfactory-studio install first.`);
  process.exit(2);
}

const ts = await import(pathToFileURL(typescriptPath).href);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-validation-import-'));
const compiledDir = path.join(tmpDir, 'compiled', 'lib', 'server');
fs.mkdirSync(compiledDir, { recursive: true });

function compile(relativePath, patches = []) {
  const sourcePath = path.join(studioRoot, 'lib', 'server', relativePath);
  let source = fs.readFileSync(sourcePath, 'utf8');
  for (const [from, to] of patches) {
    assert.ok(source.includes(from), `${relativePath} patch source missing: ${from}`);
    source = source.replace(from, to);
  }
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    fileName: relativePath,
  }).outputText;
  const outputPath = path.join(compiledDir, relativePath.replace(/\.ts$/, '.mjs'));
  fs.writeFileSync(outputPath, output);
  return outputPath;
}

try {
  compile('assetTypeCatalog.ts');
  compile('assetSpatialContractTypes.ts');
  compile('assetSpatialContract.ts', [
    ["from './assetSpatialContractTypes';", "from './assetSpatialContractTypes.mjs';"],
  ]);
  const validationPath = compile('assetFactoryValidation.ts', [
    ["import { isSupportedAssetType, supportedAssetTypeNames } from './assetTypeCatalog';", "import { isSupportedAssetType, supportedAssetTypeNames } from './assetTypeCatalog.mjs';"],
    ["import { resolveAssetType } from './assetTypeCatalog';", "import { resolveAssetType } from './assetTypeCatalog.mjs';"],
    ["import { validateSpatialModelContract } from './assetSpatialContract';", "import { validateSpatialModelContract } from './assetSpatialContract.mjs';"],
  ]);

  const { validateGenerateRequest } = await import(pathToFileURL(validationPath).href);

  assert.equal(validateGenerateRequest({
    jobId: 'job-graphic-valid',
    tenantId: 'tenant-a',
    prompt: 'moonlit orb companion',
    type: 'graphic',
  }), null);

  assert.equal(validateGenerateRequest({
    jobId: 'job-spatial-wrong-type',
    tenantId: 'tenant-a',
    prompt: 'walkable environment',
    type: 'graphic',
    metadata: { spatialModelContract: { worldRole: 'environment' } },
  }), 'spatialModelContract requires model3d type');

  assert.equal(validateGenerateRequest({
    jobId: 'job-spatial-valid',
    tenantId: 'tenant-a',
    prompt: 'walkable environment',
    type: 'model3d',
    metadata: {
      spatialModelContract: {
        worldRole: 'environment',
        releaseVersion: 'v1',
        collisionMode: 'navmesh',
        platformTargets: ['web', 'quest'],
        proofState: 'draft',
        promotionState: 'review-required',
      },
    },
  }), null);

  console.log('PASS compiled Asset Factory validation imports and behavior');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
