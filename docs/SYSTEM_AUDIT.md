# Asset Factory System Audit

Date: 2026-05-17
Auditor: ChatGPT, acting as release auditor from connected URAI/GitHub evidence
Repo: LifeLoggerAI/asset-factory
Branch inspected: main
Commit inspected: c880b65d446fdf0a5fae846feda6b35b34e6a6ca

## Executive summary

Final verdict: PARTIALLY VERIFIED / BLOCKED.

Asset Factory has a production-smoked Firebase default API slice and a deterministic local proof pipeline, but the full product system is not complete and must not be described as fully production-ready, fully verified, system-of-systems complete, or locked.

The source-of-truth completion lock remains `Status: **NOT LOCKED**`. The repo itself distinguishes the Firebase API slice as `PRODUCTION-SMOKED` while classifying the full product system as `NOT_PRODUCTION_READY` and the UrAi Core dependency as `NOT_LOCKED`.

## System map

### Frontend / Studio

Primary package: `assetfactory-studio/`.

Known route surface from operations runbook:

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
- `GET|POST /api/worker/asset-queue`
- `GET /api/admin/queue`
- `POST /api/admin/queue/requeue`

### Local proof generation

The canonical Studio path supports deterministic local proof rendering for:

- `graphic` -> SVG proof assets
- `model3d` -> GLTF proof meshes
- `audio` -> WAV proof sounds
- `bundle` -> JSON bundle manifests

These are contract and test proof surfaces, not proof of production provider-backed generation.

### Backend/API

Canonical contract version: `asset-factory-api-v1`.

Contracted system-of-systems bridge routes:

- `GET /api/health`
- `POST /api/assets`
- `GET /api/assets/{assetId}`
- `POST /api/lifemap/events`

Studio generation contract remains:

1. `POST /api/generate`
2. `POST /api/jobs/:jobId/materialize`
3. `GET /api/generated-assets/:file`
4. `POST /api/jobs/:jobId/publish`
5. `POST /api/jobs/:jobId/approve`

### Hosting and deployment

Verified Firebase default API base from repo evidence:

```text
https://urai-4dc1d.web.app
```

Known public/custom domain blocker from repo evidence:

```text
https://uraiassetfactory.com/api/*
https://www.uraiassetfactory.com/api/*
```

The custom domain is not accepted until read-only and authenticated smoke both pass and evidence is committed under `docs/release-evidence/`.

### Firebase / custom domain

Firebase project in evidence: `urai-4dc1d`.
Firebase Hosting site in evidence: `urai-4dc1d`.

The custom-domain blocker is closed only when:

- apex `/api/health` returns the Asset Factory health response, not a Next.js 404;
- `www` redirects or serves the same Firebase-backed API surface;
- read-only smoke passes on the custom domain;
- authenticated smoke passes on the custom domain;
- the evidence file is committed.

### Data and storage outputs required before lock

Required output inventory from completion lock includes:

- tenant-scoped private manifest;
- tenant-scoped generated file;
- public/published asset path when approved;
- signed/private download behavior where required;
- denied cross-tenant path access;
- `assetFactoryRequests`;
- `assetFactoryQueue`;
- `assetManifests`;
- generated job records;
- usage records;
- entitlement records;
- queue lease records;
- dead-letter records;
- system status records;
- Life Map events and updated Life Map chapters.

### Safety, privacy, and legal controls

Not production-approved until final legal/privacy/security/support/account deletion/export review is complete. Public copy must not claim unsupported capabilities.

### External URAI integrations

- UrAi Core may consume only the documented contract behind a feature flag until lock is closed.
- Life Map integration depends on `/api/lifemap/events` evidence.
- Full system-of-systems dependency remains not locked until Core dependency gate passes.

## Verified-working evidence

Verified from repo docs and scripts:

- Firebase default API base is recorded as verified: `https://urai-4dc1d.web.app`.
- Repo has launch readiness, completion lock, operations runbook, OpenAPI, and release-evidence structures.
- Root scripts include doctor, local verification, launch readiness, completion lock, deploy verification, staging smoke, production smoke, website smoke, and custom-domain finish helpers.
- Static completion-lock checker asserts required files, OpenAPI version, required routes, and forbidden premature completion claims.

Not personally verified in this audit run:

- live endpoint response, because the sandbox could not resolve the public hosts;
- production authenticated smoke, because production secrets were not available;
- staging smoke, because staging secrets and deployment evidence were not provided in this session;
- provider-backed generation, worker, billing, observability, tenant-isolation, and legal gates, because the current source-of-truth docs still mark them pending or blocked.

## Blockers

| Severity | Area | Issue | Exact fix | Verification method |
| --- | --- | --- | --- | --- |
| P0 | Completion lock | `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` is `NOT LOCKED`. | Pass every P0 gate with linked evidence. | `npm run test:completion-lock`, then reviewer-accepted release evidence. |
| P0 | Staging | No accepted staging smoke with local fallback disabled. | Deploy staging with `ASSET_FACTORY_FORCE_LOCAL=false` and production-like auth. | `npm run smoke:staging`. |
| P0 | Auth/tenancy | Full JWT/API-key/tenant/role proof not accepted. | Enable required auth settings and document claim mapping. | Authenticated smoke plus cross-tenant denial proof. |
| P0 | Tenant isolation | Cross-tenant denial proof remains required. | Test Tenant A cannot access Tenant B jobs/assets/files. | Smoke and emulator tests. |
| P0 | Provider generation | Real provider-backed generation proof missing. | Configure provider adapters, model IDs, spend caps, and test launch types. | Provider smoke for selected launch modalities. |
| P0 | Worker | Durable queue/worker lease/retry/idempotency/DLQ proof remains required. | Verify Firestore queue or selected worker mode end to end. | Worker smoke, queue metrics, DLQ proof. |
| P0 | Billing | Stripe entitlement persistence proof remains required. | Verify signed webhook events persist idempotent entitlements. | Valid and unsigned webhook tests. |
| P0 | Observability | Logs/metrics/uptime/queue/provider-cost proof missing. | Configure dashboards and link monitoring. | Monitoring links plus smoke evidence. |
| P0 | Legal/privacy/support | Final legal/privacy/security/account deletion/export review missing. | Complete review and commit signoff. | Documented approval and public route checks. |
| P0 | Rollback | Rollback SHA/command proof not fully accepted. | Record last-known-good SHA and rollback command. | Release evidence template completed. |

## Final verdict

PARTIALLY VERIFIED / BLOCKED.

The Asset Factory Firebase default API slice is treated as production-smoked by repository evidence. The full Asset Factory product system is not complete, not locked, and not safe to market as finished until every P0 lock and launch-readiness gate has passed with committed evidence.
