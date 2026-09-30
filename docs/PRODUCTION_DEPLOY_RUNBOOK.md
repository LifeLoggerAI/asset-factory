# Asset Factory Production Deploy Runbook

This is the canonical production flow for Asset Factory after the 2026-09-24 authority correction.

## Current status

**Deployment is intentionally blocked until a dedicated Asset Factory Firebase/GCP target is verified.**

Do not use:

- `urai-4dc1d`;
- `asset-factory-dev-id`;
- `urai.app`;
- their legacy Firebase Hosting origins

as final Asset Factory production authority.

## Required protected environment variables

```text
ASSET_FACTORY_FIREBASE_PROJECT_ID
ASSET_FACTORY_FIREBASE_HOSTING_SITE
ASSET_FACTORY_BASE_URL
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

Values must come from provider/admin readback. Do not invent project or site IDs.

## Provider/admin prerequisite

1. Inventory authorized Firebase Hosting/App Hosting projects and sites.
2. If a dedicated Asset Factory target exists, verify:
   - exact project ID;
   - exact Hosting/App Hosting site/backend;
   - ownership/billing;
   - WIF provider;
   - least-privilege service account;
   - current deployed revision, if any.
3. If none exists, create a dedicated target through authorized Firebase/GCP administration.
4. Record provider-generated IDs in the protected GitHub environment.
5. Keep long-lived service-account JSON keys prohibited.

## Source gate

Use the final reviewed main SHA only.

Before deployment:

```bash
npm run doctor
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
npm run audit:all
npm run validate:production-target
npm run verify:local
```

`validate:production-target` must fail if any required authority variable is missing or points to a legacy/shared target.

## Production deployment

Production deployment is dispatch-only through:

**GitHub Actions → Asset Factory Production Readiness**

Required confirmation:

```text
deploy=true
confirm=DEPLOY_ASSET_FACTORY
```

The deploy job:

1. checks out the exact main SHA;
2. verifies a clean tree;
3. validates dedicated project/site/base URL;
4. authenticates with WIF;
5. scopes the ephemeral credential to deployment only;
6. deploys the bounded Firebase targets through `scripts/run-dedicated-firebase-deploy.mjs`;
7. removes the ephemeral credential;
8. runs read-only smoke without deployment credentials.

## Staging and deployed-target smoke

Use the separate smoke-only workflow:

**GitHub Actions → Verify Deployed Asset Factory**

It does not deploy.

The selected protected environment supplies its own `ASSET_FACTORY_BASE_URL`.

Run:

```text
staging / smoke_mode=readonly
staging / smoke_mode=both
production / smoke_mode=readonly
production / smoke_mode=both
```

## Custom domain

Do not attach `uraiassetfactory.com` until the dedicated provider-assigned origin passes smoke.

Then:

1. attach apex to the verified dedicated target;
2. configure www redirect/parity;
3. apply only provider-generated DNS records;
4. verify TLS;
5. verify Asset Factory API identity;
6. verify auth boundaries;
7. verify robots/noindex policy;
8. rerun readonly and authenticated smoke;
9. record exact deployed and rollback revisions.

## Lock rule

Do not update `LOCK.md` to production locked until the complete current release-evidence packet exists. Historical `urai-4dc1d` smoke remains historical only.
