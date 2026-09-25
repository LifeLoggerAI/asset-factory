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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intelligence-provider-router-'));
const sourcePath = path.join(studioRoot, 'lib/server/intelligenceProviderRouter.ts');
const outputPath = path.join(tmpDir, 'intelligenceProviderRouter.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    skipLibCheck: true,
  },
  fileName: sourcePath,
}).outputText;
fs.writeFileSync(outputPath, output);

const {
  executeIntelligenceTask,
  getIntelligenceProviderRegistry,
  routeIntelligenceProviders,
} = await import(pathToFileURL(outputPath).href);

const keys = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'ASSET_FACTORY_OPENAI_REASONING_MODEL',
  'ASSET_FACTORY_ANTHROPIC_REASONING_MODEL',
  'ASSET_FACTORY_GEMINI_REASONING_MODEL',
  'ASSET_FACTORY_ANTHROPIC_API_VERSION',
  'ASSET_FACTORY_INTELLIGENCE_PROVIDER_ORDER',
  'ASSET_FACTORY_INTELLIGENCE_CLOUD_PROCESSING_AUTHORIZED',
  'ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED',
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function restore() {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  globalThis.fetch = originalFetch;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

try {
  for (const key of keys) delete process.env[key];

  const registry = getIntelligenceProviderRegistry();
  assert.deepEqual(registry.map((provider) => provider.name), ['openai', 'anthropic', 'gemini']);
  assert.ok(registry.every((provider) => provider.configured === false));
  assert.deepEqual(routeIntelligenceProviders({
    task: 'reasoning',
    prompt: 'test',
    privacyClass: 'cloud-allowed',
  }), []);

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('network must remain closed');
  };

  await assert.rejects(
    () => executeIntelligenceTask({ task: 'reasoning', prompt: 'private', privacyClass: 'local-only' }),
    /Local-only intelligence requests may not use a third-party provider/
  );
  assert.equal(fetchCalled, false);

  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ASSET_FACTORY_OPENAI_REASONING_MODEL = 'configured-openai-model';

  await assert.rejects(
    () => executeIntelligenceTask({ task: 'reasoning', prompt: 'cloud', privacyClass: 'cloud-allowed' }),
    /Cloud intelligence processing is not authorized/
  );
  assert.equal(fetchCalled, false);

  process.env.ASSET_FACTORY_INTELLIGENCE_CLOUD_PROCESSING_AUTHORIZED = 'true';
  await assert.rejects(
    () => executeIntelligenceTask({ task: 'reasoning', prompt: 'cloud', privacyClass: 'cloud-allowed' }),
    /External intelligence provider spend is not authorized/
  );
  assert.equal(fetchCalled, false);

  process.env.ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED = 'true';
  await assert.rejects(
    () => executeIntelligenceTask({
      task: 'reasoning',
      prompt: 'sensitive',
      privacyClass: 'sensitive-cloud-with-explicit-consent',
    }),
    /Sensitive cloud intelligence requires explicit consent/
  );
  assert.equal(fetchCalled, false);

  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.ASSET_FACTORY_ANTHROPIC_REASONING_MODEL = 'configured-anthropic-model';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.ASSET_FACTORY_GEMINI_REASONING_MODEL = 'configured-gemini-model';
  process.env.ASSET_FACTORY_INTELLIGENCE_PROVIDER_ORDER = 'openai,anthropic,gemini';

  assert.deepEqual(routeIntelligenceProviders({
    task: 'reasoning',
    prompt: 'route',
    privacyClass: 'cloud-allowed',
  }), ['openai', 'anthropic', 'gemini']);

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(String(options.body));
      assert.equal(body.model, 'configured-openai-model');
      assert.equal(body.input, 'fallback test');
      assert.equal(body.store, false);
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 });
    }
    if (String(url) === 'https://api.anthropic.com/v1/messages') {
      assert.equal(options.headers['x-api-key'], 'test-anthropic-key');
      assert.equal(options.headers['anthropic-version'], '2023-06-01');
      const body = JSON.parse(String(options.body));
      assert.equal(body.model, 'configured-anthropic-model');
      assert.deepEqual(body.messages, [{ role: 'user', content: 'fallback test' }]);
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'anthropic fallback success' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const fallback = await executeIntelligenceTask({
    task: 'reasoning',
    prompt: 'fallback test',
    privacyClass: 'cloud-allowed',
  });
  assert.equal(fallback.text, 'anthropic fallback success');
  assert.equal(fallback.receipt.selectedProvider, 'anthropic');
  assert.equal(fallback.receipt.selectedModel, 'configured-anthropic-model');
  assert.equal(fallback.receipt.fallbackUsed, true);
  assert.equal(fallback.receipt.promptLogged, false);
  assert.deepEqual(fallback.receipt.attempts.map((attempt) => attempt.outcome), ['failed', 'success']);
  assert.equal(fallback.receipt.attempts[0].failureClass, 'rate-limit');

  globalThis.fetch = async (url, options = {}) => {
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/configured-gemini-model:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'test-gemini-key');
    const body = JSON.parse(String(options.body));
    assert.equal(body.contents[0].parts[0].text, 'gemini test');
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'gemini success' }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const gemini = await executeIntelligenceTask({
    task: 'summarization',
    prompt: 'gemini test',
    privacyClass: 'sensitive-cloud-with-explicit-consent',
    sensitiveCloudConsent: true,
    allowedProviders: ['gemini'],
  });
  assert.equal(gemini.text, 'gemini success');
  assert.equal(gemini.receipt.selectedProvider, 'gemini');
  assert.equal(gemini.receipt.fallbackUsed, false);
  assert.equal(gemini.receipt.promptLogged, false);

  console.log('PASS governed multimodel intelligence router contract');
} finally {
  restore();
}
