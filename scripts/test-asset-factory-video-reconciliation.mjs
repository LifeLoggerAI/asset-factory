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
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-factory-video-reconciliation-test-'));
const compiledDir = path.join(tmpDir, 'compiled');
const runtimeDir = path.join(tmpDir, 'runtime');
fs.mkdirSync(path.join(compiledDir, 'lib', 'server'), { recursive: true });
fs.mkdirSync(runtimeDir, { recursive: true });

fs.writeFileSync(
  path.join(compiledDir, 'lib', 'server', 'firebaseAdmin.mjs'),
  'export function getAdminDb() { return null; }\n',
);

function compile(relativePath) {
  const sourcePath = path.join(studioRoot, relativePath);
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
  const outputPath = path.join(compiledDir, relativePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  return outputPath;
}

const transactionsPath = compile('lib/server/assetVideoTransactions.ts');
const reconciliationPath = compile('lib/server/assetVideoReconciliation.ts');

const originalCwd = process.cwd();
process.chdir(runtimeDir);
const transactions = await import(pathToFileURL(transactionsPath).href);
const reconciliation = await import(pathToFileURL(reconciliationPath).href);

const REQUEST_HASH = 'a'.repeat(64);
const ARTIFACT_HASH = 'b'.repeat(64);

function reservationInput(suffix, overrides = {}) {
  return {
    tenantId: `tenant-${suffix}`,
    campaignId: `campaign-${suffix}`,
    jobId: `job-${suffix}`,
    idempotencyKey: `key-${suffix}`,
    requestHash: REQUEST_HASH,
    provider: 'replicate',
    providerModel: 'owner/video-model-version',
    estimatedCostCents: 600,
    maxJobCostCents: 1000,
    maxCampaignCostCents: 2000,
    maxAttempts: 1,
    ...overrides,
  };
}

async function createReadyArtifact(suffix, overrides = {}) {
  const reservation = await transactions.reserveVideoProviderTransaction(reservationInput(suffix, overrides));
  assert.equal(reservation.ok, true);
  const attempt = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: REQUEST_HASH,
    jobId: `job-${suffix}`,
  });
  assert.equal(attempt.ok, true);
  assert.equal(attempt.shouldDispatch, true);
  await transactions.markVideoProviderArtifactReady({
    transactionId: reservation.transaction.transactionId,
    attemptId: attempt.attemptId,
    artifactSha256: ARTIFACT_HASH,
    artifactMimeType: 'video/mp4',
    providerPredictionId: `prediction-${suffix}`,
  });
  return reservation.transaction.transactionId;
}

async function testAcceptedArtifactSettlement() {
  const transactionId = await createReadyArtifact('accepted');
  const result = await reconciliation.reconcileVideoProviderTransaction({
    transactionId,
    actualCostCents: 525,
    resolution: 'artifact-accepted',
    operatorId: 'operator-accepted',
    note: 'Creative and provider receipt reviewed.',
  });

  assert.equal(result.transaction.status, 'reconciled');
  assert.equal(result.transaction.reservationHeld, false);
  assert.equal(result.transaction.actualCostCents, 525);
  assert.equal(result.transaction.reservedCostCents, 0);
  assert.equal(result.transaction.productionReady, false);
  assert.equal(result.transaction.reconciliationResolution, 'artifact-accepted');
  assert.equal(result.budget.reservedCostCents, 0);
  assert.equal(result.budget.spentCostCents, 525);

  await assert.rejects(
    () => reconciliation.reconcileVideoProviderTransaction({
      transactionId,
      actualCostCents: 525,
      resolution: 'artifact-accepted',
      operatorId: 'operator-accepted',
    }),
    /reservation is not held/,
  );
}

async function testProviderRefundSettlement() {
  const reservation = await transactions.reserveVideoProviderTransaction(reservationInput('refund'));
  const attempt = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: REQUEST_HASH,
    jobId: 'job-refund',
  });
  await transactions.markVideoProviderAttemptFailed({
    transactionId: reservation.transaction.transactionId,
    attemptId: attempt.attemptId,
    failureReason: 'provider failed before producing a billable artifact',
  });

  const result = await reconciliation.reconcileVideoProviderTransaction({
    transactionId: reservation.transaction.transactionId,
    actualCostCents: 0,
    resolution: 'provider-refund',
    operatorId: 'operator-refund',
    note: 'Provider confirmed zero charge.',
  });

  assert.equal(result.transaction.status, 'reconciled');
  assert.equal(result.transaction.actualCostCents, 0);
  assert.equal(result.transaction.reservationHeld, false);
  assert.equal(result.budget.reservedCostCents, 0);
  assert.equal(result.budget.spentCostCents, 0);
}

async function testUnusedReservationRelease() {
  const reservation = await transactions.reserveVideoProviderTransaction(reservationInput('release'));
  assert.equal(reservation.budget.reservedCostCents, 600);

  const result = await reconciliation.releaseVideoProviderReservation({
    transactionId: reservation.transaction.transactionId,
    operatorId: 'operator-release',
    reason: 'Campaign shot was cancelled before provider dispatch.',
  });

  assert.equal(result.transaction.status, 'released');
  assert.equal(result.transaction.reservationHeld, false);
  assert.equal(result.transaction.actualCostCents, 0);
  assert.equal(result.transaction.attemptCount, 0);
  assert.equal(result.budget.reservedCostCents, 0);
  assert.equal(result.budget.spentCostCents, 0);
}

async function testReleaseAfterDispatchIsRejected() {
  const reservation = await transactions.reserveVideoProviderTransaction(reservationInput('no-release'));
  const attempt = await transactions.beginVideoProviderAttempt({
    transactionId: reservation.transaction.transactionId,
    requestHash: REQUEST_HASH,
    jobId: 'job-no-release',
  });
  assert.equal(attempt.shouldDispatch, true);

  await assert.rejects(
    () => reconciliation.releaseVideoProviderReservation({
      transactionId: reservation.transaction.transactionId,
      operatorId: 'operator-no-release',
      reason: 'Invalid attempt to release after provider dispatch.',
    }),
    /only be released before provider dispatch/,
  );
}

async function testActualCostCannotBreakCampaignCeiling() {
  const transactionId = await createReadyArtifact('campaign-overage', {
    estimatedCostCents: 600,
    maxJobCostCents: 2000,
    maxCampaignCostCents: 1000,
  });

  await assert.rejects(
    () => reconciliation.reconcileVideoProviderTransaction({
      transactionId,
      actualCostCents: 1001,
      resolution: 'artifact-rejected',
      operatorId: 'operator-overage',
    }),
    /campaign ceiling/,
  );
}

try {
  await testAcceptedArtifactSettlement();
  await testProviderRefundSettlement();
  await testUnusedReservationRelease();
  await testReleaseAfterDispatchIsRejected();
  await testActualCostCannotBreakCampaignCeiling();
  console.log('PASS Asset Factory video reconciliation behavior tests');
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
