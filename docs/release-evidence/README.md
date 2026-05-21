# Release Evidence

This folder stores completed staging and production launch evidence for Asset Factory.

Do not use this folder to claim that Asset Factory is production-locked unless every launch-readiness and completion-lock gate is proven with concrete evidence.

## Source of truth

- Current launch gate checklist: `../../LAUNCH_READINESS.md`
- Operations and smoke procedure: `../OPERATIONS_RUNBOOK.md`
- Evidence template: `../templates/ASSET_FACTORY_RELEASE_EVIDENCE.md`
- Evidence validator: `../../scripts/check-release-evidence.mjs`

## Create a new evidence file

Copy the template into a dated file:

```bash
cp docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md docs/release-evidence/YYYY-MM-DD-environment.md
```

Examples:

```bash
cp docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md docs/release-evidence/2026-05-21-staging.md
cp docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md docs/release-evidence/2026-05-21-production.md
```

Fill every placeholder before validation. The release evidence validator rejects angle-bracket placeholders, `TODO`, and `TBD` markers.

## Validate release evidence

Validate a specific completed evidence file:

```bash
npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md
```

Validate the newest markdown evidence file in this folder:

```bash
npm run check:release-evidence:latest
```

Do not literally run a command containing `docs/release-evidence/<file>.md`. In a shell, `<file>` is interpreted as input redirection and causes `bash: file: No such file or directory`.

## Required proof quality

A release evidence file must include concrete proof for:

- local proof checks;
- staging read-only smoke;
- staging authenticated smoke;
- production read-only smoke;
- production authenticated smoke;
- fallback disabled with `ASSET_FACTORY_FORCE_LOCAL=false`;
- auth and API-key enforcement;
- tenant isolation and cross-tenant denial;
- provider-backed generation for launch asset types;
- durable worker leases, retries, retry limits, idempotency, dead-letter handling, cleanup, and retention;
- Stripe webhook signature verification and idempotent entitlement persistence;
- diagnostics redaction;
- cron secret enforcement;
- observability for request IDs, structured logs, error tracking, queue depth, DLQ, provider spend, uptime, and support/incident path;
- rollback SHA, rollback command, feature flag kill switch, and Core rollback path;
- final release decision and rationale.

## Decision discipline

Exactly one release decision should be selected in the evidence file:

- Do not release
- Release to staging only
- Release to production behind feature flag
- Release to production as locked dependency

Only select `Release to production as locked dependency` when every P0 gate is proven and the completion-lock status is intentionally updated in the same reviewed release bundle.
