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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replicate-registry-contract-'));
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

const catalogModulePath = compileTsModule('lib/server/assetTypeCatalog.ts');
compileTsModule('lib/server/assetProviderAdapters.ts', [[
  "import type { AssetRendererInput, AssetRendererResult, CanonicalAssetType } from './assetFactoryTypes';",
  "type CanonicalAssetType = 'graphic' | 'model3d' | 'audio' | 'bundle'; type AssetRendererInput = Record<string, unknown>; type AssetRendererResult = Record<string, unknown>;",
]]);
const providerRuntimeModulePath = compileTsModule('lib/server/assetProviderRuntime.ts', [
  [
    "import type { GenerateRequest } from './assetFactoryValidation';",
    "type GenerateRequest = { jobId: string; tenantId?: string; prompt: string; type: string; aspectRatio?: string; size?: { width?: number; height?: number }; metadata?: Record<string, unknown> };",
  ],
  [
    "import type { AssetTypeDefinition } from './assetTypeCatalog';",
    "type AssetTypeDefinition = { canonicalType: 'graphic' | 'model3d' | 'audio' | 'bundle'; extension: string };",
  ],
  [
    "import { configuredProviderName, type AssetProviderName } from './assetProviderAdapters';",
    "import { configuredProviderName } from './assetProviderAdapters.mjs'; type AssetProviderName = 'local-proof' | 'openai' | 'replicate' | 'fal' | 'elevenlabs' | 'stability';",
  ],
]);

const { resolveAssetType } = await import(pathToFileURL(catalogModulePath).href);
const { renderWithConfiguredProvider } = await import(pathToFileURL(providerRuntimeModulePath).href);

const trackedEnv = [
  'ASSET_FACTORY_MEDIA_PROVIDER',
  'REPLICATE_API_TOKEN',
  'ASSET_FACTORY_REPLICATE_GRAPHICS_MODEL',
  'ASSET_FACTORY_REPLICATE_MODEL3D_MODEL',
  'ASSET_FACTORY_REPLICATE_AUDIO_MODEL',
  'ASSET_FACTORY_REPLICATE_SPEECH_MODEL',
  'ASSET_FACTORY_GRAPHICS_MODEL',
  'ASSET_FACTORY_MODEL3D_MODEL',
  'ASSET_FACTORY_AUDIO_MODEL',
  'ASSET_FACTORY_ALLOW_REPLICATE_MODEL_OVERRIDE',
  'ASSET_FACTORY_ALLOW_REPLICATE_INPUT_OVERRIDES',
];
const originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function restoreEnv() {
  for (const key of trackedEnv) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function configureRegistry() {
  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'replicate';
  process.env.REPLICATE_API_TOKEN = 'test-token';
  process.env.ASSET_FACTORY_REPLICATE_GRAPHICS_MODEL = 'black-forest-labs/flux-schnell';
  process.env.ASSET_FACTORY_REPLICATE_MODEL3D_MODEL = 'tencent/hunyuan-3d-3.1:a2838628b41a2e0ee2eb19b3ea98a40d75f8d7639bf5a1ddd37ea299bb334854';
  process.env.ASSET_FACTORY_REPLICATE_AUDIO_MODEL = 'google/lyria-2';
  process.env.ASSET_FACTORY_REPLICATE_SPEECH_MODEL = 'minimax/speech-02-hd';
  delete process.env.ASSET_FACTORY_GRAPHICS_MODEL;
  delete process.env.ASSET_FACTORY_MODEL3D_MODEL;
  delete process.env.ASSET_FACTORY_AUDIO_MODEL;
  delete process.env.ASSET_FACTORY_ALLOW_REPLICATE_MODEL_OVERRIDE;
  delete process.env.ASSET_FACTORY_ALLOW_REPLICATE_INPUT_OVERRIDES;
}

async function runCase({ request, typeName, expectedUrl, expectedBody, mimeType, artifactUrl, expectedModel, expectedLane }) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const urlString = String(url);
    calls.push({ url: urlString, method: options.method ?? 'GET', body: options.body ? JSON.parse(String(options.body)) : null });
    if (urlString === expectedUrl) {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(String(options.body)), expectedBody);
      return new Response(JSON.stringify({ id: `pred-${expectedLane}`, status: 'succeeded', output: artifactUrl }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (urlString === artifactUrl) {
      return new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': mimeType, 'content-length': '4' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${urlString}`);
  };

  const result = await renderWithConfiguredProvider(request, resolveAssetType(typeName));
  assert.equal(result.metadata.provider, 'replicate');
  assert.equal(result.metadata.providerModel, expectedModel);
  assert.equal(result.metadata.replicateLane, expectedLane);
  assert.equal(result.assetMimeType, mimeType);
  assert.equal(result.assetBuffer.byteLength, 4);
  assert.deepEqual(calls.map(({ method }) => method), ['POST', 'GET']);
}

async function testGraphicLane() {
  await runCase({
    request: { jobId: 'graphic', tenantId: 'tenant', prompt: 'symbolic moonlit orb', type: 'graphic', aspectRatio: '16:9' },
    typeName: 'graphic',
    expectedUrl: 'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    expectedBody: { input: { prompt: 'symbolic moonlit orb', num_outputs: 1, aspect_ratio: '16:9', output_format: 'webp', output_quality: 80 } },
    mimeType: 'image/webp',
    artifactUrl: 'https://cdn.example.com/graphic.webp',
    expectedModel: 'black-forest-labs/flux-schnell',
    expectedLane: 'graphic',
  });
}

async function testModel3dLaneUsesPinnedVersionRoute() {
  const version = 'a2838628b41a2e0ee2eb19b3ea98a40d75f8d7639bf5a1ddd37ea299bb334854';
  await runCase({
    request: { jobId: 'model3d', tenantId: 'tenant', prompt: 'glass memory shrine', type: 'model3d', metadata: { enablePbr: true, generateType: 'Normal' } },
    typeName: 'model3d',
    expectedUrl: 'https://api.replicate.com/v1/predictions',
    expectedBody: { version, input: { prompt: 'glass memory shrine', enable_pbr: true, face_count: 40000, generate_type: 'Normal' } },
    mimeType: 'model/gltf-binary',
    artifactUrl: 'https://cdn.example.com/model.glb',
    expectedModel: `tencent/hunyuan-3d-3.1:${version}`,
    expectedLane: 'model3d',
  });
}

async function testMusicLane() {
  await runCase({
    request: { jobId: 'music', tenantId: 'tenant', prompt: 'slow atmospheric recovery theme', type: 'audio', metadata: { negativePrompt: 'vocals' } },
    typeName: 'audio',
    expectedUrl: 'https://api.replicate.com/v1/models/google/lyria-2/predictions',
    expectedBody: { input: { prompt: 'slow atmospheric recovery theme', negative_prompt: 'vocals' } },
    mimeType: 'audio/wav',
    artifactUrl: 'https://cdn.example.com/music.wav',
    expectedModel: 'google/lyria-2',
    expectedLane: 'audio',
  });
}

async function testSpeechLane() {
  await runCase({
    request: { jobId: 'speech', tenantId: 'tenant', prompt: 'Welcome back, Adam.', type: 'speech', metadata: { voiceId: 'Friendly_Person', emotion: 'auto', languageBoost: 'English' } },
    typeName: 'speech',
    expectedUrl: 'https://api.replicate.com/v1/models/minimax/speech-02-hd/predictions',
    expectedBody: { input: { text: 'Welcome back, Adam.', voice_id: 'Friendly_Person', emotion: 'auto', language_boost: 'English', english_normalization: true } },
    mimeType: 'audio/mpeg',
    artifactUrl: 'https://cdn.example.com/speech.mp3',
    expectedModel: 'minimax/speech-02-hd',
    expectedLane: 'speech',
  });
}

async function testRequestOverridesRemainFailClosed() {
  await assert.rejects(
    () => renderWithConfiguredProvider(
      { jobId: 'override', tenantId: 'tenant', prompt: 'unsafe override', type: 'graphic', metadata: { replicateModel: 'other/model' } },
      resolveAssetType('graphic')
    ),
    /replicateModel request override is disabled/
  );

  await assert.rejects(
    () => renderWithConfiguredProvider(
      { jobId: 'input-override', tenantId: 'tenant', prompt: 'unsafe override', type: 'graphic', metadata: { replicateInput: { num_outputs: 9 } } },
      resolveAssetType('graphic')
    ),
    /replicateInput request overrides are disabled/
  );
}

try {
  configureRegistry();
  await testGraphicLane();
  await testModel3dLaneUsesPinnedVersionRoute();
  await testMusicLane();
  await testSpeechLane();
  await testRequestOverridesRemainFailClosed();
  console.log('PASS Replicate four-lane model registry contract tests');
} finally {
  globalThis.fetch = originalFetch;
  restoreEnv();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
