import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const sourceRoots = ['assetfactory-studio', 'functions', 'life-map-pipeline/functions', 'schemas', 'spatial-renderer-v1'];
const textExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.rules']);

const blockedRuntimeFragments = [
  `${path.sep}_audit${path.sep}`,
  `${path.sep}outputs${path.sep}`,
];
const blockedRuntimeSuffixes = ['.bak', '.body'];
const blockedUserFacingTerms = ['GetUrAi', 'LifeLogger', 'lorem ipsum', 'fake asset', 'dummy asset', 'coming soon'];
const blockedProductionTerms = ['localhost'];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function normalize(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertNoProductionSurfaceArtifacts(errors, file) {
  const normalized = normalize(file);
  for (const fragment of blockedRuntimeFragments) {
    if (file.includes(fragment)) errors.push(`Runtime source includes excluded artifact path: ${normalized}`);
  }
  for (const suffix of blockedRuntimeSuffixes) {
    if (file.endsWith(suffix)) errors.push(`Runtime source includes excluded artifact file: ${normalized}`);
  }
}

function assertNoUserFacingTerms(errors, file) {
  const ext = path.extname(file);
  if (!textExtensions.has(ext)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const term of blockedProductionTerms) {
    if (text.includes(term)) errors.push(`Production source contains ${term}: ${normalize(file)}`);
  }
  const userFacing = file.includes(`${path.sep}app${path.sep}`) || file.includes(`${path.sep}components${path.sep}`) || file.includes(`${path.sep}public${path.sep}`);
  if (!userFacing) return;
  for (const term of blockedUserFacingTerms) {
    if (text.toLowerCase().includes(term.toLowerCase())) errors.push(`User-facing source contains ${term}: ${normalize(file)}`);
  }
}

function assertGeneratedRouteGuard(errors) {
  const validationFile = path.join(root, 'assetfactory-studio/lib/server/assetFactoryValidation.ts');
  const routeFile = path.join(root, 'assetfactory-studio/app/api/generated-assets/[file]/route.ts');
  const validationSource = fs.existsSync(validationFile) ? fs.readFileSync(validationFile, 'utf8') : '';
  const routeSource = fs.existsSync(routeFile) ? fs.readFileSync(routeFile, 'utf8') : '';
  const markers = ['blockedGeneratedAssetNames', 'isBlockedGeneratedAssetName', '!isBlockedGeneratedAssetName(value)'];
  for (const marker of markers) {
    if (!validationSource.includes(marker)) errors.push(`Generated asset filename guard missing marker: ${marker}`);
  }
  if (!routeSource.includes('validateFileName(file)')) {
    errors.push('Generated asset route must call validateFileName(file) before serving files');
  }
}

function validateManifestObject(asset, label) {
  const errors = [];
  const requiredStrings = ['id', 'slug', 'title', 'assetType', 'symbolicCategory', 'version', 'status', 'visibility', 'createdBy', 'createdAt', 'updatedAt', 'performanceTier'];
  for (const key of requiredStrings) {
    if (typeof asset[key] !== 'string' || !asset[key]) errors.push(`${label}: missing ${key}`);
  }
  for (const key of ['mobileReady', 'arReady', 'vrReady', 'xrReady', 'spatialReady', 'productionReady']) {
    if (typeof asset[key] !== 'boolean') errors.push(`${label}: missing ${key}`);
  }
  for (const key of ['tags', 'dependencies', 'compatibleScenes']) {
    if (!Array.isArray(asset[key])) errors.push(`${label}: missing ${key}`);
  }
  if (!asset.permissions || typeof asset.permissions !== 'object') errors.push(`${label}: missing permissions`);
  if (!asset.validation || typeof asset.validation !== 'object') errors.push(`${label}: missing validation`);
  if (asset.permissions && typeof asset.permissions.containsUserMemoryData !== 'boolean') errors.push(`${label}: missing permissions.containsUserMemoryData`);
  if (asset.visibility === 'public-demo' && asset.permissions?.sanitizedForDemo !== true) errors.push(`${label}: public-demo must be sanitized`);
  if ((asset.visibility === 'public-demo' || asset.visibility === 'public-marketing') && (asset.permissions?.containsUserData === true || asset.permissions?.containsUserMemoryData === true)) errors.push(`${label}: public asset contains user data`);
  if (asset.status === 'published' && !asset.thumbnailUrl && !asset.previewUrl) errors.push(`${label}: published asset missing thumbnail or preview`);
  if (asset.productionReady === true && !asset.fallbackAsset) errors.push(`${label}: production asset missing fallbackAsset`);
  if (['model-glb', 'model-gltf', 'spatial-scene', 'scene-manifest', 'particle-system'].includes(asset.assetType)) {
    if (!asset.spatialReady) errors.push(`${label}: spatial asset missing spatialReady`);
    if (!asset.modelUrl && !asset.gltfUrl && !asset.glbUrl) errors.push(`${label}: spatial asset missing model url`);
    const modelUrl = asset.glbUrl ?? asset.gltfUrl ?? asset.modelUrl ?? '';
    if (modelUrl && !modelUrl.split('?')[0].split('#')[0].toLowerCase().match(/\.(glb|gltf)$/)) errors.push(`${label}: model url must be glb or gltf`);
    if (asset.geometryType === 'plane' || asset.geometryType === 'none') errors.push(`${label}: spatial asset cannot use flat geometry`);
    if (asset.validation?.gltfValid !== true) errors.push(`${label}: spatial asset missing gltf validation`);
  }
  return errors;
}

function validateManifestFiles(errors) {
  const candidateDirs = ['assetfactory-studio/assets', 'assetfactory-studio/public/assets', 'schemas/examples'];
  for (const dir of candidateDirs) {
    const fullDir = path.join(root, dir);
    for (const file of walk(fullDir)) {
      if (!file.endsWith('.json')) continue;
      const json = readJson(file);
      const candidates = Array.isArray(json) ? json : [json];
      for (const asset of candidates) {
        if (asset && typeof asset === 'object' && 'assetType' in asset && 'visibility' in asset) {
          errors.push(...validateManifestObject(asset, normalize(file)));
        }
      }
    }
  }
}

const errors = [];
for (const sourceRoot of sourceRoots) {
  for (const file of walk(path.join(root, sourceRoot))) {
    assertNoProductionSurfaceArtifacts(errors, file);
    assertNoUserFacingTerms(errors, file);
  }
}
assertGeneratedRouteGuard(errors);
validateManifestFiles(errors);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('asset-factory production validation passed');
