import { createHash } from 'node:crypto';
import {
  approveAsset,
  findAsset,
  findJob,
  materializeAsset,
  publishAsset,
  readGeneratedAsset,
  readJobs,
  listUsageEvents,
  recordUsage,
  rollbackAsset,
  updateJob,
} from './assetFactoryStore';
import type { ClaimedAssetQueueJob } from './assetQueueDispatcher';
import { decideAssetAutonomy, loadAssetAutonomyPolicy, promptFingerprint } from './assetAutonomyPolicy';
import { validateGeneratedAsset, type AssetValidationReport } from './assetOutputValidation';
import {
  createPromotionPullRequest,
  isAutoPromotionEnabled,
  reconcilePromotion,
  type PromotionRecord,
} from './assetPromotion';

export type GovernedJobOutcome =
  | 'promotion-pending-checks'
  | 'manual-review'
  | 'rejected'
  | 'retryable-failure';

export type GovernedJobResult = {
  jobId: string;
  outcome: GovernedJobOutcome;
  retryable: boolean;
  assetFileName?: string;
  validation: AssetValidationReport;
  policyDecision: ReturnType<typeof decideAssetAutonomy>;
  promotion?: PromotionRecord;
};

type GenericRecord = Record<string, unknown>;

type AttemptRecord = {
  attemptId: string;
  attempt: number;
  workerId: string;
  leaseId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'materialized' | 'manual-review' | 'rejected' | 'retryable-failure' | 'promotion-pending-checks';
  requestFingerprint: string;
  generatorConfiguration: Record<string, unknown>;
  estimatedCostCents: number;
  assetFileName?: string;
  validationReportId?: string;
  policyDisposition?: string;
  failureReason?: string;
};

function record(value: unknown): GenericRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as GenericRecord : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function booleanFlag(name: string) {
  return process.env[name] === 'true';
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

async function evaluateDailyBudget(job: GenericRecord, maxDailyCostCents: number) {
  const tenantId = stringValue(job.tenantId) || 'default';
  const since = startOfUtcDay();
  const events = (await listUsageEvents()) as GenericRecord[];
  const reservedCostCents = events
    .filter((event) =>
      stringValue(event.tenantId) === tenantId &&
      stringValue(event.action) === 'job.created' &&
      stringValue(event.createdAt) >= since
    )
    .reduce((sum, event) => sum + numberValue(event.estimatedCostCents), 0);
  return {
    ok: reservedCostCents <= maxDailyCostCents,
    tenantId,
    since,
    reservedCostCents,
    maxDailyCostCents,
  };
}

export function isContinuousAssetEngineEnabled() {
  return booleanFlag('ASSET_FACTORY_CONTINUOUS_ENGINE_ENABLED');
}

export function isContinuousAssetEnginePaused() {
  return booleanFlag('ASSET_FACTORY_WORKERS_PAUSED');
}

export function generatorConfigurationSnapshot() {
  return {
    provider: process.env.ASSET_FACTORY_MEDIA_PROVIDER || 'local-proof',
    graphicsModel: process.env.ASSET_FACTORY_GRAPHICS_MODEL || null,
    audioModel: process.env.ASSET_FACTORY_AUDIO_MODEL || null,
    model3dModel: process.env.ASSET_FACTORY_MODEL3D_MODEL || null,
    providerTimeoutMs: Number(process.env.ASSET_FACTORY_PROVIDER_TIMEOUT_MS || 120000),
    providerMaxBytes: Number(process.env.ASSET_FACTORY_PROVIDER_MAX_BYTES || 100 * 1024 * 1024),
    autonomyPolicyVersion: loadAssetAutonomyPolicy().version,
    autoPromotionEnabled: isAutoPromotionEnabled(),
  };
}

function requestFingerprint(job: GenericRecord) {
  const metadata = record(job.metadata);
  const safeMetadata = {
    assetClass: metadata.assetClass ?? null,
    classificationConfidence: metadata.classificationConfidence ?? null,
    sensitivity: metadata.sensitivity ?? null,
    riskTags: metadata.riskTags ?? null,
    destinationRepository: metadata.destinationRepository ?? null,
    promotionSlug: metadata.promotionSlug ?? null,
  };
  return createHash('sha256').update(JSON.stringify({
    jobId: job.jobId,
    tenantId: job.tenantId,
    type: job.type,
    requestedType: job.requestedType,
    promptHash: promptFingerprint(job.prompt),
    presetId: job.presetId ?? null,
    format: job.format ?? null,
    variant: job.variant ?? null,
    targetModule: job.targetModule ?? null,
    size: job.size ?? null,
    metadata: safeMetadata,
  })).digest('hex');
}

async function startAttempt(job: GenericRecord, claimed: ClaimedAssetQueueJob, workerId: string) {
  const attemptId = `${claimed.jobId}:${claimed.attempts}`;
  const existing = Array.isArray(job.attemptHistory) ? job.attemptHistory as AttemptRecord[] : [];
  const alreadyRecorded = existing.some((item) => item.attemptId === attemptId);
  const attempt: AttemptRecord = {
    attemptId,
    attempt: claimed.attempts,
    workerId,
    leaseId: claimed.leaseId,
    startedAt: new Date().toISOString(),
    status: 'running',
    requestFingerprint: requestFingerprint(job),
    generatorConfiguration: generatorConfigurationSnapshot(),
    estimatedCostCents: numberValue(job.estimatedCostCents),
  };
  const attemptHistory = alreadyRecorded ? existing : [...existing, attempt];
  await updateJob(claimed.jobId, {
    status: 'rendering',
    queueStatus: 'claimed',
    workerId,
    leaseId: claimed.leaseId,
    leaseExpiresAt: claimed.leaseExpiresAt,
    attempts: claimed.attempts,
    currentAttemptId: attemptId,
    attemptHistory,
    generatorConfiguration: attempt.generatorConfiguration,
    lastTransitionAt: attempt.startedAt,
  });
  return attemptId;
}

async function finishAttempt(jobId: string, attemptId: string, patch: Partial<AttemptRecord>) {
  const latest = await findJob(jobId) as GenericRecord | null;
  if (!latest) return;
  const attempts = Array.isArray(latest.attemptHistory) ? latest.attemptHistory as AttemptRecord[] : [];
  const completedAt = new Date().toISOString();
  const updated = attempts.map((attempt) => attempt.attemptId === attemptId
    ? { ...attempt, ...patch, completedAt }
    : attempt);
  await updateJob(jobId, { attemptHistory: updated, lastAttemptCompletedAt: completedAt });
}

function existingAssetIsReusable(job: GenericRecord, asset: GenericRecord | null) {
  if (!asset) return false;
  if (job.forceRegenerate === true) return false;
  const manifest = record(asset.manifest);
  return stringValue(asset.jobId) === stringValue(job.jobId) && stringValue(manifest.jobId) === stringValue(job.jobId);
}

export function classifyExecutionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
  const lower = message.toLowerCase();
  const retryable = /timeout|timed out|rate limit|429|502|503|504|network|fetch failed|temporar|provider unavailable|storage write/.test(lower);
  return { message, retryable, code: retryable ? 'transient-network-error' : 'terminal-execution-error' };
}

export async function runGovernedAssetJob(
  claimed: ClaimedAssetQueueJob,
  workerId: string,
): Promise<GovernedJobResult> {
  if (!isContinuousAssetEngineEnabled()) throw new Error('Continuous asset engine is disabled.');
  if (isContinuousAssetEnginePaused()) throw new Error('Continuous asset engine workers are paused.');

  const job = await findJob(claimed.jobId) as GenericRecord | null;
  if (!job) throw new Error(`Asset Factory job ${claimed.jobId} was not found.`);
  const attemptId = await startAttempt(job, claimed, workerId);
  const policy = loadAssetAutonomyPolicy();

  let asset = await findAsset(claimed.jobId) as GenericRecord | null;
  if (!existingAssetIsReusable(job, asset)) {
    asset = await materializeAsset(claimed.jobId) as GenericRecord | null;
  } else {
    await updateJob(claimed.jobId, {
      status: 'materialized',
      idempotentReuse: true,
      reusedAssetFileName: asset?.fileName,
      lastTransitionAt: new Date().toISOString(),
    });
    await recordUsage({
      action: 'asset.materialization_reused',
      tenantId: job.tenantId ?? 'default',
      jobId: claimed.jobId,
      attemptId,
      fileName: asset?.fileName,
    });
  }
  if (!asset) throw new Error('Materialization completed without an asset record.');

  const assetFileName = stringValue(asset.fileName);
  const assetBuffer = assetFileName ? await readGeneratedAsset(assetFileName) : null;
  const validation = validateGeneratedAsset({ job, asset, assetBuffer, policy });
  const dailyBudget = await evaluateDailyBudget(job, policy.maxDailyCostCents);
  if (!dailyBudget.ok) {
    validation.checks.push({
      code: 'daily-budget-limit',
      status: 'fail',
      severity: 'error',
      message: `Tenant daily reserved generation cost exceeds ${policy.maxDailyCostCents} cents.`,
      details: dailyBudget,
    });
    validation.status = 'failed';
    validation.summary.failed += 1;
  }
  const policyDecision = decideAssetAutonomy({
    job,
    validationStatus: validation.status,
    validationSignals: validation.checks,
    estimatedCostCents: numberValue(job.actualCostCents) || numberValue(job.estimatedCostCents),
    policy,
  });

  await updateJob(claimed.jobId, {
    status: 'validated',
    validationReport: validation,
    validationStatus: validation.status,
    policyDecision,
    policyDisposition: policyDecision.disposition,
    classification: policyDecision.classification,
    promptHash: validation.promptHash,
    dailyBudgetSnapshot: dailyBudget,
    lastTransitionAt: new Date().toISOString(),
  });
  await recordUsage({
    action: 'asset.validated',
    tenantId: job.tenantId ?? 'default',
    jobId: claimed.jobId,
    attemptId,
    validationStatus: validation.status,
    validationFailed: validation.summary.failed,
    validationWarnings: validation.summary.warnings,
    policyDisposition: policyDecision.disposition,
    assetClass: policyDecision.classification.assetClass,
    estimatedCostCents: policyDecision.estimatedCostCents,
    dailyReservedCostCents: dailyBudget.reservedCostCents,
    dailyMaxCostCents: dailyBudget.maxDailyCostCents,
  });

  if (policyDecision.disposition === 'retryable-failure') {
    const reason = policyDecision.reasons.join('; ');
    await updateJob(claimed.jobId, { status: 'retryable-failure', queueStatus: 'retrying', failureReason: reason });
    await finishAttempt(claimed.jobId, attemptId, {
      status: 'retryable-failure', assetFileName, validationReportId: validation.reportId,
      policyDisposition: policyDecision.disposition, failureReason: reason,
    });
    return { jobId: claimed.jobId, outcome: 'retryable-failure', retryable: true, assetFileName, validation, policyDecision };
  }

  if (policyDecision.disposition === 'reject') {
    const reason = policyDecision.reasons.join('; ');
    await updateJob(claimed.jobId, { status: 'rejected', queueStatus: 'failed', failureReason: reason, rejectedAt: new Date().toISOString() });
    await finishAttempt(claimed.jobId, attemptId, {
      status: 'rejected', assetFileName, validationReportId: validation.reportId,
      policyDisposition: policyDecision.disposition, failureReason: reason,
    });
    return { jobId: claimed.jobId, outcome: 'rejected', retryable: false, assetFileName, validation, policyDecision };
  }

  if (policyDecision.disposition === 'manual-review' || !isAutoPromotionEnabled()) {
    const reasons = [...policyDecision.reasons];
    if (!isAutoPromotionEnabled()) reasons.push('automatic promotion is disabled');
    await updateJob(claimed.jobId, {
      status: 'manual-review',
      queueStatus: 'completed',
      approvalStatus: 'manual-review',
      manualReviewReasons: reasons,
      manualReviewRequestedAt: new Date().toISOString(),
    });
    await finishAttempt(claimed.jobId, attemptId, {
      status: 'manual-review', assetFileName, validationReportId: validation.reportId,
      policyDisposition: policyDecision.disposition,
    });
    return { jobId: claimed.jobId, outcome: 'manual-review', retryable: false, assetFileName, validation, policyDecision };
  }

  if (!assetBuffer || assetBuffer.byteLength === 0) {
    throw new Error('Generated artifact is unavailable for controlled promotion.');
  }

  const promotion = await createPromotionPullRequest({ job, asset, assetBuffer, validation, policy });
  await updateJob(claimed.jobId, {
    status: 'promotion-pending-checks',
    queueStatus: 'completed',
    approvalStatus: 'pending-repository-checks',
    promotion,
    promotedRepository: promotion.repository,
    promotionPullRequestUrl: promotion.pullRequestUrl,
    promotionStartedAt: promotion.createdAt,
    lastTransitionAt: new Date().toISOString(),
  });
  await recordUsage({
    action: 'asset.promotion_pr_opened',
    tenantId: job.tenantId ?? 'default',
    jobId: claimed.jobId,
    attemptId,
    repository: promotion.repository,
    pullRequestNumber: promotion.pullRequestNumber,
    requiredChecks: promotion.requiredChecks,
    estimatedCostCents: policyDecision.estimatedCostCents,
  });
  await finishAttempt(claimed.jobId, attemptId, {
    status: 'promotion-pending-checks', assetFileName, validationReportId: validation.reportId,
    policyDisposition: policyDecision.disposition,
  });

  return {
    jobId: claimed.jobId,
    outcome: 'promotion-pending-checks',
    retryable: false,
    assetFileName,
    validation,
    policyDecision,
    promotion,
  };
}

export async function reconcilePendingPromotions(limit = 10) {
  const jobs = (await readJobs()) as GenericRecord[];
  const candidates = jobs
    .filter((job) => ['promotion-pending-checks', 'promotion-checks-passed'].includes(stringValue(job.status)) && record(job.promotion).pullRequestNumber)
    .slice(0, Math.max(1, Math.min(limit, 50)));
  const results: GenericRecord[] = [];

  for (const job of candidates) {
    const promotion = record(job.promotion) as unknown as PromotionRecord;
    try {
      const reconciliation = await reconcilePromotion(promotion);
      if (reconciliation.status === 'rolled-back') {
        await rollbackAsset(stringValue(job.jobId), reconciliation.record.commitSha);
        await updateJob(stringValue(job.jobId), {
          status: 'rolled-back',
          approvalStatus: 'rejected',
          promotion: reconciliation.record,
          rollbackReason: `Required repository checks failed: ${reconciliation.failedChecks.join(', ')}`,
          rolledBackAt: new Date().toISOString(),
        });
        await recordUsage({ action: 'asset.promotion_rolled_back', jobId: job.jobId, repository: promotion.repository, failedChecks: reconciliation.failedChecks });
      } else if (reconciliation.status === 'merged') {
        await approveAsset(stringValue(job.jobId), {
          status: 'approved',
          reviewer: 'governed-autonomy',
          note: `Required checks passed and promotion PR ${promotion.pullRequestNumber} merged.`,
        });
        await publishAsset(stringValue(job.jobId));
        await updateJob(stringValue(job.jobId), {
          status: 'published',
          approvalStatus: 'approved',
          promotion: reconciliation.record,
          publishedAt: new Date().toISOString(),
        });
        await recordUsage({ action: 'asset.promotion_published', jobId: job.jobId, repository: promotion.repository, pullRequestNumber: promotion.pullRequestNumber });
      } else {
        await updateJob(stringValue(job.jobId), {
          status: reconciliation.status === 'checks-passed' ? 'promotion-checks-passed' : 'promotion-pending-checks',
          promotion: reconciliation.record,
          missingChecks: reconciliation.missingChecks,
          pendingChecks: reconciliation.pendingChecks,
          lastPromotionCheckAt: new Date().toISOString(),
        });
      }
      results.push({ jobId: job.jobId, ...reconciliation });
    } catch (error) {
      const classified = classifyExecutionError(error);
      await updateJob(stringValue(job.jobId), {
        promotionReconcileError: classified.message,
        promotionReconcileRetryable: classified.retryable,
        lastPromotionCheckAt: new Date().toISOString(),
      });
      results.push({ jobId: job.jobId, status: 'error', ...classified });
    }
  }

  return { inspected: candidates.length, results };
}

export async function readAutonomyOperationsSummary() {
  const jobs = (await readJobs()) as GenericRecord[];
  const byStatus: Record<string, number> = {};
  let estimatedCostCents = 0;
  let rolledBack = 0;
  let promoted = 0;
  for (const job of jobs) {
    const status = stringValue(job.status) || 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    estimatedCostCents += numberValue(job.estimatedCostCents);
    if (status === 'rolled-back') rolledBack += 1;
    if (record(job.promotion).pullRequestNumber) promoted += 1;
  }
  return {
    enabled: isContinuousAssetEngineEnabled(),
    paused: isContinuousAssetEnginePaused(),
    autoPromotionEnabled: isAutoPromotionEnabled(),
    policy: loadAssetAutonomyPolicy(),
    jobs: { total: jobs.length, byStatus, estimatedCostCents, promoted, rolledBack },
    generatedAt: new Date().toISOString(),
  };
}
