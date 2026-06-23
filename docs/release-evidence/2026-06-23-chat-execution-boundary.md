# Chat execution boundary — 2026-06-23

## Context

This note records what was completed from the connected ChatGPT/GitHub session and what still requires a real Actions or Cloud Shell runtime.

## Completed from connected session

- Inspected `Deploy Asset Factory` workflow source.
- Confirmed the workflow has manual `workflow_dispatch` inputs for `environment`, `deploy`, and `smoke_mode`.
- Confirmed workflow runtime disables local fallback with `ASSET_FACTORY_FORCE_LOCAL=false`.
- Confirmed workflow requires API-key/auth mode for smoke.
- Confirmed workflow has split named steps for doctor, launch readiness, completion lock, local verification, deploy workflow gate, deploy, read-only smoke, authenticated smoke, and release evidence upload.
- Added this release-evidence note and the cross-tenant smoke secret note.

## Not completed from connected session

The connected GitHub tool can read files, create/update files, read issues, comment, fetch workflow logs/artifacts, and rerun existing failed jobs. It does not expose a function to start a brand-new `workflow_dispatch` run with inputs.

Therefore, the following were not executable from chat alone:

- starting the four required `Deploy Asset Factory` runs
- setting or reading GitHub environment/repository secrets
- deploying Firebase hosting/functions/storage/firestore from a checked-out workspace
- verifying DNS/TLS for `staging.uraiassetfactory.com` or `www.uraiassetfactory.com`
- proving provider-backed generation, Stripe webhook persistence, durable worker behavior, or observability dashboards

## Required next operator action

Run these in GitHub Actions:

```text
Deploy Asset Factory -> staging -> deploy=false -> smoke_mode=readonly
Deploy Asset Factory -> staging -> deploy=true -> smoke_mode=both
Deploy Asset Factory -> production -> deploy=false -> smoke_mode=readonly
Deploy Asset Factory -> production -> deploy=true -> smoke_mode=both
```

After a run exists, this connected session can inspect failed job logs/artifacts and rerun failed jobs through the available GitHub Actions tools.

## Completion rule

Do not update `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` to locked until workflow artifacts and committed release evidence prove every P0 gate in issue #63.
