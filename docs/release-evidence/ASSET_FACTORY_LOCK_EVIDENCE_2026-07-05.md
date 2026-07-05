# Asset Factory Live Production Lock Evidence - 2026-07-05

Status: `EVIDENCE_REQUIRED`

This file is the attach point for closing `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` and GitHub issue #63. It must not be edited to `PASSED` unless the referenced workflow run, provider receipt, artifact, dashboard link, or owner approval exists.

## Scope

Repository: `LifeLoggerAI/asset-factory`
Branch under audit: `main`
Lock branch: `production-lock/evidence-closure-20260705`
Canonical tracker: https://github.com/LifeLoggerAI/asset-factory/issues/63

## Required execution sequence

Run the `Deploy Asset Factory` workflow in this exact order:

1. `environment=staging`, `deploy=false`, `smoke_mode=readonly`
2. `environment=staging`, `deploy=true`, `smoke_mode=both`
3. `environment=production`, `deploy=false`, `smoke_mode=readonly`
4. `environment=production`, `deploy=true`, `smoke_mode=both`

Required secrets before any authenticated run:

- `FIREBASE_TOKEN`
- `ASSET_FACTORY_API_KEY`
- `ASSET_FACTORY_BEARER_TOKEN`
- `CRON_SECRET`
- Provider renderer secrets required by the active forge workflow
- Stripe webhook secret if billing proof is included in the same pass

## Evidence ledger

| Gate | Required proof | Evidence link / artifact | Status |
| --- | --- | --- | --- |
| Contract gate | API contract and OpenAPI match implemented routes and consumer expectations | TBD | `PENDING` |
| Local proof gate | `npm run doctor`, readiness, tests, build, route guard checks | TBD | `PENDING` |
| Staging readonly smoke | Staging read-only workflow artifact/logs | TBD | `PENDING` |
| Staging deploy smoke | Staging authenticated deploy artifact/logs, fallback disabled | TBD | `PENDING` |
| Production readonly smoke | Production read-only workflow artifact/logs | TBD | `PENDING` |
| Production deploy smoke | Production authenticated deploy artifact/logs, no secret leakage | TBD | `PENDING` |
| Firebase gate | Firestore/Storage backend active, rules/indexes/IAM reviewed | TBD | `PENDING` |
| Auth gate | JWT/API-key issuer, audience, tenant and role claims enforced | TBD | `PENDING` |
| Tenant isolation gate | Tenant A denied from Tenant B jobs/assets/files/billing state | TBD | `PENDING` |
| Provider generation gate | Provider-backed generation with local fallback disabled | TBD | `PENDING` |
| Worker gate | Durable queue leases, retries, idempotency, DLQ, retention cleanup | TBD | `PENDING` |
| Billing gate | Stripe signed webhook, idempotent entitlement persistence | TBD | `PENDING` |
| Diagnostics gate | Public redacted diagnostics, full diagnostics requires auth/API key | TBD | `PENDING` |
| Cron gate | Missing/wrong `CRON_SECRET` denied; correct secret passes | TBD | `PENDING` |
| Observability gate | Health, latency, queue depth, DLQ, provider failures, Stripe failures, storage errors, spend/cost caps | TBD | `PENDING` |
| Website/legal gate | DNS/TLS/routes/legal/trust/status/support/export/deletion pages verified | TBD | `PENDING` |
| Rollback gate | Last known good SHA, deploy command, rollback command, owner approval | TBD | `PENDING` |
| Core dependency gate | UrAi/UrAiProd consume only locked contract behind feature flag | TBD | `BLOCKED_BY_LOCK` |

## Provider receipts

### V2 living-state provider receipt

Required before V2 can be called provider-certified:

- Workflow: `V2 Living State Forge`
- Expected canonical assets: `80`
- Required receipt fields: `version=v2`, `status=passed`, `expectedOutputs=80`, `forgeExitCode=0`
- Required quality proof: `quality_report_v2.json` contains 80 passed assets
- Required handoff proof: `asset-factory-spatial-handoff.json` has `missing=0`
- Required promotion proof: Spatial branch and PR opened from provider-scored output

Evidence: TBD
Status: `PENDING`

### V3 exact handoff receipt

Required before V3 relationship/spatial assets can be called provider-ready:

- Expected exact provider handoff count: `14`
- No fallback receipt may certify V3
- Spatial activation must be gated on exact provider receipt

Evidence: TBD
Status: `PENDING`

### V4 exact handoff receipt

Required before V4 autonomous council/XR/operations assets can be called provider-ready:

- Expected exact provider handoff count: `39`
- No fallback receipt may certify V4
- Spatial activation must be gated on exact provider receipt

Evidence: TBD
Status: `PENDING`

## Native signal exports

Signal metrics may be referenced only at the confidence level of the source.

| Source | Current evidence | Native export attached? | Allowed claim |
| --- | --- | --- | --- |
| Global signal spreadsheets | Screenshot-derived visible views register | No | Screenshot-derived signal only |
| Platform analytics exports | TBD | No | Do not claim verified platform analytics |

## Public-copy boundary

Until every gate passes, public copy must stay within this boundary:

Allowed:

- Private
- Permissioned
- Explainable
- Correctable
- Hideable
- Deletable
- Consent-based
- User-controlled
- Production-gated
- Provider receipt pending where applicable

Forbidden until medically/legal/commercially substantiated:

- Medical diagnosis or treatment claims
- Therapy replacement claims
- Surveillance claims
- Hidden employer/application sharing
- Fully autonomous external action without approval/rules
- Fully production ready / 100% complete / system-of-systems complete
- Provider-certified V2/V3/V4 unless exact receipts are attached

## Lock rule

Only after every `PENDING` gate above has evidence may the lock owner update:

- `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` from `NOT LOCKED` to `LOCKED`
- GitHub issue #63 checkboxes
- UrAi/UrAiProd dependency records
- public copy from gated language to locked language
