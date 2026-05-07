# Asset Factory Production Readiness Audit

## Executive summary

Asset Factory is a production-oriented monorepo for deterministic asset generation and Firebase processing pipelines. The current architecture is now a stronger commercial launch foundation, with the Studio path hardened around persistence, tenant scoping, authenticated mutations, verified Stripe webhooks, safer system diagnostics, and broader route validation coverage.

This pass hardens the Studio path by wiring the canonical generation flow to Firestore and Cloud Storage when Firebase Admin credentials are available, preserving local JSON as a safe development fallback, documenting production environment requirements, improving the Studio UI flow, expanding and redacting health/manifest diagnostics, protecting operational routes, verifying Stripe webhook signatures, and aligning public contract metadata with the API surface.

## Architecture map

### Root
- `package.json`: root orchestration for tests and builds across `engine`, `life-map-pipeline/functions`, and `functions`.
- `.github/workflows/ci.yml`: package-level Node 20 validation for root orchestration, Studio, engine, Firebase functions, and LifeMap functions.
- `README.md`: top-level quick start and repo structure.

### `engine/`
- Headless V1 deterministic asset generation engine.
- Node/Express runtime with CORS, rate limiting, archiving, filesystem support, Stripe dependency, and UUID generation.
- Test entrypoint: `node --test test/*.test.js`.

### `assetfactory-studio/`
- Next.js 16 + React 19 studio app.
- Primary API routes include:
  - `/api/presets`
  - `/api/generate`
  - `/api/jobs`
  - `/api/jobs/:jobId`
  - `/api/jobs/:jobId/queue`
  - `/api/jobs/:jobId/materialize`
  - `/api/jobs/:jobId/publish`
  - `/api/jobs/:jobId/approve`
  - `/api/jobs/:jobId/rollback`
  - `/api/assets`
  - `/api/assets/:jobId`
  - `/api/generated-assets/:file`
  - `/api/usage`
  - `/api/dashboard`
  - `/api/system/health`
  - `/api/system/manifest`
  - `/api/system/openapi`
  - `/api/system/integration-contract`
  - `/api/cron/integrity-check`
  - `/api/stripe/webhooks`
- Server layer:
  - `lib/server/assetFactoryStore.ts`
  - `lib/server/localAssetFactoryStore.ts`
  - `lib/server/firebaseAdmin.ts`
  - `lib/server/apiAuth.ts`
  - `lib/server/assetAuth.ts`
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
- GitHub Actions CI validates root, Studio, engine, root functions, and LifeMap functions.
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
- Job execution routes, generated downloads, usage aggregates, dashboard aggregates, cron endpoints, and full diagnostics had incomplete production guards.

### After this pass
- Studio persistence uses Firestore collections when Firebase Admin is available.
- Generated assets and manifests write to Cloud Storage when Firebase Admin and a bucket are configured.
- Local JSON remains available for local development and forced fallback via `ASSET_FACTORY_FORCE_LOCAL=true`.
- Studio homepage calls `/api/generate`, then materializes through `/api/jobs/:jobId/materialize`.
- Mutating generation and lifecycle routes are API-key guarded when API-key enforcement is enabled.
- Job execution routes validate tenant ownership before queueing, materializing, publishing, approving, or rolling back.
- Generated asset downloads require matching asset metadata before serving file bytes.
- Usage and dashboard aggregates are tenant-scoped when a tenant is present.
- Health and manifest endpoints return public-safe summaries by default; full diagnostics require `?full=true` and the configured Asset Factory API key.
- Stripe webhook requests are verified with raw-body HMAC signature checks before processing.
- Cron integrity route requires `CRON_SECRET`.
- OpenAPI and integration-contract endpoints document the current route/auth contract.

## Current production readiness status

| Area | Status | Notes |
| --- | --- | --- |
| Framework | Ready | Next.js Studio + Firebase Functions monorepo. |
| Local dev fallback | Ready | Local JSON mode remains intact. |
| Firestore persistence | Improved | Wired for jobs/assets using Firebase Admin. |
| Cloud Storage persistence | Improved | Generated assets/manifests write to configured bucket. |
| Auth | Improved | API-key helper, tenant helper, and configured-key full diagnostics helper are in place; final production identity provider/JWT policy still needs deployment configuration. |
| Billing | Improved | Studio Stripe webhook route verifies signatures and records receipt events; entitlement persistence still needs plan-specific implementation. |
| Queue/worker | Partial | Current flow can enqueue/dispatch but proof rendering remains suitable for synchronous/local execution; production AI/media generation should move to Cloud Tasks/Pub/Sub or worker services. |
| AI/media providers | Blocked by credentials | Provider env variables documented. Renderer remains deterministic proof mode unless provider-backed adapters are configured. |
| CI/CD | Improved | GitHub Actions validates package-level root, Studio, engine, root functions, and LifeMap functions checks. |
| Observability | Partial | Env placeholders documented; Sentry/PostHog wiring still optional. |
| Security | Improved | Tenant scoping, protected mutations, protected cron, redacted diagnostics, verified Stripe signatures, stricter IDs/files, and generated-download metadata checks are in place. Rate limiting/WAF and final production IAM/rules review remain. |

## Key hardening completed

- Protected mutating generation/job lifecycle routes with API-key and tenant checks.
- Scoped jobs, assets, usage, dashboard, and queue reads through tenant authorization.
- Required generated asset metadata before file downloads.
- Tightened job ID and generated filename validation to single safe path segments.
- Verified Stripe webhook signatures before recording receipt events.
- Protected cron integrity endpoint with `CRON_SECRET`.
- Redacted public health/manifest diagnostics and moved full diagnostics behind configured API-key auth.
- Expanded OpenAPI and integration-contract system routes.
- Added presets, cron, and Stripe route coverage to Studio lint/typecheck scopes.
- Fixed root CI dependency installation for nested packages.

## Remaining blockers requiring credentials or external services

- Firebase project/service account credentials.
- Firebase Storage bucket name.
- Production API key/JWT issuer/JWKS/audience details.
- Stripe secret and webhook secret in deployed environment.
- Stripe entitlement persistence and plan mapping.
- AI/media provider credentials for real image/video/audio generation.
- Production observability DSNs/keys.
- Hosting target decision for Studio and worker separation.
- Firebase rules/IAM verification against the target project.

## Security concerns to resolve before public launch

1. Finalize production identity provider policy and JWT claims model.
2. Add rate limiting and/or WAF protection at edge or middleware level.
3. Persist plan entitlements from verified Stripe events.
4. Replace any remaining contract-only approval/rollback semantics with persisted audit-log records if product workflows require formal approvals.
5. Confirm Firebase security rules and Storage IAM policies against the production project.
6. Add structured logging with request IDs and tenant/job correlation.
7. Add staging smoke tests that prove cross-tenant reads and generated file access are blocked.

## Scalability concerns

1. Current Studio materialization path is suitable for proof rendering, not long-running provider-backed media generation.
2. Move heavy AI/video/audio rendering to a worker backed by Cloud Tasks, Pub/Sub, or a managed queue.
3. Add job leases, retries, retry limits, dead-letter queues, and idempotency keys.
4. Store job status transitions in append-only events for auditability.
5. Add pagination/cursors to job and asset listing APIs.
6. Use short-lived signed URLs for private generated asset downloads when moving beyond proxy-served downloads.
7. Add cleanup/retention jobs for abandoned intermediate files.

## Commands to run locally

```bash
npm install
npm --prefix engine install
npm --prefix functions install
npm --prefix life-map-pipeline/functions install
npm --prefix assetfactory-studio install

npm run build
npm test

cd assetfactory-studio
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e
npm run dev

cd ../engine
npm test
npm start

cd ../life-map-pipeline/functions
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

1. Configure production secrets and auth provider values.
2. Implement Stripe entitlement persistence and plan-specific quota mapping.
3. Extract provider-backed rendering into a queue-backed worker service.
4. Add signed asset URL issuance for private bucket access if direct downloads are needed.
5. Add persisted job transition events, retries, DLQ, and cleanup cron.
6. Add real AI/media provider adapters behind the provider interface.
7. Add staging smoke tests for generate -> materialize -> preview/download -> publish plus cross-tenant denial cases.
8. Review or replace stale draft PR #9 with small fresh PRs only where its docs/rules still match the current architecture.
