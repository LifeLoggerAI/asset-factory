# Asset Factory Production Readiness Audit

## Executive summary

Asset Factory is a production-oriented monorepo for deterministic asset generation and Firebase processing pipelines. The current architecture is close to a commercial launch foundation, but several pieces were previously wired as local/demo-safe implementations rather than production persistence and billing integrations.

This pass hardens the Studio path by wiring the canonical generation flow to Firestore and Cloud Storage when Firebase Admin credentials are available, preserving local JSON as a safe development fallback, documenting production environment requirements, improving the Studio UI flow, expanding health/manifest diagnostics, and making unconfigured Stripe webhooks fail closed.

## Architecture map

### Root
- `package.json`: root orchestration for tests and builds across `engine`, `life-map-pipeline/functions`, and `functions`.
- `README.md`: top-level quick start and repo structure.

### `engine/`
- Headless V1 deterministic asset generation engine.
- Node/Express runtime with CORS, rate limiting, archiving, filesystem support, Stripe dependency, and UUID generation.
- Test entrypoint: `node --test test/*.test.js`.

### `assetfactory-studio/`
- Next.js 16 + React 19 studio app.
- Primary API routes include:
  - `/api/generate`
  - `/api/jobs`
  - `/api/jobs/:jobId`
  - `/api/jobs/:jobId/materialize`
  - `/api/assets`
  - `/api/generated-assets/:file`
  - `/api/system/health`
  - `/api/system/manifest`
  - `/api/stripe/webhooks`
- Server layer:
  - `lib/server/assetFactoryStore.ts`
  - `lib/server/localAssetFactoryStore.ts`
  - `lib/server/firebaseAdmin.ts`
  - `lib/server/assetRenderer.ts`
  - `lib/server/assetFactoryValidation.ts`

### `functions/`
- Legacy/root Firebase Cloud Functions package.
- Node 18 runtime.
- Build uses `node --check index.js`.

### `life-map-pipeline/functions/`
- TypeScript Firebase Functions package for LifeMap ingestion.
- Node 20 runtime.
- Build uses `tsc`.

## Frameworks and build system

- Monorepo package orchestration with npm scripts.
- Next.js 16 / React 19 for Studio.
- Firebase Admin / Firebase Functions for backend deployment paths.
- TypeScript for Studio and LifeMap functions.
- Plain JavaScript for root legacy functions and engine runtime.

## Data, storage, queue, and pipeline model

### Before this pass
- Store diagnostics could report `firestore-storage` when Firebase Admin was available, but job and asset operations always delegated to local JSON.
- Generated assets were always written to local filesystem storage.
- Studio homepage called a missing token endpoint and did not use the canonical validated generation contract.
- Stripe webhook route returned success even when no Stripe secret or verification existed.

### After this pass
- Studio persistence uses Firestore collections when Firebase Admin is available.
- Generated assets and manifests write to Cloud Storage when Firebase Admin and a bucket are configured.
- Local JSON remains available for local development and forced fallback via `ASSET_FACTORY_FORCE_LOCAL=true`.
- Studio homepage calls `/api/generate`, then materializes through `/api/jobs/:jobId/materialize`.
- Health and manifest endpoints expose persistence mode, fallback status, collection names, storage prefix, Firebase diagnostics, and capability status.
- Stripe webhook path fails closed until `STRIPE_WEBHOOK_SECRET` is configured and real signature verification is implemented.

## Current production readiness status

| Area | Status | Notes |
| --- | --- | --- |
| Framework | Ready | Next.js Studio + Firebase Functions monorepo. |
| Local dev fallback | Ready | Local JSON mode remains intact. |
| Firestore persistence | Improved | Wired for jobs/assets using Firebase Admin. |
| Cloud Storage persistence | Improved | Generated assets/manifests write to configured bucket. |
| Auth | Partial | Env placeholders documented; endpoint-level enforcement still needs final policy. |
| Billing | Blocked | Stripe webhook now fails closed until verified handler is implemented. |
| Queue/worker | Partial | Current flow materializes synchronously from Studio; production should move heavy rendering to Cloud Tasks/Pub/Sub. |
| AI/media providers | Blocked by credentials | Provider env variables documented. Renderer remains deterministic SVG proof mode. |
| CI/CD | Partial | Package scripts exist; GitHub Actions should be added if not already present. |
| Observability | Partial | Env placeholders documented; Sentry/PostHog wiring still optional. |
| Security | Improved | Path traversal protection exists; billing fail-closed added; auth/rate limits still need full enforcement on mutating Studio endpoints. |

## Files changed in this pass

- `assetfactory-studio/lib/server/assetFactoryStore.ts`
- `assetfactory-studio/app/api/system/health/route.ts`
- `assetfactory-studio/.env.example`
- `assetfactory-studio/app/page.tsx`
- `assetfactory-studio/app/api/stripe/webhooks/route.ts`
- `assetfactory-studio/app/api/system/manifest/route.ts`
- `PRODUCTION_AUDIT.md`

## Remaining blockers requiring credentials or external services

- Firebase project/service account credentials.
- Firebase Storage bucket name.
- API auth policy and production API key/JWT issuer details.
- Stripe secret and webhook secret.
- AI/media provider credentials for real image/video/audio generation.
- Production observability DSNs/keys.
- Hosting target decision for Studio and worker separation.

## Security concerns to resolve before public launch

1. Enforce API authentication on all mutating endpoints.
2. Add rate limiting and/or WAF protection at edge or middleware level.
3. Implement verified Stripe webhook handling with raw body signature verification.
4. Add tenant-level authorization checks so users only access their own jobs/assets.
5. Replace any contract-only approval/rollback responses with persisted audit-log records.
6. Confirm Firebase security rules and Storage IAM policies.
7. Add structured logging with request IDs and tenant/job correlation.

## Scalability concerns

1. Current Studio materialization path is synchronous and suitable for proof rendering, not long-running media generation.
2. Move heavy AI/video/audio rendering to a worker backed by Cloud Tasks, Pub/Sub, or a managed queue.
3. Add job leases, retries, retry limits, dead-letter queues, and idempotency keys.
4. Store job status transitions in append-only events for auditability.
5. Add pagination/cursors to job and asset listing APIs.
6. Use signed URLs for private generated asset downloads.
7. Add cleanup/retention jobs for abandoned intermediate files.

## Commands to run locally

```bash
npm install
npm run build
npm test

cd assetfactory-studio
npm install
npm run lint
npm run typecheck
npm run test
npm run build
npm run dev

cd ../engine
npm install
npm test
npm start

cd ../life-map-pipeline/functions
npm install
npm run build
npm run serve
```

## Deployment commands

```bash
# Studio, if deploying from assetfactory-studio to Vercel
cd assetfactory-studio
npm install
npm run build
vercel deploy --prod

# Firebase functions
cd life-map-pipeline/functions
npm install
npm run build
firebase deploy --only functions

cd ../../functions
npm install
npm run build
firebase deploy --only functions
```

## Recommended production stack

- Studio: Vercel or Cloud Run.
- API/worker: Cloud Run services for long-running generation jobs.
- Queue: Cloud Tasks for transactional jobs or Pub/Sub for high-throughput fanout.
- Database: Firestore for job metadata, manifests, status, and tenant-scoped records.
- Storage: Google Cloud Storage / Firebase Storage for generated assets and manifests.
- Secrets: Google Secret Manager or Vercel encrypted env vars.
- Auth: Firebase Auth, Clerk, or Auth0 with tenant claims.
- Billing: Stripe with verified webhooks and entitlement records.

## Recommended monitoring/logging stack

- Sentry for frontend/API exceptions.
- Google Cloud Logging for Cloud Run and Firebase Functions.
- OpenTelemetry traces for generation lifecycle events.
- PostHog for product analytics and funnel metrics.
- UptimeRobot, Better Stack, or Google Cloud Monitoring uptime checks for health endpoints.

## Next milestones

1. Add middleware/API helper enforcing auth and tenant scoping.
2. Implement Stripe webhook verification and entitlement persistence.
3. Extract rendering into a queue-backed worker service.
4. Add signed asset download URLs and private bucket access controls.
5. Add GitHub Actions CI for root, Studio, engine, and functions validation.
6. Add persisted job events, retries, DLQ, and cleanup cron.
7. Add real AI/media provider adapters behind a provider interface.
8. Add E2E tests for generate → materialize → preview/download → publish.
