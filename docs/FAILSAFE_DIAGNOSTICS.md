# Failsafe Diagnostics

Asset Factory must preserve deterministic local-proof rendering when provider credentials are unavailable.

## Checklist
- Keep `ASSET_FACTORY_FORCE_LOCAL=true` and `ASSET_FACTORY_MEDIA_PROVIDER=local-proof` for no-secret runs.
- Validate sample manifests under `manifests/samples`.
- Keep explicit error output for publish/approve failures.

## Suggested command order
- `node scripts/setup-local.mjs`
- `npm run doctor`
- `npm run test:launch-readiness`
- `npm --prefix assetfactory-studio run typecheck`
- `npm --prefix assetfactory-studio test`
- `npm --prefix assetfactory-studio run build`
