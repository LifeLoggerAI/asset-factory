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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-video-transactions-test-'));
const compiledDir = path.join(tmpDir, 'compiled');
const runtimeDir = path.join(tmpDir, 'runtime');
fs.mkdirSync(path.join(compiledDir, 'lib', 'server'), { recursive: true });
fs.mkdirSync(runtimeDir, { recursive: true });

fs.writeFileSync(
  path.join(compiledDir, 'lib', 'server', 'firebaseAdmin.mjs'),
  'export function getAdminDb() { return null; }\n',
);

const sourcePath = path.join(studioRoot, 'lib', 'server', 'assetVideoTransactions.ts');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(
  "import { getAdminDb } from './firebaseAdmin';",
  "import { getAdminDb } from './firebaseAdmin.mjs';",
);
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
const compiledPath = path.join(compiledDir, 'lib', 'server', 'assetVideoTransactions.mjs');
fs.writeFileSync(compiledPath, output);

const originalCwd = process.cwd();
process.chdir(runtimeDir);
const transactions = await import(pathToFileURL(compiledPath).href);

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const ARTIFACT_HASH = 'c'.repeat(64);

function reserveInput(overrides = {}) {
  return {
    tenantId: 'tenant-test',
    campaignId: 'waiting-room-test',
    jobId: 'video-job-001',
    idempotencyKey: 'video-idempotency-001',
    requestHash: HASH_A,
    provider: 'replicate',
    providerModel: 'owner/video-model-version',
    estimatedCostCents: 600,
    maxJobCostCents: 1000,
    maxCampaignCostCents: 2000,
    maxAttempts: 1,
    ...overrides,
  };
}

async function testReservationReplayAndConflict() {
  const first = await transactions.reserveVideoProviderTransaction(reserveInput());
  assert.equal(first.ok, true);
  assert.equal(first.replayed, false);
  assert.equal(first.transaction.status, 'reserved');
  assert.equal(first.transaction.reservedCostCents, 600);
  assert.equal(first.transaction.attemptCount, 0);
  assert.equal(first.transaction.productionReady, false);

  const replay = await transactions.reserveVideoProviderTransaction(reserveInput());
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(replay.transaction.transactionId, first.transaction.transactionId);
  assert.equal(replay.budget.reservedCostCents, 600);

  const conflict = await transactions.reserveVideoProviderTransaction(reserveInput({ requestHash: HASH_B }));
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflict, true);
  assert.match(conflict.error, /different video request/);
}

async function testPerJobAndCampaignCeilings() {
  const perJob = await transactions.reserveVideoProviderTransaction(reserveInput({
    tenantId: 'tenant-job-cap',
    campaignId: 'campaign-job-cap',
    jobId: 'video-job-cap',
    idempotencyKey: 'job-cap-key',
    estimatedCostCents: 1001,
    maxJobCostCents: 1000,
  }));
  assert.equal(perJob.ok, false);
  assert.equal(perJob.rejected, true);
  assert.match(perJob.error, /per-job ceiling/);

  const first = await transactions.reserveVideoProviderTransaction(reserveInput({
    tenantId: 'tenant-campaign-cap',
    campaignId: 'campaign-cap',
    jobId: 'campaign-job-1',
    idempotencyKey: 'campaign-key-1',
    estimatedCostCents: 600,
    maxCampaignCostCents: 1000,
  }));
  assert.equal(first.ok, true);

  const second = await transactions.reserveVideoProviderTransaction(reserveInput({
    tenantId: 'tenant-campaign-cap',
    campaignId: 'campaign-cap',
    jobId: 'campaign-job-2',
    idempotencyKey: 'campaign-key-2',
    requestHash: HASH_B,
    estimatedCostCents: 500,
    maxCampaignCostCents: 1000,
  }));
  assert.equal(second.ok, false);
  assert.equal(second.rejected, true);
  assert.match(second.error, /campaign spend ceiling/);
}

async function testOneDispatchLeaseAndArtifactReviewState() {
  const reservation = await transactions.reserveVideoProviderTransaction(reserveInput({
    tenantId: 'tenant-dispatch',
    campaignId: 'campaign-dispatch',
    jobId: 'dispatch-job',
    idempotencyKey: 'dispatch-key',
  }));
  assert.equal(reservation.ok, true);

  const firstAttempt = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: HASH_A,
    jobId: 'dispatch-job',
  });
  assert.equal(firstAttempt.ok, true);
  assert.equal(firstAttempt.shouldDispatch, true);
  assert.equal(firstAttempt.transaction.status, 'dispatching');
  assert.equal(firstAttempt.transaction.attemptCount, 1);
  assert.ok(firstAttempt.attemptId);

  const duplicateAttempt = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: HASH_A,
    jobId: 'dispatch-job',
  });
  assert.equal(duplicateAttempt.ok, false);
  assert.equal(duplicateAttempt.shouldDispatch, false);
  assert.match(duplicateAttempt.error, /already active/);

  const ready = await transactions.markVideoProviderArtifactReady({
    transactionId: reservation.transaction.transactionId,
    attemptId: firstAttempt.attemptId,
    artifactSha256: ARTIFACT_HASH,
    artifactMimeType: 'video/mp4',
    providerPredictionId: 'prediction-001',
  });
  assert.equal(ready.status, 'artifact-ready-review');
  assert.equal(ready.reservationHeld, true);
  assert.equal(ready.humanReviewRequired, true);
  assert.equal(ready.productionReady, false);
  assert.equal(ready.artifactSha256, ARTIFACT_HASH);

  const replayAfterReady = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: HASH_A,
    jobId: 'dispatch-job',
  });
  assert.equal(replayAfterReady.ok, true);
  assert.equal(replayAfterReady.shouldDispatch, false);
  assert.equal(replayAfterReady.replayed, true);
}

async function testFailureHoldsReservationAndBlocksAutomaticRetry() {
  const reservation = await transactions.reserveVideoProviderTransaction(reserveInput({
    tenantId: 'tenant-failure',
    campaignId: 'campaign-failure',
    jobId: 'failure-job',
    idempotencyKey: 'failure-key',
  }));
  const attempt = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: HASH_A,
    jobId: 'failure-job',
  });

  const failed = await transactions.markVideoProviderAttemptFailed({
    transactionId: reservation.transaction.transactionId,
    attemptId: attempt.attemptId,
    failureReason: 'provider returned a bounded test failure',
  });
  assert.equal(failed.status, 'failed-reservation-held');
  assert.equal(failed.reservationHeld, true);
  assert.equal(failed.attemptCount, 1);

  const retry = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: HASH_A,
    jobId: 'failure-job',
  });
  assert.equal(retry.ok, false);
  assert.equal(retry.shouldDispatch, false);
  assert.match(retry.error, /cannot dispatch from status failed-reservation-held/);
}

try {
  await testReservationReplayAndConflict();
  await testPerJobAndCampaignCeilings();
  await testOneDispatchLeaseAndArtifactReviewState();
  await testFailureHoldsReservationAndBlocksAutomaticRetry();
  console.log('PASS Asset Factory paid video transaction behavior tests');
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}