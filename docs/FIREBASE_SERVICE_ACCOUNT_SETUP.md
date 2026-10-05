# Firebase WIF Deployment Setup

> Historical filename retained for inbound links. **Do not create or store a Firebase service-account JSON key for Asset Factory deployment.**

Current production authority is `.github/workflows/production-readiness.yml` plus `scripts/asset-factory-production-authority.mjs`.

## Required protected GitHub environment configuration

Configure these variables on the protected `asset-factory-production` environment:

- `ASSET_FACTORY_FIREBASE_PROJECT_ID` — provider-proven dedicated Asset Factory project. It must not be `urai-4dc1d`.
- `ASSET_FACTORY_FIREBASE_HOSTING_SITE` — provider-proven dedicated Hosting site.
- `ASSET_FACTORY_BASE_URL` — provider-proven HTTPS Asset Factory runtime URL.
- `GCP_WIF_PROVIDER` — Google Workload Identity Provider resource for GitHub OIDC.
- `GCP_DEPLOY_SERVICE_ACCOUNT` — least-privilege deploy service account used only through WIF impersonation.

Runtime smoke secrets remain separate from deployment identity.

## Prohibited deployment credentials

Do not configure or restore `FIREBASE_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_SERVICE_ACCOUNT_JSON`, committed service-account JSON/private keys, or globally exported long-lived Google credentials.

The canonical workflow mints a short-lived GitHub OIDC token, exchanges it through Google WIF, scopes the generated ephemeral ADC file to deployment, removes it immediately after deployment, and runs post-deploy smoke with deployment ADC absent.

No passing historical deployment to `urai-4dc1d` is current Asset Factory production authority.
