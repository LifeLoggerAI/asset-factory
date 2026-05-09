import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'asset-factory-studio',
    version: '1.0.0',
    targets: ['urai-studio', 'urai-spatial', 'urai-jobs', 'asset-factory-worker'],
    auth: {
      tenantHeader: 'x-tenant-id',
      apiKeyHeader: 'x-asset-factory-key',
      bearerAuthorization: true,
      cronSecretHeader: 'x-cron-secret',
      stripeSignatureHeader: 'stripe-signature',
      workerSecretHeader: 'x-asset-worker-secret',
    },
    routes: {
      presets: {
        list: 'GET /api/presets',
      },
      generation: {
        create: 'POST /api/generate',
        createJob: 'POST /api/jobs',
        listJobs: 'GET /api/jobs',
        readJob: 'GET /api/jobs/:jobId',
      },
      lifecycle: {
        queue: 'POST /api/jobs/:jobId/queue',
        materialize: 'POST /api/jobs/:jobId/materialize',
        publish: 'POST /api/jobs/:jobId/publish',
        approve: 'POST /api/jobs/:jobId/approve',
        rollback: 'POST /api/jobs/:jobId/rollback',
      },
      worker: {
        metadata: 'GET /api/worker/asset-queue',
        claimAndRun: 'POST /api/worker/asset-queue { action: "claim-and-run" }',
        heartbeat: 'POST /api/worker/asset-queue { action: "heartbeat", jobId, leaseId }',
        complete: 'POST /api/worker/asset-queue { action: "complete", jobId, leaseId }',
        fail: 'POST /api/worker/asset-queue { action: "fail", jobId, leaseId, reason, retryable }',
      },
      admin: {
        queue: 'GET /api/admin/queue?status=dead-lettered&limit=50',
        allTenantQueue: 'GET /api/admin/queue?allTenants=true',
        requeue: 'POST /api/admin/queue/requeue { jobId, reason, resetAttempts, allTenants }',
      },
      assets: {
        list: 'GET /api/assets',
        read: 'GET /api/assets/:jobId',
        download: 'GET /api/generated-assets/:file',
      },
      observability: {
        usage: 'GET /api/usage',
        dashboard: 'GET /api/dashboard',
        health: 'GET /api/system/health',
        fullHealth: 'GET /api/system/health?full=true',
        manifest: 'GET /api/system/manifest',
        fullManifest: 'GET /api/system/manifest?full=true',
      },
      integrations: {
        openapi: 'GET /api/system/openapi',
        capabilities: 'GET /api/system/capabilities',
        integrationContract: 'GET /api/system/integration-contract',
        stripeWebhook: 'POST /api/stripe/webhooks',
        cronIntegrityCheck: 'GET /api/cron/integrity-check',
      },
    },
    guarantees: [
      'Tenant-scoped APIs filter by x-tenant-id when supplied or required by auth mode.',
      'Mutating generation/lifecycle routes require the Asset Factory API key when API-key enforcement is enabled.',
      'Job execution routes validate tenant ownership before queueing, rendering, publishing, approving, or rolling back.',
      'Generated asset downloads require matching asset metadata before serving bytes.',
      'Full system diagnostics require a configured Asset Factory API key.',
      'Cron endpoints require CRON_SECRET.',
      'Stripe webhooks require verified stripe-signature headers and persist tenant entitlements when Firestore is configured.',
      'Worker queue endpoints require ASSET_FACTORY_WORKER_SECRET and use Firestore leases/retries/DLQ semantics in firestore-queue mode.',
      'Admin queue visibility requires the admin role and reports failed, dead-lettered, retrying, queued, claimed, and stale-lease queue items.',
      'Admin queue requeue requires the admin role, only requeues failed/dead-lettered/retrying items, and records usage audit events.',
    ],
  });
}
