# Asset Factory Deployment Verification

Status: **source authority reconciled / provider and live verification still required**.

This document distinguishes source verification from deployment proof. Historical Firebase receipts are diagnostic context only unless they bind the current certified source SHA to a current provider revision.

## Current authority

Production source mutation is authorized only by **Asset Factory Production Readiness** on exact `main`, behind the protected `asset-factory-production` environment, exact `DEPLOY_ASSET_FACTORY` confirmation, and keyless Google WIF/ADC authentication.

`Verify Deployed Asset Factory` is smoke-only. It cannot deploy and must not be used to infer deployment authority.

Root `deploy:*` commands fail closed. Operator documentation must not instruct direct local Firebase deployment, interactive Firebase login, Firebase CLI tokens, downloaded service-account JSON, or another long-lived Google deployment credential.

## Evidence required for production

| Boundary | Required evidence |
| --- | --- |
| Source | exact reviewed SHA and terminal required workflows |
| Review | eligible unchanged-head independent approval where required |
| WIF | protected provider + deploy service account configuration |
| IAM | exact principal, resource-scoped least privilege, no Owner/Editor dependency |
| Deploy | protected workflow run and provider-native revision |
| Readback | deployed revision/source SHA binding |
| Auth | positive protected access plus denied unauthenticated/cross-tenant checks |
| Domain | registrar/DNS/TLS/hosting attachment and canonical host behavior |
| Monitoring | logs/metrics/uptime/queue/provider-cost visibility and alert owner |
| Recovery | exercised recovery procedure |
| Rollback | different known-good revision restored and live-verified |

## Read-only verification of an existing target

Preferred:

```text
Actions -> Verify Deployed Asset Factory -> Run workflow
environment = staging | production
smoke_mode = readonly | authenticated | both
```

The workflow forces `ASSET_FACTORY_SMOKE_READONLY=true`. Protected API/bearer/cron credentials may be supplied for authorization checks; they do not authorize data-creating smoke.

A local health diagnostic against the existing Firebase URL is also read-only:

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
npm run smoke:website
```

## Staging

The current canonical workflows do not contain a repository-owned staging deploy job. A staging smoke target is not proof of how that target was deployed. The staging gate remains blocked until a governed deployment path and exact provider revision are independently evidenced.

## Custom domain

Fresh public readback must be compared with repository/provider authority. Do not infer ownership from content alone and do not alter DNS blindly. `uraiassetfactory.com` and `www.uraiassetfactory.com` are accepted only after registrar/nameserver/Firebase or proxy attachment, TLS, exact runtime, auth behavior, monitoring, recovery, and rollback are proven.

## Final decision rule

Do not update a completion lock or production-ready claim from source CI alone. Production acceptance requires the current exact SHA, provider-native deployment/readback, current independent review where required, and current monitoring/recovery/distinct-rollback evidence.
