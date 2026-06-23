# Cross-tenant smoke secret requirement — 2026-06-23

## Finding

The `Deploy Asset Factory` workflow validates two tenant bearer-token inputs before authenticated smoke runs.

The workflow checks:

- `FIREBASE_TOKEN` when deploy is true
- `ASSET_FACTORY_API_KEY`
- `ASSET_FACTORY_BEARER_TOKEN`
- `ASSET_FACTORY_OTHER_BEARER_TOKEN`
- `CRON_SECRET`

## Why it matters

The second tenant bearer-token input is required to prove cross-tenant denial. Without it, the authenticated smoke path cannot demonstrate that Tenant A is denied access to Tenant B jobs/assets/files/queue/billing state.

## Action

Before running:

```text
Actions -> Deploy Asset Factory -> Run workflow -> staging -> deploy=true -> smoke_mode=both
```

confirm the staging environment has the second tenant bearer-token secret configured.

Before running:

```text
Actions -> Deploy Asset Factory -> Run workflow -> production -> deploy=true -> smoke_mode=both
```

confirm the production environment has the second tenant bearer-token secret configured.

## Evidence link

The workflow source is `.github/workflows/deploy-asset-factory.yml`; its validation step exits non-zero when authenticated smoke is requested and the second token is missing.

## Lock rule

Do not mark the tenant-isolation gate complete until the authenticated smoke artifact shows two-token cross-tenant denial passed with local fallback disabled.
