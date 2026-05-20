# Asset Factory Deployment Verification

Date: 2026-05-20
Status: PARTIALLY VERIFIED / BLOCKED

## Current deployment state

| Target | Status | Notes |
| --- | --- | --- |
| Firebase default API base | Verified by repo evidence | `https://urai-4dc1d.web.app` is recorded as the verified Firebase production API base. |
| Studio framework deploy path | Repo-owned fix merged | Use `npm run deploy:studio` for the Studio/Firebase framework surface. Do not use the older broad root deploy path as the default production workflow. |
| Apex custom domain | Needs proof / blocked until evidence | `https://uraiassetfactory.com` must pass read-only and authenticated smoke and return Asset Factory API health at `/api/health`. |
| WWW custom domain | Needs proof / blocked until evidence | `https://www.uraiassetfactory.com` must redirect to canonical host or serve the same Firebase-backed API surface. |
| Staging | Blocked | Needs deployment with local fallback disabled and production-like auth. |
| Rollback | Needs proof | Last-known-good SHA and rollback command must be recorded in release evidence. |
| Monitoring | Needs proof | Logs, uptime, queue/DLQ, provider costs, and error tracking links must be recorded. |

## Deployment safety rule

Do not run production deploys against a shared Firebase project unless the deploy scope is explicit and collision risk is reviewed.

Required deployment evidence fields:

```text
FIREBASE_PROJECT_ID=
FIREBASE_HOSTING_SITE=
FIREBASE_FUNCTIONS_CODEBASE=
FIRESTORE_RULES_FILE=
FIRESTORE_INDEXES_FILE=
STORAGE_RULES_FILE=
DEPLOY_COMMAND=
SMOKE_COMMAND=
ROLLBACK_SHA=
MONITORING_LINK=
OWNER_APPROVAL=
```

## Preferred evidence path

Use the manual GitHub Actions workflow when secrets are configured:

```text
Actions -> Deploy Asset Factory -> Run workflow
```

Recommended sequence:

1. `environment=staging`, `deploy=false`, `smoke_mode=readonly`
2. `environment=staging`, `deploy=true`, `smoke_mode=both`
3. `environment=production`, `deploy=false`, `smoke_mode=readonly`
4. `environment=production`, `deploy=true`, `smoke_mode=both`

Required GitHub environment/repository secrets:

```text
FIREBASE_TOKEN
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
CRON_SECRET
```

The workflow must run with:

```text
ASSET_FACTORY_FORCE_LOCAL=false
ASSET_FACTORY_REQUIRE_API_KEY=true
ASSET_FACTORY_REQUIRE_AUTH=true
```

Every successful workflow run must upload a release-evidence artifact and the artifact or workflow run must be linked from the production-lock issue.

## Current deploy scripts

Root package scripts include:

```bash
npm run deploy:studio
npm run deploy:firebase
npm run deploy:hosting-rules
npm run deploy:functions
npm run deploy:verify
npm run deploy:verify-readonly
npm run deploy:verify-custom-domain
npm run deploy:production
npm run deploy:partial
npm run smoke:staging
npm run smoke:prod
npm run smoke:website
npm run finish:custom-domain
```

Default production path for the Studio framework surface:

```bash
npm run deploy:studio
```

The broader `npm run deploy:firebase` path is available for explicit hosting/functions/firestore/storage deployments, but it should not be treated as the default Studio deploy command without reviewing collision risk.

## Production verification process

1. Confirm staging passed on the final release candidate.
2. Confirm production secrets are production-scoped.
3. Confirm provider spend caps are active.
4. Confirm Stripe live webhook endpoint and secret are active.
5. Confirm public docs do not claim unsupported capabilities.
6. Deploy production with explicit Firebase project and scope.
7. Run Firebase default API read-only smoke.
8. Run Firebase default API authenticated smoke.
9. Verify custom-domain DNS/TLS and API routing.
10. Run custom-domain read-only smoke.
11. Run custom-domain authenticated smoke.
12. Check logs, queue backlog, dead letters, provider failures, and spend.
13. Attach production smoke evidence to the release issue.
14. Record rollback SHA and rollback command.

## Custom-domain closure criteria

The custom-domain blocker is closed only when all of these are true:

- `uraiassetfactory.com` is attached to Firebase Hosting site `urai-4dc1d`, or the current frontend host proxies `/api/*` to `https://urai-4dc1d.web.app/api/*`.
- `www.uraiassetfactory.com` either redirects to the canonical apex domain or serves the same Firebase-backed API surface.
- `https://uraiassetfactory.com/api/health` returns expected Asset Factory health JSON, not a Next.js 404 page.
- Read-only smoke passes with `ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com`.
- Authenticated smoke passes with `ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com`.
- Evidence is committed under `docs/release-evidence/` or attached to the production-lock issue from the Deploy Asset Factory workflow.

## Commands

### GitHub Actions read-only smoke

```text
Actions -> Deploy Asset Factory -> Run workflow
environment=<staging|production>
deploy=false
smoke_mode=readonly
```

### GitHub Actions authenticated smoke

```text
Actions -> Deploy Asset Factory -> Run workflow
environment=<staging|production>
deploy=true
smoke_mode=both
```

### Firebase default API read-only smoke

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
npm run smoke:website
```

### Firebase default API authenticated smoke

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

### Custom-domain read-only smoke

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
npm run smoke:website
```

### Custom-domain authenticated smoke

```bash
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

## Audit limitation

During this audit session, direct live `curl` checks could not be completed because the execution sandbox could not resolve the public hostnames and did not have Firebase/Stripe/provider secrets. Treat this document as a repo-grounded verification record, not a replacement for CI or production smoke logs.