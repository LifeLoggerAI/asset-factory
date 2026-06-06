import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const defaultManifestPath = 'schemas/examples/urai-runtime-spatial-proof.json';
const manifestPath = process.argv[2] || defaultManifestPath;
const manifest = JSON.parse(fs.readFileSync(path.resolve(root, manifestPath), 'utf8'));
const modelUrl = manifest.glbUrl || manifest.gltfUrl || manifest.modelUrl || '';
const cleanModelUrl = String(modelUrl).toLowerCase().split('?')[0].split('#')[0];
const errors = [];

if (!['model-glb', 'model-gltf', 'spatial-scene', 'scene-manifest', 'particle-system'].includes(manifest.assetType)) errors.push('assetType must be spatial');
if (manifest.spatialReady !== true) errors.push('spatialReady must be true');
if (manifest.productionReady !== true) errors.push('productionReady must be true');
if (manifest.mobileReady !== true) errors.push('mobileReady must be true');
if (!manifest.performanceTier) errors.push('performanceTier is required');
if (!manifest.fallbackAsset) errors.push('fallbackAsset is required');
if (!modelUrl) errors.push('model url is required');
if (modelUrl && !cleanModelUrl.endsWith('.glb') && !cleanModelUrl.endsWith('.gltf')) errors.push('model must be glb or gltf');
if (!manifest.geometryType || manifest.geometryType === 'none' || manifest.geometryType === 'plane') errors.push('geometryType must be non-flat');
if (manifest.validation?.gltfValid !== true) errors.push('validation.gltfValid must be true');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  runtime: {
    camera: 'perspective',
    lighting: ['ambient', 'directional'],
    modelUrl,
    fallbackAsset: manifest.fallbackAsset,
    geometryType: manifest.geometryType,
  },
}, null, 2));
