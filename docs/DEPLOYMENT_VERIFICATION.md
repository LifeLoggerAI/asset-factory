# Asset Factory Deployment Verification

Status: **DEDICATED LIVE EVIDENCE REQUIRED**

Current production authority is the provider-proven dedicated Asset Factory project/site/base URL. Historical smoke on shared Firebase project `urai-4dc1d` remains historical evidence only and must not be used for current production verification.

## Required protected production configuration

```text
ASSET_FACTORY_FIREBASE_PROJECT_ID
ASSET_FACTORY_FIREBASE_HOSTING_SITE
ASSET_FACTORY_BASE_URL
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

Long-lived `FIREBASE_TOKEN` and service-account JSON are prohibited for current deployment.

## Source gates

```bash
npm run verify:local
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
npm run validate:production-target
```

## Production workflow

Use **Asset Factory Production Readiness** from exact current `main`.

Production deployment is valid only when:

- the protected environment supplies a dedicated project/site/base URL;
- the target validation gate rejects all legacy/shared targets;
- GitHub OIDC exchanges through Google WIF;
- the deploy service account is least privilege;
- the generated ADC credential is removed before smoke;
- read-only and authenticated smoke run against the same dedicated `ASSET_FACTORY_BASE_URL`;
- exact deployed SHA and rollback evidence are retained.

## Manual smoke debugging

Only after `ASSET_FACTORY_BASE_URL` is set to the provider-proven dedicated runtime:

```bash
test -n "$ASSET_FACTORY_BASE_URL"
ASSET_FACTORY_BASE_URL="$ASSET_FACTORY_BASE_URL" \
ASSET_FACTORY_SMOKE_READONLY=true \
npm run smoke:website
```

```bash
test -n "$ASSET_FACTORY_BASE_URL"
ASSET_FACTORY_BASE_URL="$ASSET_FACTORY_BASE_URL" \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

## Custom-domain closure

`uraiassetfactory.com` and `www.uraiassetfactory.com` must be attached to the provider-proven dedicated Asset Factory hosting/runtime authority, with valid TLS and passing read-only/authenticated smoke. Do not proxy them to a historical shared Firebase host.

Historical files under `docs/release-evidence/` preserve the evidence they originally proved; they are not current release authority.
