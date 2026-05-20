# Asset Factory Completion Lock

Status: **NOT LOCKED**

This file is the machine-readable human checklist for deciding whether Asset Factory is complete, cohesive, integrated, verified, documented, and safe for UrAi system-of-systems production use.

No older report, local smoke, partial Firebase deploy, demo proof, or roadmap note may override this lock.

## Canonical status labels

| Area | Status | Meaning |
| --- | --- | --- |
| Repo-side hardening | `COMPLETE_FOR_CURRENT_PASS` | Studio deploy/runtime/API routing, CI runtime, deploy workflow, diagnostics, health compatibility, runbooks, and evidence validation have been updated through commit `6aa50f2d3c49b99a0739e80690873a37602f3906`. |
| Firebase API slice | `PRODUCTION-SMOKED` | Health, asset request/status, and Life Map event ingestion have historical smoke evidence on `urai-4dc1d`. Fresh final evidence is still required before lock. |
| Full Asset Factory product system | `LIVE_EVIDENCE_REQUIRED` | Staging/production, auth, tenancy, provider, worker, billing, observability, legal/support, rollback, and custom-domain gates remain incomplete until proven by live artifacts. |
| UrAi Core dependency | `NOT_LOCKED` | Core may integrate only behind a feature flag until this lock is closed. |

## Current source of truth

- Canonical production tracker: GitHub issue #63.
- Open PRs at latest status sync: 0.
- Duplicate trackers consolidated: #29, #59, #60.
- Latest repo-side hardening commit: `6aa50f2d3c49b99a0739e80690873a37602f3906`.

## Lock owner responsibilities

The lock owner must verify evidence before changing `Status` to `LOCKED`:

- Every P0 gate in `LAUNCH_READINESS.md` is `Passed` with links to evidence.
- `docs/contracts/ASSET_FACTORY_API.md` matches implementation and OpenAPI.
- Staging smoke passes with production-like auth and local fallback disabled.
- Production smoke passes with a test tenant and no secret leakage.
- UrAiProd dependency records identify Asset Factory as locked and safe to consume.

## P0 completion gates

| Gate | Required proof | Current state |
| --- | --- | --- |
| Contract gate | API contract and OpenAPI match implemented routes and consumer expectations. | Repo-side reviewed; final live consumer evidence pending |
| Local proof gate | `npm run doctor`, root readiness, Studio check/e2e, root tests/build pass. | Pending fresh workflow evidence |
| Staging deploy gate | Staging URL runs with `ASSET_FACTORY_FORCE_LOCAL=false`. | Pending live workflow evidence |
| Firebase gate | Firestore/Storage backend active, rules/indexes/IAM reviewed, no local fallback in staging. | Pending live workflow evidence |
| Auth gate | JWT/API-key auth enabled, issuer/audience checked, tenant and role claims enforced. | Pending live workflow evidence |
| Tenant isolation gate | Tenant A cannot read/list/download Tenant B jobs/assets/files. | Pending live workflow evidence |
| Provider generation gate | Local-proof smoke and real provider smoke pass for launch asset types. | Pending live provider evidence |
| Worker gate | Durable queue/worker path uses leases, retries, idempotency, DLQ, cleanup/retention. | Pending live worker/DLQ evidence |
| Billing gate | Stripe webhook verifies signatures and persists idempotent tenant entitlements. | Pending live Stripe evidence |
| Diagnostics gate | Public health/manifest are redacted; full diagnostics require API key. | Pending live workflow evidence |
| Cron gate | Cron endpoints reject missing/wrong `CRON_SECRET` and pass with correct secret. | Pending live workflow evidence |
| Observability gate | Errors, latency, queue depth, failed jobs, provider costs, uptime visible. | Pending monitoring links |
| Website gate | `www.uraiassetfactory.com` DNS/TLS/routes/legal/trust/status pages verified. | Pending custom-domain evidence |
| Production smoke gate | Production smoke passes with a test tenant after deploy. | Pending live workflow evidence |
| Rollback gate | Last known-good SHA and rollback command are recorded. | Pending owner-selected rollback evidence |
| Core dependency gate | UrAi Core consumes only documented contract behind feature flag with timeout/retry/rollback path. | Pending after Asset Factory lock |

## Merged hardening inventory

Completed during the current production-lock pass:

- Studio Firebase deploy runtime/API routing fix.
- CI emulator Java 21 and Studio Node 22 runtime fix.
- Manual deploy/smoke workflow aligned to Studio runtime.
- Deployment verification docs synced to the GitHub Actions evidence path.
- Release evidence validator added.
- Deploy workflow diagnostics split into actionable steps.
- Health route compatibility for production smoke.
- Operations runbook synced to current workflow/auth/health-route behavior.
- Duplicate launch/readiness trackers consolidated into issue #63.

## Required output inventory

Asset Factory is complete only if every output below is delivered by tests or smoke evidence.

### API outputs

- Health JSON
- Asset request acceptance JSON
- Asset status JSON
- Life Map event acceptance JSON
- Studio job creation JSON
- Studio materialization JSON
- Generated file fetch response
- Publish response
- Approve response
- Billing/entitlement response or durable record
- Diagnostics response, redacted publicly and full only when authorized

### Storage outputs

- Tenant-scoped private manifest
- Tenant-scoped generated file
- Public/published asset path when approved
- Signed/private download behavior where required
- Denied cross-tenant path access

### Data outputs

- `assetFactoryRequests`
- `assetFactoryQueue`
- `assetManifests`
- generated job records
- usage records
- entitlement records
- queue lease records
- dead-letter records
- system status records
- Life Map events and updated Life Map chapters

### Operational outputs

- Smoke evidence bundle
- CI run links
- staging URL
- production URL
- uptime checks
- queue/DLQ visibility
- provider spend visibility
- rollback SHA
- incident/support path

## Required final evidence bundle

Create one release evidence record per production launch:

```text
release:
  repo: LifeLoggerAI/asset-factory
  branch: main
  commit: <sha>
  api_contract_version: asset-factory-api-v1
  local_proof_run: <link-or-log-path>
  staging_smoke_run: <link-or-log-path>
  production_smoke_run: <link-or-log-path>
  firebase_project: urai-4dc1d
  staging_url: https://staging.uraiassetfactory.com
  production_url: https://www.uraiassetfactory.com
  fallback_disabled: true
  auth_required: true
  api_key_required: true
  tenant_isolation_verified: true
  provider_generation_verified: true
  worker_queue_verified: true
  stripe_entitlements_verified: true
  diagnostics_redacted: true
  cron_secret_verified: true
  observability_verified: true
  legal_pages_verified: true
  rollback_sha: <sha>
  owner: <name>
```

Validate final evidence with:

```bash
node scripts/check-release-evidence.mjs docs/release-evidence/<file>.md
```

## Forbidden completion claims

Do not use these phrases in README, launch notes, website, or Core dependency docs until this file is locked:

- `100% complete`
- `fully production ready`
- `fully wired`
- `fully verified`
- `system of systems complete`
- `all outputs delivered`
- `no roadmap remaining`

Allowed phrase until locked:

```text
Asset Factory repo-side hardening is complete for the current pass, with a production-smoked Firebase API slice and deterministic local proof pipeline. The full product system remains launch-gated until live staging/production auth, tenancy, provider-backed generation, worker, billing, observability, website, rollback, and production smoke evidence pass.
```

## Lock transition procedure

1. Run the Deploy Asset Factory workflow in the sequence documented in `docs/OPERATIONS_RUNBOOK.md` and issue #63.
2. Update every P0 gate in this file and `LAUNCH_READINESS.md` from pending to passed with evidence links.
3. Attach OpenAPI, smoke logs, CI links, staging evidence, production evidence, monitoring links, and rollback SHA.
4. Update UrAiProd dependency records.
5. Change top status from `NOT LOCKED` to `LOCKED` only in the same PR that includes evidence.
6. Merge only after review.
