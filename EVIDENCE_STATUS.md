# Evidence Status

Status: BLOCKED - Live Evidence Required
Updated: 2026-10-03

Repo: LifeLoggerAI/asset-factory
Branch audited: main
Latest inspected commit: cfb7c77eb65e90b120fc255cf91e0bed8a45bbab
Canonical tracker: https://github.com/LifeLoggerAI/asset-factory/issues/63
Completion lock: docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md

## Current decision

Asset Factory is **not LOCKED** and must not be described as fully done, fully production-ready, live verified, or complete.

Repo-side hardening and authority reconciliation are complete for the current pass, and historical Firebase-default production smoke evidence exists for `https://urai-4dc1d.web.app`, but the full product system is still blocked on live staging/production workflow evidence and P0 launch gates.

## Evidence accepted so far

- Repo-side hardening and release-gate docs are present.
- Firebase default production API base is documented as `https://urai-4dc1d.web.app`.
- Historical issue evidence records Firebase-default read-only and authenticated smoke passing for bridge routes.

## Evidence still required before LOCKED

- Staging workflow artifact/log: `deploy=false`, `smoke_mode=readonly`.
- Staging workflow artifact/log: `deploy=true`, `smoke_mode=both`.
- Production workflow artifact/log: `deploy=false`, `smoke_mode=readonly`.
- Production workflow artifact/log: `deploy=true`, `smoke_mode=both`.
- Custom-domain API smoke for `https://uraiassetfactory.com` or `https://www.uraiassetfactory.com`.
- JWT/API-key/tenant/role enforcement proof.
- Cross-tenant denial proof.
- Provider-backed generation proof with local fallback disabled.
- Worker queue lease/retry/idempotency/DLQ proof.
- Stripe signed webhook and entitlement persistence proof.
- Diagnostics redaction and full-auth proof.
- Cron secret rejection/acceptance proof.
- Monitoring links for health, latency, queue depth, DLQ, provider failures, Stripe failures, storage errors, and spend/cost caps.
- Rollback SHA and rollback command.
- Legal/privacy/security/support/account export/deletion approval.
- Final release evidence file validated with `npm run check:release-evidence:latest`.

## Exact next action

Run the manual GitHub Actions workflow:

```text
Actions -> Deploy Asset Factory -> Run workflow
environment=staging
deploy=false
smoke_mode=readonly
```

If it passes, continue in order:

```text
staging / deploy=true / smoke_mode=both
production / deploy=false / smoke_mode=readonly
production / deploy=true / smoke_mode=both
```

Attach every workflow artifact/log to issue #63 before changing the completion lock.

## Lock rule

Do not change `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` from `NOT LOCKED` to `LOCKED` until every P0 gate has linked evidence and owner approval.

## 2026-10-03 authority reconciliation

The legacy `docs/PRODUCTION_VERIFICATION_REPORT.md` and `docs/POST_PRODUCTION_HARDENING.md` were relabeled as historical production-slice evidence. Their historical deployment/smoke details are preserved, but they no longer assert current V200 production verification. `LOCK.md` and `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` remain the current lock authorities.
