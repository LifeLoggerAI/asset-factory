# Asset Factory Completion Checklist

Date: 2026-05-17
Status: NOT COMPLETE / NOT LOCKED

## Done-means-done checklist

| Area | Status | Evidence / action required |
| --- | --- | --- |
| Repo source of truth identified | Verified | `LAUNCH_READINESS.md`, `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md`, `docs/contracts/ASSET_FACTORY_API.md`, and `docs/OPERATIONS_RUNBOOK.md` are the current evidence spine. |
| Current commit identified | Verified | `main` at `c880b65d446fdf0a5fae846feda6b35b34e6a6ca`. |
| Firebase default API slice | Verified by repo evidence | Current docs record `https://urai-4dc1d.web.app` as verified. Live network check was not possible from this audit sandbox. |
| Custom-domain API routing | Blocked / needs fresh proof | Must prove apex and `www` routes return Asset Factory API responses and pass read-only + authenticated smoke. |
| API contract version | Verified from docs/scripts | Contract and checks use `asset-factory-api-v1`. |
| Required bridge routes documented | Verified | `/api/health`, `/api/assets`, `/api/assets/{assetId}`, `/api/lifemap/events`. |
| Studio route surface documented | Verified | Operations runbook lists Studio/system/admin/worker/cron/Stripe routes. |
| Local deterministic proof pipeline | Verified by repo docs | Supports `graphic`, `model3d`, `audio`, and `bundle`; requires fresh local command evidence before release. |
| Local commands pass | Unknown | Must run and record local gate commands on fresh checkout. |
| Staging deploy with fallback disabled | Blocked | Must deploy with `ASSET_FACTORY_FORCE_LOCAL=false` and run staging smoke. |
| Production smoke | Partially verified by repo evidence | Firebase default smoke evidence exists in docs; custom-domain and full product smoke remain gated. |
| Auth/JWT/API-key enforcement | Needs fix/proof | Must prove issuer/JWKS/audience/tenant/role enforcement. |
| Tenant isolation | Needs fix/proof | Must prove Tenant A cannot read/list/download Tenant B data. |
| Provider-backed generation | Needs fix/proof | Must prove real provider generation for launch asset types. |
| Durable worker queue | Needs fix/proof | Must prove leases, retries, idempotency, DLQ, cleanup/retention. |
| Stripe billing/entitlements | Needs fix/proof | Must prove signed webhook verification and idempotent entitlement persistence. |
| Diagnostics redaction | Needs fix/proof | Public health/manifest must be redacted; full diagnostics must require API key. |
| Cron enforcement | Needs fix/proof | Missing/wrong `CRON_SECRET` must fail; correct secret must pass. |
| Observability | Needs fix/proof | Must link logs, errors, latency, queue depth, DLQ, uptime, provider costs. |
| Legal/privacy/security/support | Blocked | Final review, account deletion/export, trust/status/legal pages must be complete. |
| Rollback | Needs fix/proof | Last-known-good SHA and rollback command must be recorded. |
| UrAi Core dependency lock | Blocked | Core may consume only behind feature flag until all contract/smoke/rollback evidence passes. |
| Completion lock | Blocked | Do not change to LOCKED until all P0 gates pass. |

## Exact local verification commands

```bash
unset NPM_CONFIG_PREFIX
nvm install 20.19.0
nvm use 20.19.0
node --version
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

## Final decision rule

Asset Factory may be marked COMPLETE / LOCKED only when every P0 gate in `LAUNCH_READINESS.md` and `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` is changed from pending to passed with committed evidence, CI links, smoke logs, rollback SHA, monitoring links, and reviewer approval.
