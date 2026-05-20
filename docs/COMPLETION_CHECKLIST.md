# Asset Factory Completion Checklist

Date: 2026-05-20
Status: NOT COMPLETE / NOT LOCKED / LIVE EVIDENCE REQUIRED

## Done-means-done checklist

| Area | Status | Evidence / action required |
| --- | --- | --- |
| Repo source of truth identified | Verified | `LAUNCH_READINESS.md`, `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md`, `docs/contracts/ASSET_FACTORY_API.md`, `docs/OPERATIONS_RUNBOOK.md`, and issue #63 are the current evidence spine. |
| Current commit identified | Verified | Use the release evidence file for the exact inspected `HEAD` SHA; do not hardcode a mutable branch SHA here. |
| Repo-side hardening | Complete for current pass | README, launch readiness, completion lock, privacy/safety, operations runbook, deploy workflow, smoke compatibility, and evidence validator have been synced. |
| Firebase default API slice | Verified by repo evidence | Current docs record `https://urai-4dc1d.web.app` as verified. Fresh workflow evidence is still required before final lock. |
| Custom-domain API routing | Blocked / needs fresh proof | Must prove apex and `www` routes return Asset Factory API responses and pass read-only + authenticated smoke. |
| API contract version | Verified from docs/scripts | Contract and checks use `asset-factory-api-v1`. |
| Required bridge routes documented | Verified | `/api/health`, `/api/assets`, `/api/assets/{assetId}`, `/api/lifemap/events`. |
| Studio route surface documented | Verified | Operations runbook lists Studio/system/admin/worker/cron/Stripe routes. |
| Local deterministic proof pipeline | Verified by repo docs | Supports `graphic`, `model3d`, `audio`, and `bundle`; requires fresh workflow/local command evidence before release. |
| Local commands pass | Needs fresh evidence | Must run and record local gate commands on fresh checkout or via the Deploy Asset Factory workflow. |
| Staging deploy with fallback disabled | Blocked | Must deploy with `ASSET_FACTORY_FORCE_LOCAL=false` and run staging smoke. |
| Production smoke | Partially verified by repo evidence | Firebase default smoke evidence exists in docs; custom-domain and full product smoke remain gated. |
| Auth/JWT/API-key enforcement | Needs live proof | Must prove issuer/audience/tenant/role enforcement. |
| Tenant isolation | Needs live proof | Must prove Tenant A cannot read/list/download Tenant B data. |
| Provider-backed generation | Needs live proof | Must prove real provider generation for launch asset types. |
| Durable worker queue | Needs live proof | Must prove leases, retries, idempotency, DLQ, cleanup/retention. |
| Stripe billing/entitlements | Needs live proof | Must prove signed webhook verification and idempotent entitlement persistence. |
| Diagnostics redaction | Needs live proof | Public health/manifest must be redacted; full diagnostics must require API key. |
| Cron enforcement | Needs live proof | Missing/wrong `CRON_SECRET` must fail; correct secret must pass. |
| Observability | Needs live proof | Must link logs, errors, latency, queue depth, DLQ, uptime, provider costs. |
| Legal/privacy/security/support | Blocked | Final review, account deletion/export, trust/status/legal pages must be complete. |
| Rollback | Needs live proof | Last-known-good SHA and rollback command must be recorded. |
| UrAi Core dependency lock | Blocked | Core may consume only behind feature flag until all contract/smoke/rollback evidence passes. |
| Completion lock | Blocked | Do not change to LOCKED until all P0 gates pass. |

## Preferred release-closure sequence

Use this order. Do not skip gates or mark a gate complete without attached evidence.

1. Run the GitHub Actions workflow: `Deploy Asset Factory` with `staging / deploy=false / smoke_mode=readonly`.
2. Fix every failing named workflow step before proceeding.
3. Run `staging / deploy=true / smoke_mode=both` with secrets configured.
4. Run `production / deploy=false / smoke_mode=readonly`.
5. Run `production / deploy=true / smoke_mode=both` with secrets configured.
6. Attach successful workflow artifacts/logs to issue #63.
7. Fix custom-domain `/api/*` routing so apex and `www` resolve to the Firebase-backed API surface.
8. Run custom-domain read-only and authenticated production smoke.
9. Attach monitoring links for health, latency, queue depth, DLQ, provider failures, Stripe failures, storage errors, and spend/cost caps.
10. Attach legal/privacy/security/support/account export/deletion signoff.
11. Record rollback SHA, rollback command, deploy command, deploy target, and owner approval.
12. Only then update completion-lock status to LOCKED and Core dependency status to locked/approved.

## GitHub Actions verification path

Use:

```text
Actions -> Deploy Asset Factory -> Run workflow
```

Sequence:

```text
staging / deploy=false / smoke_mode=readonly
staging / deploy=true / smoke_mode=both
production / deploy=false / smoke_mode=readonly
production / deploy=true / smoke_mode=both
```

Required GitHub environment/repository secrets:

```text
FIREBASE_TOKEN
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
CRON_SECRET
```

## Exact local verification commands

Use Node 22 for parity with the Studio/deploy workflow and Java 21 for current Firebase tooling.

```bash
unset NPM_CONFIG_PREFIX
nvm install 22
nvm use 22
node --version
java -version
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

## Exact staging verification command

Use this manually only when debugging the GitHub Actions workflow.

```bash
ASSET_FACTORY_BASE_URL=https://staging.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$STAGING_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$STAGING_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=smoke-tenant-a \
ASSET_FACTORY_OTHER_TENANT_ID=smoke-tenant-b \
CRON_SECRET=$STAGING_CRON_SECRET \
npm run smoke:staging
```

## Exact production Firebase default verification commands

Use these manually only when debugging the GitHub Actions workflow.

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
npm run smoke:website
```

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

## Exact custom-domain verification commands

Use these only after DNS/Firebase Hosting attachment or `/api/*` proxying is fixed.

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

## Final evidence validation

Validate final evidence before changing the completion lock:

```bash
node scripts/check-release-evidence.mjs docs/release-evidence/<file>.md
```

## Final decision rule

Asset Factory may be marked COMPLETE / LOCKED only when every P0 gate in `LAUNCH_READINESS.md` and `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` is changed from pending to passed with committed evidence, CI links, smoke logs, rollback SHA, monitoring links, and reviewer approval.