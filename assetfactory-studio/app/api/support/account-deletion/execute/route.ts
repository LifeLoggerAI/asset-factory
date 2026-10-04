import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { getStoreDiagnostics, listAssets, listUsageEvents, purgeTenantData, readJobs, recordUsage } from '@/lib/server/assetFactoryStore';

function admission() {
  const mode = String(process.env.ASSET_FACTORY_DATA_RIGHTS_EXECUTION_MODE || '').trim();
  const project = String(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  const allowedProject = String(process.env.ASSET_FACTORY_DATA_RIGHTS_ALLOWED_PROJECT || '').trim();
  if (mode !== 'protected-staging' || !allowedProject || project !== allowedProject) {
    throw new Error('protected-staging-admission-required');
  }
  if (process.env.ASSET_FACTORY_DATA_RIGHTS_PRODUCTION_AUTHORIZED === 'true') {
    throw new Error('production-execution-forbidden-before-release-authorization');
  }
  const diagnostics = getStoreDiagnostics();
  if (diagnostics.mode !== 'firestore-storage') throw new Error('cloud-backend-required');
  return { mode, project, backend: diagnostics.mode };
}

export async function POST(req: NextRequest) {
  const apiKeyError = requireAssetFactoryApiKey(req);
  if (apiKeyError) return apiKeyError;

  const auth = authorizeAssetRequest(req, undefined, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tenantId = auth.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const deletionRequestId = typeof body.deletionRequestId === 'string' ? body.deletionRequestId.trim() : '';
  const retentionDecisionReceiptId = typeof body.retentionDecisionReceiptId === 'string' ? body.retentionDecisionReceiptId.trim() : '';
  const backupReceiptId = typeof body.backupReceiptId === 'string' ? body.backupReceiptId.trim() : '';
  const typedConfirmation = typeof body.confirmation === 'string' ? body.confirmation.trim() : '';
  if (deletionRequestId.length < 8 || retentionDecisionReceiptId.length < 8 || backupReceiptId.length < 8) {
    return NextResponse.json({ error: 'deletionRequestId, retentionDecisionReceiptId, and backupReceiptId are required' }, { status: 400 });
  }
  if (typedConfirmation !== `DELETE ${tenantId}`) {
    return NextResponse.json({ error: 'typed tenant confirmation is required' }, { status: 400 });
  }

  let admitted;
  try { admitted = admission(); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'execution-not-admitted' }, { status: 412 });
  }

  const [jobs, assets, usage] = await Promise.all([readJobs(), listAssets(), listUsageEvents()]);
  const tenantJobs = (jobs as Record<string, unknown>[]).filter((entry) => entry.tenantId === tenantId);
  const tenantAssets = (assets as Record<string, unknown>[]).filter((entry) => entry.tenantId === tenantId);
  const tenantUsage = (usage as Record<string, unknown>[]).filter((entry) => entry.tenantId === tenantId);
  const preflight = {
    tenantId,
    deletionRequestId,
    retentionDecisionReceiptId,
    backupReceiptId,
    counts: { jobs: tenantJobs.length, assets: tenantAssets.length, usageEvents: tenantUsage.length },
    artifactRefs: tenantAssets.map((entry) => entry.storagePaths ?? null),
  };
  const preflightDigest = createHash('sha256').update(JSON.stringify(preflight)).digest('hex');

  await recordUsage({
    action: 'account.deletion_execution_started',
    tenantId,
    deletionRequestId,
    retentionDecisionReceiptId,
    backupReceiptId,
    preflightDigest,
    admitted,
    executedBy: auth.userId ?? 'unknown',
    executionId: randomUUID(),
  });

  try {
    const result = await purgeTenantData(tenantId);
    const resultDigest = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    // The purge deletes prior tenant usage rows. Write the terminal receipt after purge.
    await recordUsage({
      action: 'account.deletion_execution_finished',
      tenantId,
      deletionRequestId,
      retentionDecisionReceiptId,
      backupReceiptId,
      preflightDigest,
      resultDigest,
      result,
      executedBy: auth.userId ?? 'unknown',
      centralPrivacyCompletionRequired: true,
    });
    return NextResponse.json({
      ok: true,
      tenantId,
      deletionRequestId,
      executionState: 'asset-factory-scope-purged-central-privacy-required',
      preflightDigest,
      resultDigest,
      result,
      centralPrivacyCompletionRequired: true,
    });
  } catch (error) {
    await recordUsage({
      action: 'account.deletion_execution_failed',
      tenantId,
      deletionRequestId,
      failure: error instanceof Error ? error.message : 'unknown-error',
      retryable: true,
      executedBy: auth.userId ?? 'unknown',
    });
    return NextResponse.json({ error: 'tenant deletion execution failed', retryable: true }, { status: 500 });
  }
}
