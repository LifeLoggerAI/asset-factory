import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const root = new URL('../assetfactory-studio/lib/server/', import.meta.url);
const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
function actualModule(file, replacements = []) {
  let source = fs.readFileSync(new URL(file, root), 'utf8');
  for (const [from, to] of replacements) {
    assert(source.includes(from), `Required actual module import ${from}`);
    source = source.replace(from, to);
  }
  return moduleUrl(stripTypeScriptTypes(source));
}
const types = actualModule('assetSpatialContractTypes.ts');
const contract = actualModule('assetSpatialContract.ts', [["'./assetSpatialContractTypes'", JSON.stringify(types)]]);
const catalog = actualModule('assetTypeCatalog.ts');
// Providers are explicit zero-call test doubles. Renderer/catalog/contract
// modules are the actual source; these fixtures cannot request paid output.
const provider = moduleUrl('export async function renderWithConfiguredProvider() { return globalThis.__uraiSourceTestProvider ?? null; }');
const video = moduleUrl('export async function renderVideoWithConfiguredProvider() { throw new Error("Video provider calls blocked in source-only proof"); }');
const renderer = actualModule('assetRenderer.ts', [
  ["from './assetTypeCatalog'", 'from ' + JSON.stringify(catalog)],
  ["from './assetProviderRuntime'", 'from ' + JSON.stringify(provider)],
  ["from './assetVideoProviderRuntime'", 'from ' + JSON.stringify(video)],
  ["from './assetSpatialContract'", 'from ' + JSON.stringify(contract)],
]);
const { normalizeSpatialModelContract } = await import(contract);
const { renderAsset } = await import(renderer);
const declaration = () => ({
  worldRole: 'environment', releaseVersion: 'v3', collisionMode: 'navmesh',
  compressionState: 'compressed', platformTargets: ['web', 'mobile', 'quest'],
  lodTriangleBudgets: {high:120000,medium:60000,low:15000},
  proofState: 'device-verified', promotionState: 'promoted', productionReady: true,
  verificationScope: 'caller-attempted-authority',
});
function assertUnadmitted(contract) {
  assert.equal(contract.productionReady, false);
  assert.equal(contract.verificationScope, 'caller-declared-fields-only');
  assert.equal(contract.proofState, 'device-verified');
  assert.equal(contract.promotionState, 'promoted');
}
test('caller proof and promotion declarations cannot attest production readiness', () => {
  assertUnadmitted(normalizeSpatialModelContract(declaration()));
  assert.equal(normalizeSpatialModelContract(undefined).productionReady, false);
});
test('new actual local model manifest and GLTF extras remain unadmitted', async () => {
  delete globalThis.__uraiSourceTestProvider;
  const result = await renderAsset({jobId:'fixture-only-local',tenantId:'fixture',type:'model3d',prompt:'synthetic source proof',metadata:{spatialModelContract:declaration()}});
  assertUnadmitted(result.manifest.metadata.spatialModelContract);
  assert.equal(result.manifest.approvalStatus,'draft');
  const gltf = JSON.parse(result.assetBuffer.toString('utf8'));
  assertUnadmitted(gltf.extras.spatialModelContract);
});
test('successful provider output cannot transfer its readiness claim to new manifest', async () => {
  globalThis.__uraiSourceTestProvider = {extension:'glb',assetBuffer:Buffer.from('test-double-not-a-real-GLB'),assetMimeType:'model/gltf-binary',metadata:{spatialModelContract:{productionReady:true,verificationScope:'provider-attempted-authority'}}};
  try {
    const result = await renderAsset({jobId:'fixture-only-provider',tenantId:'fixture',type:'model3d',prompt:'test-double provider completion',metadata:{spatialModelContract:declaration()}});
    assert.equal(result.manifest.metadata.providerBacked,true);
    assertUnadmitted(result.manifest.metadata.spatialModelContract);
    assert.equal(result.manifest.approvalStatus,'draft');
  } finally { delete globalThis.__uraiSourceTestProvider; }
});
