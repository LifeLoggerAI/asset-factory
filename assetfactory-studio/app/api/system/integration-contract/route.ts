import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'asset-factory-studio',
    version: '1.0.0',
    targets: ['urai-studio', 'urai-spatial', 'urai-jobs'],
    auth: {
      tenantHeader: 'x-tenant-id',
      apiKeyHeader: 'x-asset-factory-key',
      bearerAuthorization: true,
      cronSecretHeader: 'x-cron-secret',
      stripeSignatureHeader: 'stripe-signature',
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
      'Stripe webhooks require verified stripe-signature headers.',
    ],
  });
}
