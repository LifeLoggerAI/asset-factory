# Asset Factory Operations Runbook

Use this runbook with `LAUNCH_READINESS.md`. The readiness file is the source of truth for go/no-go launch gates; this file explains how operators should run deploy, smoke, evidence, and rollback steps.

## Operating rule

Asset Factory is not live until staging and production smoke tests pass and the evidence is attached to the release issue.

Local proof mode is useful for development. It is not proof of production readiness.

## Current verified production status

As of the latest release evidence, the Firebase default production API is verified at:

```text
https://urai-4dc1d.web.app
```

Evidence files:

- `docs/release-evidence/2026-05-16-firebase-deploy.md`
- `docs/release-evidence/2026-05-16-production-api-smoke.md`
- `docs/release-evidence/2026-05-16-final-local-gates.md`

Known custom-domain blocker:

- `docs/release-evidence/2026-05-16-custom-domain-blocker.md`

Do not use `https://uraiassetfactory.com` or `https://www.uraiassetfactory.com` as API smoke bases until the custom-domain blocker is closed. If `/api/health` on the custom domain returns a Next.js 404, the domain is still routed to a separate frontend target and is not using this repo's Firebase Hosting API rewrites.

## Runtime surfaces

Primary package: `assetfactory-studio/`.

Core routes:

- `GET /api/system/health`
- `GET /api/system/manifest`
- `GET /api/system/manifest?full=true`
- `GET /api/system/integration-contract`
- `GET /api/system/openapi`
- `POST /api/generate`
- `POST /api/jobs/:jobId/queue`
- `POST /api/jobs/:jobId/materialize`
- `POST /api/jobs/:jobId/publish`
- `POST /api/jobs/:jobId/approve`
- `GET /api/jobs/:jobId`
- `GET /api/assets/:jobId`
- `GET /api/generated-assets/:file`
- `POST /api/stripe/webhooks`
- `GET|POST /api/cron/integrity-check`
- `GET|POST /api/worker/asset-queue`
- `GET /api/admin/queue`
- `POST /api/admin/queue/requeue`

## Required environment groups

Core runtime:

- `ASSET_FACTORY_FORCE_LOCAL=false`
- `ASSET_FACTORY_REQUIRE_API_KEY=true`
- `ASSET_FACTORY_API_KEY`
- `ASSET_FACTORY_REQUIRE_AUTH=true`
- `CRON_SECRET`

Firebase and storage:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- deployed Firestore rules
- deployed Storage rules
- deployed Firestore indexes

Auth:

- `ASSET_FACTORY_JWT_ISSUER`
- `ASSET_FACTORY_JWKS_URI`
- `ASSET_FACTORY_JWT_AUDIENCE`
- documented tenant claim
- documented role claim/header model

Billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Stripe product/price metadata mapped to Asset Factory quotas

Worker and queue:

- `ASSET_FACTORY_QUEUE_MODE=firestore-queue`
- `ASSET_FACTORY_WORKER_SECRET`
- `ASSET_FACTORY_QUEUE_LEASE_SECONDS`
- `ASSET_FACTORY_QUEUE_MAX_ATTEMPTS`
- `ASSET_FACTORY_WORKER_URL` if HTTP task mode is used

Observability:

- error tracking
- structured logs
- uptime checks
- queue depth and dead-letter visibility
- provider cost and failure visibility

## Local release validation

```bash
npm install
npm --prefix engine install
npm --prefix functions install
npm --prefix life-map-pipeline/functions install
npm --prefix assetfactory-studio install
npm run doctor
npm run verify:local
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
npm --prefix assetfactory-studio run check
npm --prefix assetfactory-studio run e2e
npm test
npm run build
```

## Operator queue visibility

Use the admin queue endpoint to inspect failed, dead-lettered, retrying, queued, claimed, and stale-lease queue items.

Tenant-scoped view:

```bash
curl -H "x-tenant-id: $TENANT_ID" \
  -H "x-asset-role: admin" \
  -H "x-asset-factory-key: $ASSET_FACTORY_API_KEY" \
  "$ASSET_FACTORY_BASE_URL/api/admin/queue?status=dead-lettered&limit=50"
```

All-tenant operator view:

```bash
curl -H "x-asset-role: admin" \
  -H "x-asset-factory-key: $ASSET_FACTORY_API_KEY" \
  "$ASSET_FACTORY_BASE_URL/api/admin/queue?allTenants=true&limit=100"
```

Dashboard metrics also include:

- `dlqSize`
- `queueFailures`
- `staleClaimedQueueItems`
- `queueByStatus`

Dead-letter policy:

1. Inspect the dead-lettered item and failure reason.
2. Confirm whether the provider/auth/storage issue is fixed.
3. Requeue only if the failure is understood and retryable.
4. Leave permanent failures dead-lettered with actionable failure reasons.

Controlled requeue:

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "x-tenant-id: $TENANT_ID" \
  -H "x-asset-role: admin" \
  -H "x-asset-factory-key: $ASSET_FACTORY_API_KEY" \
  -d '{"jobId":"JOB_ID","reason":"provider outage fixed","resetAttempts":false}' \
  "$ASSET_FACTORY_BASE_URL/api/admin/queue/requeue"
```

All-tenant operator requeue:

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "x-asset-role: admin" \
  -H "x-asset-factory-key: $ASSET_FACTORY_API_KEY" \
  -d '{"jobId":"JOB_ID","reason":"manual verified retry","allTenants":true,"resetAttempts":true}' \
  "$ASSET_FACTORY_BASE_URL/api/admin/queue/requeue"
```

Requeue is only for `failed`, `dead-lettered`, or `retrying` items. Every accepted or rejected requeue attempt records a usage audit event.

## Staging checklist

1. Confirm staging secrets are present and staging-scoped.
2. Deploy Firestore rules, Storage rules, and indexes.
3. Deploy Studio/API with local fallback disabled.
4. Confirm public health and manifest routes respond.
5. Confirm full diagnostics are rejected without API key.
6. Confirm full diagnostics work with API key.
7. Run staging smoke.

```bash
ASSET_FACTORY_BASE_URL=https://staging.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$STAGING_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$STAGING_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=smoke-tenant-a \
ASSET_FACTORY_OTHER_TENANT_ID=smoke-tenant-b \
CRON_SECRET=$STAGING_CRON_SECRET \
npm run smoke:staging
```

8. Attach smoke output to the release issue.
9. Do not continue to production if staging smoke fails.

## Production checklist

1. Confirm staging passed on the final release candidate.
2. Confirm production secrets are production-scoped.
3. Confirm provider spend caps are active.
4. Confirm Stripe live webhook endpoint and secret are active.
5. Confirm public docs do not claim unsupported capabilities.
6. Deploy production.
7. Run read-only smoke against the currently verified Firebase production API base.

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
npm run smoke:website
```

8. Run authenticated production smoke against the currently verified Firebase production API base.

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

9. Verify DNS/TLS and API routing for `uraiassetfactory.com` and `www.uraiassetfactory.com` before declaring the custom domain ready.

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
npm run smoke:website
```

```bash
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

10. Check logs, queue backlog, dead letters, provider failures, and spend.
11. Attach production smoke evidence to the release issue.

## Custom-domain API blocker closure

The custom-domain blocker is closed only when all of these are true:

- `uraiassetfactory.com` is attached to Firebase Hosting site `urai-4dc1d`, or the current frontend host proxies `/api/*` to `https://urai-4dc1d.web.app/api/*`.
- `www.uraiassetfactory.com` either redirects to the canonical apex domain or serves the same Firebase-backed API surface.
- `https://uraiassetfactory.com/api/health` returns the expected Asset Factory health response, not a Next.js 404 page.
- read-only smoke passes with `ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com`.
- authenticated smoke passes with `ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com`.
- new custom-domain evidence is committed under `docs/release-evidence/`.

Do not update the completion lock to `LOCKED` until this blocker and the remaining `LAUNCH_READINESS.md` P0 gates are closed with evidence.

## Smoke pass criteria

A smoke run is only green if:

- public health responds
- public manifest responds
- full diagnostics require API key
- integration contract responds
- OpenAPI responds
- launch asset flow completes
- tenant isolation denial passes
- cron secret checks pass
- unsigned Stripe webhook rejection passes
- public responses do not expose sensitive config hints

## Incident checklist

Diagnostics exposure:

1. Roll back or restrict traffic.
2. Rotate exposed secrets if needed.
3. Re-run read-only smoke.
4. Record the incident and fix.

Cross-tenant access failure:

1. Treat as launch blocking.
2. Restrict affected routes.
3. Patch auth/tenant guards.
4. Add smoke coverage.
5. Re-run tenant isolation tests.

Provider cost spike:

1. Disable provider-backed generation or workers.
2. Check provider usage and Asset Factory usage ledger.
3. Confirm quota and entitlement enforcement.
4. Re-enable only after smoke and spend caps pass.

Queue backlog:

1. Check queue depth and dead-letter count using `/api/admin/queue`.
2. Confirm worker auth and leases.
3. Requeue retryable jobs only after root cause is known.
4. Leave permanent failures dead-lettered with reasons.

Stripe webhook failure:

1. Confirm webhook path is `/api/stripe/webhooks`.
2. Confirm webhook secret matches the active Stripe endpoint.
3. Confirm unsigned payloads are rejected.
4. Confirm valid events persist tenant entitlements.

## Rollback procedure

1. Roll back app deployment to the last smoke-green release.
2. Pause workers if jobs are failing or duplicating.
3. Keep Firestore/Storage data unless a migration is confirmed bad.
4. Run read-only smoke.
5. Run authenticated smoke with the test tenant.
6. Record rollback cause and follow-up tasks.

## Release evidence template

```markdown
## Asset Factory release evidence

Release candidate:
Commit SHA:
Deployment target:
Deployed by:
Date/time UTC:

### Local gates
- [ ] npm run doctor
- [ ] npm run verify:local
- [ ] npm run test:launch-readiness
- [ ] npm run test:completion-lock
- [ ] npm run check:deploy-workflow
- [ ] npm --prefix assetfactory-studio run check
- [ ] npm --prefix assetfactory-studio run e2e
- [ ] npm test
- [ ] npm run build

### Staging gates
- [ ] Firestore rules deployed
- [ ] Storage rules deployed
- [ ] Firestore indexes deployed
- [ ] ASSET_FACTORY_FORCE_LOCAL=false confirmed
- [ ] Staging smoke passed
- [ ] Cross-tenant denial passed
- [ ] Stripe unsigned webhook rejection passed
- [ ] Cron secret check passed
- [ ] Admin queue visibility checked

### Production gates
- [ ] Firebase default API read-only smoke passed
- [ ] Firebase default API authenticated smoke passed
- [ ] Custom domain DNS/TLS verified
- [ ] Custom domain read-only smoke passed
- [ ] Custom domain authenticated smoke passed
- [ ] Admin queue visibility checked
- [ ] Observability checked
- [ ] Provider spend caps confirmed
- [ ] Rollback target identified

Evidence links/logs:
Known issues:
Go/no-go decision:
```

## Remaining operational gaps

- Live staging secrets and deploy evidence.
- Custom-domain API routing evidence for `uraiassetfactory.com` and `www.uraiassetfactory.com`.
- Real provider-backed generation smoke.
- Operator UI for failed and dead-lettered jobs.
- Account deletion/export/support workflows.
- Final legal/privacy/security review.
