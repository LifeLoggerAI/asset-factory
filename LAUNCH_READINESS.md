# Asset Factory Launch Readiness

This document is the current launch-readiness source of truth for `LifeLoggerAI/asset-factory`.

It supersedes older historical/lock/final-report documents when those documents imply the system is complete, immutable, or already production-live. It also supersedes any older operator documentation that still describes `FIREBASE_TOKEN`, service-account JSON, or a combined deploy-and-smoke workflow as current production authority. Those instructions are stale and must not be used. Older documents may remain useful for historical context, but public launch decisions must use this checklist plus live staging/production evidence.

Operational execution details live in `docs/OPERATIONS_RUNBOOK.md`, but when that runbook conflicts with the current GitHub workflows or this file, the current workflows and this file win. Canonical live tracker: GitHub issue #63.

## Current release position

Status: **repo-side hardening complete for current pass; live evidence required before production lock**.

The repo contains a functional local proof pipeline and a protected production deployment workflow using GitHub OIDC + Google Workload Identity Federation. The separate deployed-target workflow is smoke-only and cannot deploy. Asset Factory is still not locked until staging and production prove the complete authenticated, tenant-scoped, persisted, monitored flow with local fallback disabled.

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
- `Verify Deployed Asset Factory` GitHub Actions workflow for read-only and authenticated read-only smoke against an existing staging or production deployment.
- `Asset Factory Production Readiness` GitHub Actions workflow for source verification and an explicitly confirmed production deployment from `main` using GitHub OIDC + Google Workload Identity Federation.
- `/api/system/health` primary health route with `/api/health` compatibility for smoke/tools.
- Release evidence validator for final lock evidence.

### What is not proven complete

- Live staging deployment authority and fresh staging workflow evidence with `ASSET_FACTORY_FORCE_LOCAL=false`.
- Live production deployment/read-back evidence on the exact release candidate.
- Protected Google Cloud WIF/IAM configuration and least-privilege role evidence for the production deploy service account.
- Historical long-lived Firebase/service-account credential revocation evidence where such credentials previously existed.
- Production Firebase project, Firestore rules, indexes, storage bucket, IAM, and signed/private access policy.
- Production auth provider issuing HS256 bearer tokens with the configured issuer, audience, tenant claim, and role claim.
- Real provider-backed generation using production credentials and selected model IDs.
- Deployed durable worker proof with leases, retries, retry limits, idempotency, dead-letter handling, and cleanup/retention.
- Production Stripe webhook proof that verified events persist idempotent tenant quota/plan records.
- Production observability, including request IDs, structured logs, error tracking, metrics, uptime checks, and cost/queue dashboards.
- Staging smoke proof for auth, tenant isolation, diagnostics redaction, cron secret enforcement, Stripe signatures, and storage downloads.
- Live domain/DNS/TLS verification and hosting-authority reconciliation for `uraiassetfactory.com` and `www.uraiassetfactory.com`.
- Final legal/privacy/security/support/account deletion/export review.

## Launch gates

Do not call Asset Factory production-ready until every P0 gate below is complete and linked to evidence.

| Gate | Required evidence | Status |
| --- | --- | --- |
| Local proof gate | `npm --prefix assetfactory-studio run check` and `npm --prefix assetfactory-studio run e2e` pass, plus root gates. | Pending fresh workflow evidence |
| Staging deploy gate | A governed staging deployment with `ASSET_FACTORY_FORCE_LOCAL=false`; the smoke-only workflow does not create it. | Pending deployment authority + live evidence |
| Firebase gate | Firestore/Storage backend active, rules/indexes/IAM reviewed, no local fallback in staging. | Pending live workflow evidence |
| WIF/IAM gate | Protected production environment has `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`; OIDC trust and least-privilege IAM are proven by protected authentication/read-back. | Pending provider evidence |
| Legacy credential gate | Production deploy does not use `FIREBASE_TOKEN`, service-account JSON, or tracked private keys; any historical long-lived deploy keys are independently confirmed revoked where applicable. | Pending provider/revocation evidence |
| Auth gate | Production-like API-key auth plus signed HS256 bearer auth enabled; `ASSET_FACTORY_JWT_HS256_SECRET` configured; tenant and role claims enforced; legacy header auth disabled. | Pending live workflow evidence |
| Tenant isolation gate | Tenant A cannot read/list/download Tenant B jobs/assets/files. | Pending live workflow evidence |
| Generation gate | Local-proof staging smoke passes; real provider smoke passes for selected launch asset types. | Pending live provider evidence |
| Worker gate | Durable queue/worker path selected and tested for provider-backed jobs. | Pending live worker/DLQ evidence |
| Billing gate | Stripe webhook verifies signatures and persists idempotent tenant entitlements. | Pending live Stripe evidence |
| Diagnostics gate | Public health/manifest are redacted; full diagnostics require API key. | Pending live workflow evidence |
| Cron gate | Cron endpoints reject missing/wrong `CRON_SECRET` and pass with correct secret. | Pending live workflow evidence |
| Observability gate | Errors, latency, queue depth, failed jobs, provider costs, and uptime visible. | Pending monitoring links |
| Website gate | Custom-domain DNS/TLS/hosting authority/routes/legal/trust/status pages verified. | Pending domain/legal evidence |
| Production smoke gate | Production smoke passes with a test tenant after an exact-revision protected deploy. | Pending live workflow evidence |
| Recovery/rollback gate | Recovery procedure and rollback to a distinct known-good revision are retained with read-back evidence. | Pending live evidence |

## Required environment groups

### Deployment identity

Production GitHub deployment uses short-lived OIDC/WIF credentials only:

- GitHub environment: `asset-factory-production`
- GitHub variable: `GCP_WIF_PROVIDER`
- GitHub variable: `GCP_DEPLOY_SERVICE_ACCOUNT`
- GitHub Actions permission: `id-token: write`
- Google auth action: `google-github-actions/auth@v2`

Do **not** provision or use `FIREBASE_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `credentials_json`, or a tracked/private service-account JSON file for production deployment.

### Core runtime

- `ASSET_FACTORY_FORCE_LOCAL=false` for staging/production.
- `ASSET_FACTORY_REQUIRE_API_KEY=true` for protected mutating routes/full diagnostics.
- `ASSET_FACTORY_API_KEY` set through protected secret storage.
- `ASSET_FACTORY_REQUIRE_AUTH=true` when tenant-facing APIs are exposed.

### Firebase and storage

- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- Deployed Firestore rules, Storage rules, and indexes.
- Google-managed production runtimes should use Application Default Credentials / attached runtime identity rather than embedded service-account private keys.

### Auth

- `ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true`
- `ASSET_FACTORY_JWT_HS256_SECRET` set through protected secret storage.
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

## Canonical GitHub Actions paths

### Verify an existing deployment

Use:

```text
Actions -> Verify Deployed Asset Factory -> Run workflow
```

Inputs:

```text
environment = staging | production
smoke_mode = readonly | authenticated | both
```

This workflow is deliberately smoke-only. It sets `ASSET_FACTORY_SMOKE_READONLY=true`, contains no Firebase deployment authority, and must never be described as a deployment workflow.

Authenticated smoke requires these protected secrets:

```text
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

### Protected production deployment

Use:

```text
Actions -> Asset Factory Production Readiness -> Run workflow
```

The deploy job is permitted only when all of these are true:

```text
branch/ref = main
input deploy = true
input confirm = DEPLOY_ASSET_FACTORY
environment = asset-factory-production
GCP_WIF_PROVIDER is non-empty
GCP_DEPLOY_SERVICE_ACCOUNT is non-empty
```

The workflow authenticates with GitHub OIDC + Google WIF, deploys using the generated ephemeral ADC credentials, removes the generated credentials file after deployment, and then performs read-only production finalization smoke. A workflow run alone is not final production certification: retain exact deployed revision, protected provider authentication/read-back, monitoring, recovery, and distinct-revision rollback evidence.

There is currently no repo-owned staging deploy job in these two workflows. Do not reinterpret the smoke-only staging target as deployment authority. A governed staging deployment path must be established or independently proven before the staging-deploy gate can close.

## Manual smoke commands

Use these only when debugging a workflow run.

Local proof mode:

```bash
npm --prefix assetfactory-studio install
npm --prefix assetfactory-studio run check
npm --prefix assetfactory-studio run e2e
```

Staging smoke, once a governed staging deployment exists:

```bash
ASSET_FACTORY_BASE_URL=https://staging.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$STAGING_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$STAGING_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=smoke-tenant-a \
ASSET_FACTORY_OTHER_TENANT_ID=smoke-tenant-b \
CRON_SECRET=$STAGING_CRON_SECRET \
npm run smoke:staging
```

Production smoke, after protected deployment:

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

Do not switch production smoke to the custom domain until registrar/DNS/Firebase Hosting authority is reconciled and the domain serves this repository's intended runtime.

## Immediate next implementation order

1. Reconcile the actual registrar/DNS/Firebase Hosting attachment for the Asset Factory domains without blind DNS/Hosting mutation.
2. Establish or independently prove a governed staging deployment path; then run `Verify Deployed Asset Factory` against that exact staging revision.
3. Verify protected production WIF provider/service-account configuration and least-privilege IAM.
4. Confirm historical long-lived Firebase/service-account deployment keys are revoked where applicable.
5. Run `Asset Factory Production Readiness` on the exact approved `main` revision only after source/review/provider gates permit deployment.
6. Retain the exact deployed revision and run protected production read-back plus `Verify Deployed Asset Factory` smoke.
7. Verify provider-backed generation, worker queue/DLQ, Stripe entitlements, diagnostics redaction, cron enforcement, and cross-tenant denial.
8. Configure observability and operator dashboards.
9. Verify custom-domain DNS/TLS/hosting authority and legal/trust/status pages.
10. Record recovery evidence and rollback to a genuinely distinct known-good revision.
11. Only then update `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` to LOCKED and announce the system as live.
