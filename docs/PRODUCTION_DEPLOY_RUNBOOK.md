# Asset Factory Production Deploy Runbook

Current authority: `.github/workflows/production-readiness.yml`, `scripts/run-dedicated-firebase-deploy.mjs`, and `scripts/asset-factory-production-authority.mjs`.

## Production boundary

Asset Factory production requires a **provider-proven dedicated** Firebase/GCP project, Hosting site, and HTTPS base URL. The shared consumer project/site `urai-4dc1d` and its `web.app` / `firebaseapp.com` hosts are forbidden as current Asset Factory production targets.

Do not use `FIREBASE_TOKEN`, service-account JSON, embedded private keys, or historical deploy commands as a shortcut.

## Required protected environment variables

- `ASSET_FACTORY_FIREBASE_PROJECT_ID`
- `ASSET_FACTORY_FIREBASE_HOSTING_SITE`
- `ASSET_FACTORY_BASE_URL`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

The project/site/base URL must be current provider values and must pass `npm run validate:production-target`.

## Safe production flow

1. Refresh current `main` and issue #63 authority.
2. Run repository verification and production-target validation.
3. Dispatch **Asset Factory Production Readiness** from current `main`.
4. Set `deploy=true` and confirmation `DEPLOY_ASSET_FACTORY`.
5. Let GitHub OIDC -> Google WIF mint the short-lived deployment identity.
6. Deploy through `scripts/run-dedicated-firebase-deploy.mjs`.
7. Remove the ephemeral ADC file.
8. Run read-only smoke against the configured dedicated `ASSET_FACTORY_BASE_URL`.
9. Retain exact SHA, workflow run, deployed target, smoke output and rollback evidence.

A historical successful deployment to `urai-4dc1d` is historical evidence only.
