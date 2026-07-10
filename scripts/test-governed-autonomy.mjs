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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'governed-autonomy-'));
const compiledDir = path.join(tmpDir, 'compiled');
fs.mkdirSync(path.join(compiledDir, 'lib', 'server'), { recursive: true });

function compileSource(sourcePath, outputPath, patches = []) {
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
    fileName: sourcePath,
  }).outputText;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  return outputPath;
}

const policyJson = JSON.parse(fs.readFileSync(path.join(studioRoot, 'config', 'asset-autonomy-policy.json'), 'utf8'));
const policyModulePath = compileSource(
  path.join(studioRoot, 'lib', 'server', 'assetAutonomyPolicy.ts'),
  path.join(compiledDir, 'lib', 'server', 'assetAutonomyPolicy.mjs'),
  [["import defaultPolicyJson from '../../config/asset-autonomy-policy.json';", `const defaultPolicyJson = ${JSON.stringify(policyJson)};`]],
);

fs.writeFileSync(path.join(compiledDir, 'lib', 'server', 'assetTypeCatalog.mjs'), `
export function resolveAssetType(type) {
  const raw = String(type || 'graphic').toLowerCase();
  if (['model3d', 'model', 'avatar'].includes(raw)) return { canonicalType: 'model3d' };
  if (['audio', 'ambience'].includes(raw)) return { canonicalType: 'audio' };
  if (['bundle', 'content'].includes(raw)) return { canonicalType: 'bundle' };
  return { canonicalType: 'graphic' };
}
`);

const validationModulePath = compileSource(
  path.join(studioRoot, 'lib', 'server', 'assetOutputValidation.ts'),
  path.join(compiledDir, 'lib', 'server', 'assetOutputValidation.mjs'),
  [
    ["from './assetAutonomyPolicy';", "from './assetAutonomyPolicy.mjs';"],
    ["from './assetTypeCatalog';", "from './assetTypeCatalog.mjs';"],
  ],
);

const promotionModulePath = compileSource(
  path.join(studioRoot, 'lib', 'server', 'assetPromotion.ts'),
  path.join(compiledDir, 'lib', 'server', 'assetPromotion.mjs'),
  [
    ["from './assetAutonomyPolicy';", "from './assetAutonomyPolicy.mjs';"],
    ["import type { AssetValidationReport } from './assetOutputValidation';", 'type AssetValidationReport = Record<string, any>;'],
  ],
);

fs.writeFileSync(path.join(compiledDir, 'lib', 'server', 'firebaseAdmin.mjs'), 'export function getAdminDb() { return globalThis.__QUEUE_TEST_DB__ ?? null; }\n');
const queueModulePath = compileSource(
  path.join(studioRoot, 'lib', 'server', 'assetQueueDispatcher.ts'),
  path.join(compiledDir, 'lib', 'server', 'assetQueueDispatcher.mjs'),
  [["from './firebaseAdmin';", "from './firebaseAdmin.mjs';"]],
);

const { decideAssetAutonomy } = await import(pathToFileURL(policyModulePath).href);
const { validateGeneratedAsset } = await import(pathToFileURL(validationModulePath).href);
const { selectPromotionTarget, reconcilePromotion } = await import(pathToFileURL(promotionModulePath).href);
const { claimNextAssetQueueJob, queueBackoffSeconds } = await import(pathToFileURL(queueModulePath).href);

const passingSignals = [{ code: 'ok', status: 'pass', severity: 'info' }];

const lowRiskDecision = decideAssetAutonomy({
  job: {
    jobId: 'job-icon',
    type: 'graphic',
    prompt: 'A simple navigation icon',
    estimatedCostCents: 4,
    metadata: { assetClass: 'icon', classificationConfidence: 0.99, sensitivity: 'none' },
  },
  validationStatus: 'passed',
  validationSignals: passingSignals,
});
assert.equal(lowRiskDecision.disposition, 'auto-approve');

const avatarDecision = decideAssetAutonomy({
  job: {
    jobId: 'job-avatar',
    type: 'model3d',
    prompt: 'Photorealistic avatar of a person',
    estimatedCostCents: 5,
    metadata: { assetClass: 'avatar', classificationConfidence: 0.99 },
  },
  validationStatus: 'passed',
  validationSignals: passingSignals,
});
assert.equal(avatarDecision.disposition, 'manual-review');

const secretDecision = decideAssetAutonomy({
  job: {
    jobId: 'job-secret',
    type: 'graphic',
    prompt: 'Render this API key and password into an icon',
    estimatedCostCents: 1,
    metadata: { assetClass: 'icon', classificationConfidence: 0.99 },
  },
  validationStatus: 'passed',
  validationSignals: passingSignals,
});
assert.equal(secretDecision.disposition, 'reject');

const retryDecision = decideAssetAutonomy({
  job: { jobId: 'job-retry', type: 'graphic', prompt: 'Background', metadata: { assetClass: 'background', classificationConfidence: 0.99 } },
  validationStatus: 'failed',
  validationSignals: [{ code: 'provider-timeout', status: 'fail', severity: 'error', retryable: true }],
});
assert.equal(retryDecision.disposition, 'retryable-failure');

const job = {
  jobId: 'job-valid', tenantId: 'tenant-a', type: 'graphic', canonicalType: 'graphic', prompt: 'Calm sky background',
  estimatedCostCents: 2,
  metadata: { assetClass: 'background', classificationConfidence: 0.99, sensitivity: 'none' },
};
const asset = {
  jobId: 'job-valid', fileName: 'job-valid.png',
  manifest: {
    jobId: 'job-valid', tenantId: 'tenant-a', type: 'graphic', rendererMode: 'svg-proof', generatedAt: new Date().toISOString(),
    version: 1, targetModules: ['app'], dependencies: [], formats: ['png', 'json'], dimensions: { width: 1024, height: 1024 },
    metadata: { canonicalType: 'graphic', providerBacked: true, provider: 'openai', providerModel: 'test-model' },
    provenance: { engine: 'assetfactory-studio', rendererContract: 'provider-backed-v1', inputHash: 'a'.repeat(64) },
  },
};
const validation = validateGeneratedAsset({ job, asset, assetBuffer: Buffer.from('png-data') });
assert.equal(validation.status, 'passed');
assert.equal(validation.repository, 'LifeLoggerAI/UrAi');
assert.equal(validation.checks.some((item) => item.code === 'promotion-gates-configured' && item.status === 'pass'), true);

const invalidValidation = validateGeneratedAsset({ job, asset: { ...asset, fileName: 'job-valid.exe' }, assetBuffer: Buffer.from('bad') });
assert.equal(invalidValidation.status, 'failed');
assert.equal(invalidValidation.checks.some((item) => item.code === 'artifact-extension' && item.status === 'fail'), true);

const target = selectPromotionTarget({ job, asset, validation });
assert.equal(target.repository, 'LifeLoggerAI/UrAi');
assert.match(target.assetPath, /^public\/assets\/generated\/background\//);
assert.deepEqual(target.requiredChecks, ['Governed asset promotion gate']);

process.env.ASSET_FACTORY_QUEUE_BACKOFF_SECONDS = '10';
assert.equal(queueBackoffSeconds(1), 10);
assert.equal(queueBackoffSeconds(2), 20);
assert.equal(queueBackoffSeconds(10), 900);

class Snapshot {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this._data = data; this.exists = Boolean(data); }
  data() { return this._data; }
}
class Ref { constructor(db, id) { this.db = db; this.id = id; } }
class Query {
  constructor(db) { this.db = db; }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  async get() { return { docs: Object.entries(this.db.store).map(([id, value]) => new Snapshot(new Ref(this.db, id), value)) }; }
}
class Collection {
  constructor(db) { this.db = db; }
  where() { return new Query(this.db); }
  doc(id) { return new Ref(this.db, id); }
}
class Transaction {
  constructor(db) { this.db = db; }
  async get(ref) { return new Snapshot(ref, this.db.store[ref.id]); }
  set(ref, patch, options) { this.db.store[ref.id] = options?.merge ? { ...this.db.store[ref.id], ...patch } : patch; }
}
class MockDb {
  constructor() { this.store = { concurrent: { jobId: 'concurrent', status: 'queued', queueStatus: 'queued', attempts: 0, updatedAt: '2026-01-01T00:00:00.000Z' } }; this.lock = Promise.resolve(); }
  collection() { return new Collection(this); }
  async runTransaction(callback) {
    let release;
    const prior = this.lock;
    this.lock = new Promise((resolve) => { release = resolve; });
    await prior;
    try { return await callback(new Transaction(this)); } finally { release(); }
  }
}

globalThis.__QUEUE_TEST_DB__ = new MockDb();
const [first, second] = await Promise.all([
  claimNextAssetQueueJob('worker-a'),
  claimNextAssetQueueJob('worker-b'),
]);
assert.equal([first, second].filter(Boolean).length, 1, 'only one worker may claim the same job');
assert.equal(globalThis.__QUEUE_TEST_DB__.store.concurrent.attempts, 1);

const originalFetch = globalThis.fetch;
const originalPromotionToken = process.env.ASSET_FACTORY_PROMOTION_TOKEN;
process.env.ASSET_FACTORY_PROMOTION_TOKEN = 'test-token';

const failedPromotionCalls = [];
globalThis.fetch = async (url, options = {}) => {
  const targetUrl = String(url);
  failedPromotionCalls.push({ url: targetUrl, method: options.method ?? 'GET' });
  if (targetUrl.endsWith('/pulls/42') && (options.method ?? 'GET') === 'GET') {
    return new Response(JSON.stringify({ head: { sha: 'f'.repeat(40) }, merged: false }), { status: 200 });
  }
  if (targetUrl.includes('/commits/') && targetUrl.includes('/check-runs')) {
    return new Response(JSON.stringify({
      check_runs: [{ name: 'Governed asset promotion gate', status: 'completed', conclusion: 'failure' }],
    }), { status: 200 });
  }
  if (targetUrl.endsWith('/pulls/42') && options.method === 'PATCH') {
    return new Response(JSON.stringify({ state: 'closed' }), { status: 200 });
  }
  if (targetUrl.includes('/git/refs/heads/asset-factory/job-valid') && options.method === 'DELETE') {
    return new Response(null, { status: 204 });
  }
  throw new Error(`unexpected failed-promotion request: ${options.method ?? 'GET'} ${targetUrl}`);
};

const failedReconciliation = await reconcilePromotion({
  promotionId: 'LifeLoggerAI/UrAi:asset-factory/job-valid',
  jobId: 'job-valid',
  repository: 'LifeLoggerAI/UrAi',
  baseBranch: 'main',
  branch: 'asset-factory/job-valid',
  commitSha: 'e'.repeat(40),
  pullRequestNumber: 42,
  pullRequestUrl: 'https://github.com/LifeLoggerAI/UrAi/pull/42',
  requiredChecks: ['Governed asset promotion gate'],
  status: 'checks-pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
assert.equal(failedReconciliation.status, 'rolled-back');
assert.deepEqual(failedReconciliation.failedChecks, ['Governed asset promotion gate']);
assert.equal(failedPromotionCalls.some((call) => call.method === 'PATCH'), true);
assert.equal(failedPromotionCalls.some((call) => call.method === 'DELETE'), true);

const successfulPromotionCalls = [];
globalThis.fetch = async (url, options = {}) => {
  const targetUrl = String(url);
  successfulPromotionCalls.push({ url: targetUrl, method: options.method ?? 'GET' });
  if (targetUrl.endsWith('/pulls/43')) {
    return new Response(JSON.stringify({ head: { sha: 'a'.repeat(40) }, merged: true, merged_at: '2026-07-10T00:00:00.000Z' }), { status: 200 });
  }
  if (targetUrl.includes('/commits/') && targetUrl.includes('/check-runs')) {
    return new Response(JSON.stringify({
      check_runs: [{ name: 'Governed asset promotion gate', status: 'completed', conclusion: 'success' }],
    }), { status: 200 });
  }
  throw new Error(`unexpected successful-promotion request: ${options.method ?? 'GET'} ${targetUrl}`);
};

const successfulReconciliation = await reconcilePromotion({
  promotionId: 'LifeLoggerAI/UrAi:asset-factory/job-valid-2',
  jobId: 'job-valid-2',
  repository: 'LifeLoggerAI/UrAi',
  baseBranch: 'main',
  branch: 'asset-factory/job-valid-2',
  commitSha: 'b'.repeat(40),
  pullRequestNumber: 43,
  pullRequestUrl: 'https://github.com/LifeLoggerAI/UrAi/pull/43',
  requiredChecks: ['Governed asset promotion gate'],
  status: 'checks-pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
assert.equal(successfulReconciliation.status, 'merged');
assert.deepEqual(successfulReconciliation.failedChecks, []);
assert.equal(successfulPromotionCalls.some((call) => call.method === 'PATCH' || call.method === 'DELETE'), false);

globalThis.fetch = originalFetch;
if (originalPromotionToken === undefined) delete process.env.ASSET_FACTORY_PROMOTION_TOKEN;
else process.env.ASSET_FACTORY_PROMOTION_TOKEN = originalPromotionToken;

console.log('Governed autonomy policy, validation, routing, backoff, concurrency, promotion, and rollback tests passed.');
