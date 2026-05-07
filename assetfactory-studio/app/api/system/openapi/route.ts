import { NextResponse } from 'next/server';

const bearerSecurity = [{ bearerAuth: [] }, { assetFactoryApiKey: [] }];

export async function GET() {
  return NextResponse.json({
    openapi: '3.0.0',
    info: {
      title: 'Asset Factory Studio API',
      version: '1.0.0',
      description: 'Contract summary for the hardened Asset Factory Studio API surface.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Bearer token used by tenant-authenticated requests.',
        },
        assetFactoryApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-asset-factory-key',
          description: 'Asset Factory API key required for protected mutating and full-diagnostics endpoints.',
        },
        cronSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'x-cron-secret',
          description: 'Dedicated secret for cron endpoints.',
        },
        stripeSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'stripe-signature',
          description: 'Stripe webhook signature header verified against STRIPE_WEBHOOK_SECRET.',
        },
      },
    },
    paths: {
      '/api/presets': {
        get: { summary: 'List public generation presets.' },
      },
      '/api/generate': {
        get: { summary: 'List jobs visible to the current tenant.' },
        post: { summary: 'Create a validated generation job.', security: bearerSecurity },
      },
      '/api/jobs': {
        get: { summary: 'List jobs visible to the current tenant.' },
        post: { summary: 'Create a validated job with generated/defaulted job metadata.', security: bearerSecurity },
      },
      '/api/jobs/{jobId}': {
        get: { summary: 'Read a tenant-authorized job by ID.' },
      },
      '/api/jobs/{jobId}/queue': {
        get: { summary: 'Read a tenant-authorized queue item by job ID.' },
        post: { summary: 'Queue or run materialization for a tenant-authorized job.', security: bearerSecurity },
      },
      '/api/jobs/{jobId}/materialize': {
        post: { summary: 'Materialize a tenant-authorized job into a generated asset.', security: bearerSecurity },
      },
      '/api/jobs/{jobId}/publish': {
        post: { summary: 'Publish a tenant-authorized materialized asset.', security: bearerSecurity },
      },
      '/api/jobs/{jobId}/approve': {
        post: { summary: 'Approve or review a tenant-authorized asset.', security: bearerSecurity },
      },
      '/api/jobs/{jobId}/rollback': {
        post: { summary: 'Record a rollback against a tenant-authorized asset.', security: bearerSecurity },
      },
      '/api/assets': {
        get: { summary: 'List generated asset metadata visible to the current tenant.' },
      },
      '/api/assets/{jobId}': {
        get: { summary: 'Read generated asset metadata by job ID.' },
      },
      '/api/generated-assets/{file}': {
        get: { summary: 'Download a generated asset file when matching asset metadata and tenant auth exist.' },
      },
      '/api/usage': {
        get: { summary: 'Read tenant-scoped usage aggregates.' },
      },
      '/api/dashboard': {
        get: { summary: 'Read tenant-scoped dashboard aggregates.' },
      },
      '/api/system/health': {
        get: { summary: 'Read public health summary. Use ?full=true with API key for full diagnostics.' },
      },
      '/api/system/manifest': {
        get: { summary: 'Read public manifest summary. Use ?full=true with API key for full diagnostics.' },
      },
      '/api/system/capabilities': {
        get: { summary: 'Read public capability list.' },
      },
      '/api/system/integration-contract': {
        get: { summary: 'Read integration targets and route contracts.' },
      },
      '/api/cron/integrity-check': {
        get: { summary: 'Run or inspect the integrity cron placeholder.', security: [{ cronSecret: [] }] },
      },
      '/api/stripe/webhooks': {
        post: { summary: 'Receive verified Stripe webhook events.', security: [{ stripeSignature: [] }] },
      },
    },
  });
}
