# Asset Factory Launch Readiness

This document is the current launch-readiness source of truth for `LifeLoggerAI/asset-factory`.

It supersedes older historical/lock/final-report documents when those documents imply the system is fully complete, immutable, or already production-live. Older documents may remain useful for context, but public launch decisions should use this checklist plus live staging/production smoke evidence.

Operational execution details live in `docs/OPERATIONS_RUNBOOK.md`, including deploy steps, staging/production smoke commands, monitoring checks, incident response, rollback, and the release evidence template.

## Current release position

Status: **not production-ready yet**.

The repo contains a functional local proof pipeline and partially wired production seams. It is not done until staging and production prove the complete authenticated, tenant-scoped, persisted, monitored flow.

### What is implemented

- Monorepo packages for the deterministic engine, Firebase functions, LifeMap pipeline, and Asset Factory Studio.
- Asset Factory Studio route surface for generation, job lifecycle, assets, generated files, usage, dashboard, system metadata, cron, and Stripe webhook entrypoints.
- Local deterministic proof rendering for `graphic`, `model3d`, `audio`, and `bundle` assets.
- Local multimodal E2E coverage for generate -> materialize -> generated asset fetch -> publish -> approve.
- Optional Firebase Admin / Firestore / Cloud Storage production backend seams.
- Optional API-key, bearer/JWT, tenant, and role guardrails.
- Provider runtime seams for external media providers.
- Stripe webhook dependency and signature-verification path.
- Public-safe system contract and diagnostic route separation.

### What is not proven complete

- Production Firebase project, service account, Firestore rules, indexes, storage bucket, IAM, and signed/private access policy.
- Production auth provider, JWT issuer/JWKS/audience, tenant claim model, and role mapping.
- Real provider-backed generation using production credentials and selected model IDs.
- Durable worker queue with leases, retries, retry limits, idempotency, dead-letter handling, and cleanup/retention.
- Stripe entitlement persistence from verified webhook events into tenant quota/plan records.
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
| Auth gate | Production-like JWT/API-key auth enabled, tenant claims enforced, role matrix tested | Pending |
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

- `ASSET_FACTORY_JWT_ISSUER`
- `ASSET_FACTORY_JWKS_URI`
- `ASSET_FACTORY_JWT_AUDIENCE`
- Tenant claim and role claim names documented and tested.

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
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

## Immediate next implementation order

1. Run and capture the local proof gate.
2. Configure staging secrets and deploy with local fallback disabled.
3. Run staging smoke and fix every failure before adding real providers.
4. Finalize auth tenant/role claims and add cross-tenant denial smoke tests.
5. Persist Stripe entitlements from verified webhook events.
6. Move provider-backed generation to a durable worker queue.
7. Configure observability and operator dashboards.
8. Verify public website DNS/TLS/legal/trust/status pages.
9. Run production smoke with a test tenant.
10. Only then announce the system as live.
