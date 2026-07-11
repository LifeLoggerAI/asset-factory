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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-video-provider-'));
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

const videoRuntimePath = compileTsModule('lib/server/assetVideoProviderRuntime.ts', [
  [
    "import type { GenerateRequest } from './assetFactoryValidation';",
    "type GenerateRequest = { jobId: string; tenantId?: string; prompt: string; type: string; aspectRatio?: string; size?: { width?: number; height?: number }; metadata?: Record<string, unknown> };",
  ],
  [
    "import { configuredProviderName } from './assetProviderAdapters';",
    "import { configuredProviderName } from './assetProviderAdapters.mjs';",
  ],
]);

const { renderVideoWithConfiguredProvider } = await import(pathToFileURL(videoRuntimePath).href);

const envKeys = [
  'ASSET_FACTORY_MEDIA_PROVIDER',
  'ASSET_FACTORY_VIDEO_MODEL',
  'ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS',
  'ASSET_FACTORY_VIDEO_PROVIDER_MAX_BYTES',
  'REPLICATE_API_TOKEN',
  'FAL_KEY',
];
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function restore() {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function testReplicateVideoReturnsReviewedMp4() {
  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'replicate';
  process.env.ASSET_FACTORY_VIDEO_MODEL = 'owner/video-model-version';
  process.env.REPLICATE_API_TOKEN = 'test-token';
  process.env.ASSET_FACTORY_VIDEO_PROVIDER_MAX_BYTES = '1024';
  process.env.ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS = '5000';
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, method: options.method ?? 'GET' });
    if (value === 'https://api.replicate.com/v1/predictions') {
      const request = JSON.parse(String(options.body));
      assert.equal(request.version, 'owner/video-model-version');
      assert.equal(request.input.duration, 8);
      assert.equal(request.input.aspect_ratio, '16:9');
      return new Response(JSON.stringify({
        id: 'video-pred-1',
        status: 'starting',
        urls: { get: 'https://api.replicate.com/v1/predictions/video-pred-1' },
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (value === 'https://api.replicate.com/v1/predictions/video-pred-1') {
      return new Response(JSON.stringify({
        id: 'video-pred-1',
        status: 'succeeded',
        output: 'https://cdn.example.com/waiting-room-day-0.mp4',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (value === 'https://cdn.example.com/waiting-room-day-0.mp4') {
      return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': '8' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${value}`);
  };

  const result = await renderVideoWithConfiguredProvider({
    jobId: 'waiting-room-day-0',
    tenantId: 'launch',
    type: 'video',
    prompt: 'A person reaches the doorway into URAI',
    aspectRatio: '16:9',
    size: { width: 1920, height: 1080 },
    metadata: { durationSeconds: 8, fps: 24 },
  });

  assert.equal(result.extension, 'mp4');
  assert.equal(result.assetMimeType, 'video/mp4');
  assert.equal(result.assetBuffer.byteLength, 8);
  assert.equal(result.metadata.provider, 'replicate');
  assert.equal(result.metadata.reviewRequired, true);
  assert.equal(result.metadata.productionReady, false);
  assert.deepEqual(calls.map((call) => call.method), ['POST', 'GET', 'GET']);
}

async function testMissingVideoModelFailsClosedBeforeFetch() {
  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'replicate';
  process.env.REPLICATE_API_TOKEN = 'test-token';
  delete process.env.ASSET_FACTORY_VIDEO_MODEL;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('fetch should not run');
  };

  await assert.rejects(
    () => renderVideoWithConfiguredProvider({ jobId: 'missing-model', type: 'video', prompt: 'test' }),
    /ASSET_FACTORY_VIDEO_MODEL is required/,
  );
  assert.equal(called, false);
}

async function testPrivateVideoArtifactIsRejected() {
  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'replicate';
  process.env.ASSET_FACTORY_VIDEO_MODEL = 'owner/video-model-version';
  process.env.REPLICATE_API_TOKEN = 'test-token';

  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value === 'https://api.replicate.com/v1/predictions') {
      return new Response(JSON.stringify({
        status: 'starting',
        urls: { get: 'https://api.replicate.com/v1/predictions/video-pred-2' },
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    if (value === 'https://api.replicate.com/v1/predictions/video-pred-2') {
      return new Response(JSON.stringify({
        status: 'succeeded',
        output: 'https://127.0.0.1/internal.mp4',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch URL: ${value}`);
  };

  await assert.rejects(
    () => renderVideoWithConfiguredProvider({ jobId: 'private-video', type: 'video', prompt: 'test' }),
    /private or local host/,
  );
}

async function testImageArtifactCannotMasqueradeAsVideo() {
  process.env.ASSET_FACTORY_MEDIA_PROVIDER = 'fal';
  process.env.ASSET_FACTORY_VIDEO_MODEL = 'vendor/video-model';
  process.env.FAL_KEY = 'test-key';

  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value === 'https://fal.run/vendor/video-model') {
      return new Response(JSON.stringify({ video: { url: 'https://cdn.example.com/not-video.png' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (value === 'https://cdn.example.com/not-video.png') {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '4' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${value}`);
  };

  await assert.rejects(
    () => renderVideoWithConfiguredProvider({ jobId: 'wrong-mime', type: 'video', prompt: 'test' }),
    /not a supported video format/,
  );
}

try {
  await testReplicateVideoReturnsReviewedMp4();
  restore();
  await testMissingVideoModelFailsClosedBeforeFetch();
  restore();
  await testPrivateVideoArtifactIsRejected();
  restore();
  await testImageArtifactCannotMasqueradeAsVideo();
  console.log('PASS Asset Factory guarded video provider behavior tests');
} finally {
  restore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}