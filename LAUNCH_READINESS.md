# Asset Factory Launch Readiness

This document is the current launch-readiness source of truth for `LifeLoggerAI/asset-factory`.

It supersedes older historical/lock/final-report documents when those documents imply the system is fully complete, immutable, or already production-live. Older documents may remain useful for context, but public launch decisions should use this checklist plus live staging/production smoke evidence.

Operational execution details live in `docs/OPERATIONS_RUNBOOK.md`, including deploy steps, staging/production smoke commands, monitoring checks, incident response, rollback, and the release evidence template.

## Current release position

Status: **not production-ready yet**.

The repo contains a functional local proof pipeline and partially wired production seams. It is not done until staging and production prove the complete authenticated, tenant-scoped, persisted, monitored flow.

### What is implemented

- Monorepo packages for the deterministic engine, Firebase functions, LifeMap pipeline, and Asset Factory Studio.
- Asset Factory Studio route surface for generation, job lifecycle, assets, generated files, usage, dashboard, system metadata, cron, support workflows, and Stripe webhook entrypoints.
- Tenant-admin support workflow routes for account export requests and safe account-deletion requests.
- Local deterministic proof rendering for `graphic`, `model3d`, `audio`, and `bundle` assets.
- Local multimodal E2E coverage for generate -> materialize -> generated asset fetch -> publish -> approve.
- Optional Firebase Admin / Firestore / Cloud Storage production backend seams.
- Optional API-key, signed HS256 bearer/JWT, tenant, and role guardrails.
- Provider runtime seams for external media providers.
- Stripe webhook dependency, signature-verification path, and entitlement persistence seam.
- Public-safe system contract and diagnostic route separation.
- Durable queue/operator surfaces for worker leases, retries, dead-letter visibility, and controlled requeue.

### What is not proven complete

- Production Firebase project, service account, Firestore rules, indexes, storage bucket, IAM, and signed/private access policy.
- Production auth provider issuing HS256 bearer tokens with the configured issuer, audience, tenant claim, and role claim.
- Real provider-backed generation using production credentials and selected model IDs.
- Deployed durable worker proof with leases, retries, retry limits, idempotency, dead-letter handling, and cleanup/retention.
- Production Stripe webhook proof that verified events persist idempotent tenant quota/plan records.
- Production observability, including request IDs, structured logs, error tracking, metrics, uptime checks, and cost/queue dashboards.
- Staging smoke proof for auth, tenant isolation, diagnostics redaction, cron secret enforcement, Stripe signatures, and storage downloads.
- Live domain/DNS/TLS verification for `www.uraiassetfactory.com`.
- Final legal/privacy/security/support/account deletion/export review.

## Launch gates

Do not call Asset Factory production-ready until every P0 gate below is complete and linked to evidence.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Local proof gate | `npm --prefix assetfactory-studio run check` and `npm --prefix assetfactory-studio run e2e` pass | Pending latest run |
| Staging deploy gate | Staging URL running with `ASSET_FACTORY_FORCE_LOCAL=false` | Pending |
| Firebase gate | Firestore/Storage backend active, rules/indexes/IAM reviewed, no local fallback in staging | Pending |
| Auth gate | Production-like API-key auth plus signed HS256 bearer auth enabled; `ASSET_FACTORY_JWT_HS256_SECRET` configured; tenant and role claims enforced; legacy header auth disabled | Pending |
| Tenant isolation gate | Tenant A cannot read/list/download Tenant B jobs/assets/files | Pending |
| Generation gate | Local-proof staging smoke passes; real provider smoke passes for selected launch asset types | Pending |
| Worker gate | Durable queue/worker path selected and tested for provider-backed jobs | Pending |
| Billing gate | Stripe webhook verifies signatures and persists idempotent tenant entitlements | Pending |
| Diagnostics gate | Public health/manifest are redacted; full diagnostics require API key | Pending |
| Cron gate | Cron endpoints reject missing/wrong `CRON_SECRET` and pass with correct secret | Pending |
| Observability gate | Errors, latency, queue depth, failed jobs, provider costs, and uptime visible | Pending |
| Website gate | `www.uraiassetfactory.com` DNS/TLS/routes/legal/trust/status pages verified | Pending |
| Production smoke gate | Production smoke passes with a test tenant after deploy | Pending |

## Required environment groups

### Core runtime

- `ASSET_FACTORY_FORCE_LOCAL=false` for staging/production.
- `ASSET_FACTORY_REQUIRE_API_KEY=true` for protected mutating routes/full diagnostics.
- `ASSET_FACTORY_API_KEY` set through a secrets manager.
- `ASSET_FACTORY_REQUIRE_AUTH=true` when tenant-facing APIs are exposed.

### Firebase and storage

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- Deployed Firestore rules, Storage rules, and indexes.

### Auth

- `ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true`
- `ASSET_FACTORY_JWT_HS256_SECRET` set through a secrets manager.
- `ASSET_FACTORY_JWT_ISSUER`
- `ASSET_FACTORY_JWT_AUDIENCE`
- `ASSET_FACTORY_TENANT_CLAIM=tenantId`, unless the production issuer uses a different reviewed claim.
- `ASSET_FACTORY_ROLE_CLAIM=roles`, unless the production issuer uses a different reviewed claim.
- `ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH=false` in staging and production.
- Do not require or document `ASSET_FACTORY_JWKS_URI` for production until RS256/JWKS verification is implemented and tested in `assetAuth.ts`.

### Billing

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Stripe product/price IDs mapped to tenant quotas.

### Providers

- Provider API keys and model IDs for the launch asset types only.
- Provider spend limits and timeout/retry policy.

### Operations

- `CRON_SECRET`
- Sentry/PostHog/OpenTelemetry/Cloud Logging configuration or documented chosen equivalents.
- Uptime-check target URLs.

## Smoke commands

Local proof mode:

```bash
npm --prefix assetfactory-studio install
npm --prefix assetfactory-studio run check
npm --prefix assetfactory-studio run e2e
```

Staging smoke, once deployed:

```bash
ASSET_FACTORY_BASE_URL=https://staging.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$STAGING_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$STAGING_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=smoke-tenant-a \
ASSET_FACTORY_OTHER_TENANT_ID=smoke-tenant-b \
CRON_SECRET=$STAGING_CRON_SECRET \
npm run smoke:staging
```

Production smoke, after launch deploy:

```bash
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

## Immediate next implementation order

1. Run and capture the local proof gate.
2. Configure staging secrets and deploy with local fallback disabled.
3. Run staging smoke and fix every failure before adding real providers.
4. Finalize HS256 auth issuer/audience/tenant/role claims and keep legacy-header auth disabled.
5. Run cross-tenant denial smoke tests.
6. Verify Stripe entitlement persistence from signed webhook events.
7. Verify durable worker queue leases, retries, idempotency, and dead-letter recovery in staging.
8. Configure observability and operator dashboards.
9. Verify public website DNS/TLS/legal/trust/status pages.
10. Run production smoke with a test tenant.
11. Only then announce the system as live.
