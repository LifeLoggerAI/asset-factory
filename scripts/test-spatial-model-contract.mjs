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
const compiledDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-spatial-contract-'));

function compile(relativePath, replacements = []) {
  let source = fs.readFileSync(path.join(studioRoot, relativePath), 'utf8');
  for (const [from, to] of replacements) source = source.replace(from, to);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      skipLibCheck: true,
    },
    fileName: relativePath,
  }).outputText;
  const outputPath = path.join(compiledDir, path.basename(relativePath).replace(/\.ts$/, '.mjs'));
  fs.writeFileSync(outputPath, output);
  return outputPath;
}

compile('lib/server/assetSpatialContractTypes.ts');
const contractPath = compile('lib/server/assetSpatialContract.ts', [
  ["from './assetSpatialContractTypes';", "from './assetSpatialContractTypes.mjs';"],
]);
const { normalizeSpatialModelContract, validateSpatialModelContract } = await import(pathToFileURL(contractPath).href);

assert.equal(validateSpatialModelContract(undefined), null);
assert.equal(validateSpatialModelContract('bad'), 'invalid spatialModelContract');
assert.equal(validateSpatialModelContract({ worldRole: 'unknown' }), 'invalid spatialModelContract.worldRole');
assert.equal(
  validateSpatialModelContract({ platformTargets: ['web', 'web'] }),
  'invalid spatialModelContract.platformTargets',
);
assert.equal(
  validateSpatialModelContract({ lodTriangleBudgets: { high: 1000, medium: 2000, low: 500 } }),
  'invalid spatialModelContract.lodTriangleBudgets.order',
);

const defaults = normalizeSpatialModelContract(undefined);
assert.equal(defaults.contractVersion, 1);
assert.equal(defaults.worldRole, 'unspecified');
assert.equal(defaults.releaseVersion, 'unassigned');
assert.equal(defaults.productionReady, false);

const verified = normalizeSpatialModelContract({
  worldRole: 'environment',
  releaseVersion: 'v3',
  lodTriangleBudgets: { high: 120000, medium: 60000, low: 15000 },
  collisionMode: 'navmesh',
  compressionState: 'compressed',
  platformTargets: ['web', 'quest', 'vr'],
  proofState: 'device-verified',
  promotionState: 'promoted',
});
assert.equal(validateSpatialModelContract(verified), null);
assert.equal(verified.productionReady, true);

const validationSource = fs.readFileSync(path.join(studioRoot, 'lib/server/assetFactoryValidation.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(studioRoot, 'lib/server/assetRenderer.ts'), 'utf8');
assert.match(validationSource, /spatialModelContract requires model3d type/);
assert.match(validationSource, /validateSpatialModelContract\(spatialContract\)/);
assert.match(rendererSource, /normalizeSpatialModelContract/);
assert.match(rendererSource, /spatialModelContract/);
assert.match(rendererSource, /providerBacked: true/);

console.log('PASS spatial model production contract');
