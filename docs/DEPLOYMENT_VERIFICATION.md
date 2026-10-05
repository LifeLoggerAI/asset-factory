# Asset Factory Deployment Verification

Status: **DEDICATED LIVE EVIDENCE REQUIRED**

## Current deployment authority

The canonical production deploy path is `.github/workflows/production-readiness.yml`.

Production deployment requires all of the following on the same current authority:

- exact current `main`;
- protected `asset-factory-production` environment;
- explicit `deploy=true` plus exact confirmation `DEPLOY_ASSET_FACTORY`;
- provider-proven dedicated Asset Factory project, Hosting site, and HTTPS base URL;
- GitHub OIDC -> Google Workload Identity Federation;
- least-privilege deploy service account;
- ephemeral ADC scoped to the deployment step;
- credential cleanup before post-deploy smoke.

The historical shared Firebase project `urai-4dc1d` is not current Asset Factory production authority.

## Required protected environment configuration

Deployment variables:

```text
ASSET_FACTORY_FIREBASE_PROJECT_ID
ASSET_FACTORY_FIREBASE_HOSTING_SITE
ASSET_FACTORY_BASE_URL
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

Protected runtime smoke credentials remain separate:

```text
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

Do not configure `FIREBASE_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`, service-account JSON, embedded private keys, or another long-lived deployment credential.

## Verification sequence

1. Refresh current main and issue #63 authority.
2. Run repository and production-target gates.
3. Dispatch **Asset Factory Production Readiness** from current main.
4. Let GitHub OIDC -> Google WIF establish the short-lived deployment identity.
5. Deploy through the dedicated-target wrapper.
6. Remove the ephemeral deployment credential.
7. Run read-only smoke against the configured dedicated base URL.
8. Run authenticated own-tenant and cross-tenant-denial smoke with protected runtime credentials.
9. Verify custom-domain DNS/TLS and `/api/health`.
10. Retain exact source SHA, workflow run, deployed target, smoke output, monitoring evidence, and rollback target.

## Required evidence

A production verdict requires:

- exact source SHA and deployment run;
- dedicated Firebase/GCP project and Hosting site;
- dedicated HTTPS base URL;
- WIF authentication success with no long-lived credential;
- deploy result;
- TLS/custom-domain live readback;
- read-only health smoke;
- authenticated own-tenant allow;
- cross-tenant denial;
- required provider/runtime state;
- rollback SHA/procedure;
- monitoring and incident-path evidence.

Historical records under `docs/release-evidence/` remain historical and must not be elevated to current production proof merely because they once passed against the shared Firebase slice.
