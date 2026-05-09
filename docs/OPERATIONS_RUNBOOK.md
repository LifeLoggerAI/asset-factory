# Asset Factory Operations Runbook

Use this runbook with `LAUNCH_READINESS.md`. The readiness file is the source of truth for go/no-go launch gates; this file explains how operators should run deploy, smoke, evidence, and rollback steps.

## Operating rule

Asset Factory is not live until staging and production smoke tests pass and the evidence is attached to the release issue.

Local proof mode is useful for development. It is not proof of production readiness.

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
npm run test:launch-readiness
npm --prefix assetfactory-studio run check
npm --prefix assetfactory-studio run e2e
npm test
npm run build
```

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
7. Verify DNS/TLS for `www.uraiassetfactory.com`.
8. Run read-only smoke.

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com \
npm run smoke:website
```

9. Run authenticated production smoke.

```bash
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

10. Check logs, queue backlog, dead letters, provider failures, and spend.
11. Attach production smoke evidence to the release issue.

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

1. Check queue depth and dead-letter count.
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
- [ ] npm run test:launch-readiness
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

### Production gates
- [ ] DNS/TLS verified
- [ ] Read-only smoke passed
- [ ] Authenticated production smoke passed
- [ ] Observability checked
- [ ] Provider spend caps confirmed
- [ ] Rollback target identified

Evidence links/logs:
Known issues:
Go/no-go decision:
```

## Remaining operational gaps

- Live staging secrets and deploy evidence.
- Live production secrets and deploy evidence.
- Real provider-backed generation smoke.
- Operator UI for failed and dead-lettered jobs.
- Account deletion/export/support workflows.
- Final legal/privacy/security review.
