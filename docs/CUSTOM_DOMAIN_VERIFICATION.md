# Custom Domain Verification

Status: **DEDICATED HOSTING AUTHORITY REQUIRED**

Custom-domain targets:

```text
https://uraiassetfactory.com
https://www.uraiassetfactory.com
```

The backing project/site/runtime must be the provider-proven dedicated Asset Factory authority from the protected production environment. The historical shared Firebase project `urai-4dc1d` must not be used as the current custom-domain target or proxy origin.

## Prerequisites

- `ASSET_FACTORY_FIREBASE_PROJECT_ID` is a dedicated provider-proven project and passes the production-target guard.
- `ASSET_FACTORY_FIREBASE_HOSTING_SITE` is the matching dedicated Hosting site.
- `ASSET_FACTORY_BASE_URL` is the matching dedicated HTTPS runtime.
- GitHub OIDC -> Google WIF deployment authority is configured.
- Exact current main has passed repository gates.
- DNS control for `uraiassetfactory.com` is available.

## Provider setup

1. Open the dedicated Asset Factory Firebase/GCP project.
2. Select the dedicated Asset Factory Hosting site.
3. Add the apex and `www` domains as required by the canonical routing policy.
4. Apply only provider-generated ownership/DNS records.
5. Preserve legitimate ownership TXT records.
6. Wait for certificate status to become active.
7. Verify HTTP -> HTTPS and canonical redirect behavior.

## Diagnostics

```bash
npm run diagnose:custom-domain
```

## Verification

```bash
npm run deploy:verify-custom-domain
```

Expected closure evidence includes valid TLS, `/api/health` returning Asset Factory JSON, read-only smoke, authenticated smoke, tenant isolation evidence, exact deployed SHA, and rollback authority.

If the custom domain fails while the dedicated runtime passes, treat it as a DNS/TLS/hosting mapping blocker. Do not fall back to or proxy through a legacy/shared runtime just to obtain green smoke.
