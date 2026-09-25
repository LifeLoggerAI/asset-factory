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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-routing-contract-'));
const compiledDir = path.join(tmpDir, 'compiled');
fs.mkdirSync(path.join(compiledDir, 'lib', 'server'), { recursive: true });

function compileTsModule(relativePath, patches = []) {
  const sourcePath = path.join(studioRoot, relativePath);
  let source = fs.readFileSync(sourcePath, 'utf8');
  for (const [from, to] of patches) source = source.replace(from, to);
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
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  return outputPath;
}

compileTsModule('lib/server/assetProviderAdapters.ts', [[
  "import type { AssetRendererInput, AssetRendererResult, CanonicalAssetType } from './assetFactoryTypes';",
  "type CanonicalAssetType = 'graphic' | 'model3d' | 'audio' | 'video' | 'bundle'; type AssetRendererInput = Record<string, unknown>; type AssetRendererResult = Record<string, unknown>;",
]]);

const runtimePath = compileTsModule('lib/server/assetProviderRuntime.ts', [
  [
    "import type { GenerateRequest } from './assetFactoryValidation';",
    "type GenerateRequest = { jobId: string; tenantId?: string; prompt: string; type: string; aspectRatio?: string; size?: { width?: number; height?: number }; metadata?: Record<string, unknown> };",
  ],
  [
    "import type { AssetTypeDefinition } from './assetTypeCatalog';",
    "type AssetTypeDefinition = { canonicalType: 'graphic' | 'model3d' | 'audio' | 'video' | 'bundle'; extension: string };",
  ],
  [
    "import { configuredProviderName, isAssetProviderName, type AssetProviderName } from './assetProviderAdapters';",
    "import { configuredProviderName, isAssetProviderName } from './assetProviderAdapters.mjs'; type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability' | 'runway' | 'meshy';",
  ],
]);

const { configuredProviderForRequest } = await import(pathToFileURL(runtimePath).href);

const keys = [
  'ASSET_FACTORY_MEDIA_PROVIDER',
  'ASSET_FACTORY_IMAGE_PROVIDER',
  'ASSET_FACTORY_MODEL3D_PROVIDER',
  'ASSET_FACTORY_AUDIO_PROVIDER',
  'ASSET_FACTORY_SFX_PROVIDER',
  'ASSET_FACTORY_MUSIC_PROVIDER',
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function definition(canonicalType) {
  return { canonicalType, extension: canonicalType === 'model3d' ? 'glb' : canonicalType === 'audio' ? 'wav' : 'png' };
}

try {
  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'local-proof';
  process.env.ASSET_FACTORY_IMAGE_PROVIDER = 'openai';
  process.env.ASSET_FACTORY_MODEL3D_PROVIDER = 'meshy';
  process.env.ASSET_FACTORY_AUDIO_PROVIDER = 'elevenlabs';
  process.env.ASSET_FACTORY_SFX_PROVIDER = 'elevenlabs';
  process.env.ASSET_FACTORY_MUSIC_PROVIDER = 'elevenlabs';

  assert.equal(configuredProviderForRequest({ jobId:'i', prompt:'image', type:'graphic' }, definition('graphic')), 'openai');
  assert.equal(configuredProviderForRequest({ jobId:'m', prompt:'mesh', type:'model3d' }, definition('model3d')), 'meshy');
  assert.equal(configuredProviderForRequest({ jobId:'v', prompt:'say hi', type:'speech' }, definition('audio')), 'elevenlabs');
  assert.equal(configuredProviderForRequest({ jobId:'s', prompt:'rain', type:'sfx' }, definition('audio')), 'elevenlabs');
  assert.equal(configuredProviderForRequest({ jobId:'u', prompt:'score', type:'music' }, definition('audio')), 'elevenlabs');

  delete process.env.ASSET_FACTORY_SFX_PROVIDER;
  assert.equal(configuredProviderForRequest({ jobId:'s2', prompt:'rain', type:'sfx' }, definition('audio')), 'elevenlabs');

  process.env.ASSET_FACTORY_IMAGE_PROVIDER = 'not-a-provider';
  assert.throws(
    () => configuredProviderForRequest({ jobId:'bad', prompt:'bad', type:'graphic' }, definition('graphic')),
    /Invalid ASSET_FACTORY_IMAGE_PROVIDER provider/
  );

  console.log('PASS modality-specific provider routing contract tests');
} finally {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
