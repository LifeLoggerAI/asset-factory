# Asset Factory Deployment Verification

Date: 2026-09-24  
Status: **DEDICATED PRODUCTION AUTHORITY UNRESOLVED / DEPLOYMENT BLOCKED**

## Current deployment truth

| Target | Current status | Authority |
| --- | --- | --- |
| Historical `urai-4dc1d` Asset Factory surface | Historical evidence exists | Not valid final Asset Factory production authority |
| Historical `asset-factory-dev-id` surface | Historical/dev evidence exists | Not valid final production authority |
| Dedicated Asset Factory Firebase/GCP project | Not yet verified | Provider/admin readback required |
| Dedicated Hosting/App Hosting target | Not yet verified | Provider/admin readback required |
| Staging | Not live-certified | Must use local fallback OFF and protected auth |
| `uraiassetfactory.com` | Not production proof | Attach only after dedicated provider origin is proven |
| Rollback | Not current-release proven | Must bind to final deployed SHA |
| Monitoring | Not current-release proven | Logs, uptime, queue/DLQ, errors and spend required |

## Safety rule

Production deployment must fail closed unless all of these protected values are present and valid:

```text
ASSET_FACTORY_FIREBASE_PROJECT_ID
ASSET_FACTORY_FIREBASE_HOSTING_SITE
ASSET_FACTORY_BASE_URL
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

The source guard rejects shared/historical targets including `urai-4dc1d`, `asset-factory-dev-id`, legacy Firebase origins and `urai.app`.

## Required evidence fields

```text
SOURCE_SHA=
FIREBASE_PROJECT_ID=
FIREBASE_HOSTING_SITE=
PROVIDER_ORIGIN=
WIF_PROVIDER=
DEPLOY_SERVICE_ACCOUNT=
DEPLOY_REVISION=
DEPLOY_TIMESTAMP=
SMOKE_RUN=
AUTH_TENANT_PROOF=
CROSS_TENANT_DENIAL=
WORKER_DLQ_PROOF=
STRIPE_TEST_PROOF=
MONITORING_LINK=
ROLLBACK_SHA=
ROLLBACK_COMMAND=
CUSTOM_DOMAIN=
TLS_PROOF=
OWNER_APPROVAL=
INDEPENDENT_REVIEW=
```

## Workflow separation

### Production deployment

Use **Asset Factory Production Readiness** only from exact reviewed `main`.

Deployment requires:

```text
deploy=true
confirm=DEPLOY_ASSET_FACTORY
```

### Existing deployment verification

Use **Verify Deployed Asset Factory**.

This workflow is smoke-only and never deploys:

```text
staging / smoke_mode=readonly
staging / smoke_mode=both
production / smoke_mode=readonly
production / smoke_mode=both
```

The selected GitHub environment supplies the correct `ASSET_FACTORY_BASE_URL`.

## Custom-domain closure criteria

Close the custom-domain blocker only when:

- the dedicated provider origin is known and smoke-green;
- `uraiassetfactory.com` is attached to that exact target;
- www redirects or serves equivalent authority;
- TLS is valid;
- `/api/health` identifies Asset Factory;
- readonly smoke passes;
- authenticated smoke passes;
- exact deployed revision is retained;
- rollback is retained and tested.

Do not proxy or attach the custom domain back to `urai-4dc1d` merely to make the URL respond.

## Historical evidence

May/June deployment records remain forensic history. They may support architecture and past-provider facts, but they do not certify the current release or the final dedicated production target.
