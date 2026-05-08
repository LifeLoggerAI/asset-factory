# Asset Factory Operations Runbook

This runbook describes how to operate, smoke test, deploy, monitor, and recover Asset Factory in staging and production.

Use this together with `LAUNCH_READINESS.md`. If this runbook and launch readiness disagree, treat `LAUNCH_READINESS.md` as the launch gate source of truth and update this runbook immediately.

## Operating principle

Do not announce Asset Factory as live until the staging and production smoke gates pass with evidence.

The local deterministic proof mode is useful for development and CI. It is not proof that production is ready.

## Runtime surfaces

### Studio/API

Primary package: `assetfactory-studio/`

Important routes:

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

### Worker

If durable provider-backed generation is enabled, worker execution should use the queue/worker path instead of synchronous public-route rendering.

Expected route once worker PR is merged:

- `GET /api/worker/asset-queue`
- `POST /api/worker/asset-queue`

Expected worker actions:

- `claim-and-run`
- `heartbeat`
- `complete`
- `fail`

## Environment groups

### Required in staging and production

- `ASSET_FACTORY_FORCE_LOCAL=false`
- `ASSET_FACTORY_REQUIRE_API_KEY=true`
- `ASSET_FACTORY_API_KEY`
- `ASSET_FACTORY_REQUIRE_AUTH=true`
- `CRON_SECRET`

### Firebase / storage

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- Firestore rules deployed
- Storage rules deployed
- Firestore indexes deployed

### Auth

- `ASSET_FACTORY_JWT_ISSUER`
- `ASSET_FACTORY_JWKS_URI`
- `ASSET_FACTORY_JWT_AUDIENCE`
- Tenant claim name documented
- Role claim/header model documented

### Billing

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Stripe products/prices mapped to plan quota metadata
- Test-mode and live-mode webhook endpoints configured separately

### Worker / queue

- `ASSET_FACTORY_QUEUE_MODE=firestore-queue` or approved equivalent
- `ASSET_FACTORY_WORKER_SECRET`
- `ASSET_FACTORY_QUEUE_LEASE_SECONDS`
- `ASSET_FACTORY_QUEUE_MAX_ATTEMPTS`
- `ASSET_FACTORY_WORKER_URL` if HTTP worker dispatch mode is used

### Provider-backed generation

Configure only the provider keys required for launch asset types.

- OpenAI / image/audio keys and model IDs if selected
- Stability keys and model IDs if selected
- Replicate keys and model IDs if selected
- Fal keys and model IDs if selected
- ElevenLabs keys and model IDs if selected

Every provider must have a spending cap and timeout policy before public launch.

### Observability

Pick and configure the production stack before launch.

Minimum required:

- error tracking
- structured application logs
- uptime checks
- queue depth/dead-letter visibility
- provider latency/failure visibility
- billing/cost visibility

Recommended env groups:

- `SENTRY_DSN` or equivalent
- `POSTHOG_KEY` or equivalent
- OpenTelemetry/Cloud Logging configuration if hosted on Google Cloud

## Local validation

Run this before cutting a release branch:

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

Expected result:

- launch-readiness static checks pass
- Studio lint/typecheck/test/build pass
- local multimodal proof E2E passes
- root tests/build pass

## Staging deployment checklist

1. Confirm staging secrets are present and scoped to staging only.
2. Deploy Firestore rules, Storage rules, and indexes.
3. Deploy Studio/API with local fallback disabled.
4. Confirm `/api/system/health` returns a healthy public response.
5. Confirm `/api/system/manifest?full=true` is rejected without API key.
6. Confirm `/api/system/manifest?full=true` works with API key.
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

8. Capture the smoke output and attach it to the launch issue or release notes.
9. Do not proceed to production if any smoke check fails.

## Production deployment checklist

1. Confirm staging smoke passed after the final release candidate.
2. Confirm production secrets are present and production-scoped.
3. Confirm provider spend caps and quota limits are active.
4. Confirm Stripe live webhook endpoint and secret are configured.
5. Confirm public docs do not claim unsupported capabilities.
6. Deploy production.
7. Verify DNS/TLS for `www.uraiassetfactory.com`.
8. Run production read-only smoke first.

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com \
npm run smoke:website
```

9. Run production authenticated smoke with a test tenant.

```bash
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

10. Check observability dashboards for errors, queue backlog, and unexpected provider spend.
11. Record production smoke evidence.

## Smoke test pass criteria

A staging or production smoke run is only green if all of these pass:

- public health responds
- public manifest responds without secrets
- full diagnostics require API key
- integration contract route responds
- OpenAPI route responds
- generated asset flow completes for launch-supported asset types
- tenant A cannot read tenant B resources
- cron endpoint rejects missing/wrong secret
- Stripe webhook rejects unsigned payloads
- no public response leaks private key, service account, JWKS URI, Stripe secret, or API key hints

## Incident response

### Public diagnostics leak

1. Disable public traffic or roll back immediately.
2. Rotate any exposed secret.
3. Verify `/api/system/health` and `/api/system/manifest` public responses are redacted.
4. Run read-only smoke.
5. Document the incident and mitigation.

### Cross-tenant access failure

1. Treat as launch-blocking security incident.
2. Disable affected routes or require global API key while investigating.
3. Identify affected tenant IDs and object IDs.
4. Patch auth/tenant guard logic.
5. Add or update smoke coverage.
6. Re-run cross-tenant denial checks before re-enabling.

### Provider runaway cost

1. Disable provider-backed generation by switching to proof mode or disabling queue workers.
2. Revoke or cap provider keys if needed.
3. Inspect usage ledger and provider run metadata.
4. Confirm quota enforcement and billing entitlement state.
5. Re-enable only after spend cap and smoke pass.

### Queue backlog

1. Check queue depth and dead-letter count.
2. Confirm workers can authenticate with `ASSET_FACTORY_WORKER_SECRET`.
3. Confirm leases are being heartbeated and completed.
4. Requeue retryable jobs only after identifying root cause.
5. Leave permanent failures dead-lettered with actionable reasons.

### Stripe webhook failure

1. Confirm `STRIPE_WEBHOOK_SECRET` matches the active Stripe endpoint.
2. Confirm webhook route path is `/api/stripe/webhooks`.
3. Confirm unsigned payloads are rejected.
4. Confirm valid signed events persist tenant entitlements.
5. Replay failed Stripe events from the Stripe dashboard only after idempotency is verified.

### Firestore/Storage failure

1. Check Firebase Admin configuration.
2. Verify service account permissions.
3. Verify bucket exists and Storage rules/IAM match expected access policy.
4. Verify Firestore indexes.
5. Do not silently fall back to local JSON in staging or production.

## Rollback procedure

1. Roll back the app deployment to the last smoke-green release.
2. Disable queue workers if jobs are failing or duplicating.
3. Keep Firestore/Storage data intact unless a migration is confirmed bad.
4. Run read-only smoke.
5. Run authenticated smoke using the test tenant.
6. Update the launch issue with rollback cause and follow-up tasks.

## Release evidence template

Paste this into the release issue or launch checklist.

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

## Open operational gaps

These must be closed before a confident public launch:

- Live staging secrets and deploy evidence.
- Live production secrets and deploy evidence.
- Provider-backed generation smoke with real launch provider credentials.
- Operator UI for failed/dead-lettered jobs.
- Account deletion/export/support workflows.
- Final legal/privacy/security review.
