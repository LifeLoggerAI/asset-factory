# Custom Domain Verification

Historical shared-runtime evidence exists for:

```text
https://urai-4dc1d.web.app
```

That host is historical evidence only and is forbidden as current Asset Factory production authority.

The custom domain target is:

```text
https://www.uraiassetfactory.com
```

This runbook covers the remaining external DNS / Firebase Hosting setup required before Issue #55 can be closed.

## Current Observed Custom-Domain Failure

Latest read-only smoke result:

```text
Production finalization smoke target: https://www.uraiassetfactory.com
FAIL /api/health fetch failed for https://www.uraiassetfactory.com/api/health: fetch failed (code=ECONNRESET, host=www.uraiassetfactory.com, port=443)
```

This historical failure showed the custom-domain path resetting before `/api/health`. Current closure must be re-proven against the provider-proven dedicated Asset Factory runtime and Hosting site; do not infer current runtime health from the historical shared slice.

## One-Command Diagnostic

Run this before or after Firebase/DNS changes:

```bash
npm run diagnose:custom-domain
```

It checks:

- A records
- AAAA records
- CNAME records
- TLS certificate / SAN / issuer / validity
- HTTPS response for `/api/health`

You can override the domain if needed:

```bash
ASSET_FACTORY_CUSTOM_DOMAIN=www.uraiassetfactory.com npm run diagnose:custom-domain
```

## Prerequisites

- `ASSET_FACTORY_FIREBASE_PROJECT_ID` is the provider-proven dedicated Asset Factory project.
- `ASSET_FACTORY_FIREBASE_HOSTING_SITE` is the provider-proven dedicated Asset Factory Hosting site.
- `ASSET_FACTORY_BASE_URL` is the provider-proven dedicated HTTPS runtime and passes production-target validation.
- Access to DNS settings for `uraiassetfactory.com`
- Access to Firebase Hosting custom domain settings

## Firebase Hosting Setup

1. Open Firebase Console.
2. Select the provider-proven dedicated Asset Factory project.
3. Go to `Hosting`.
4. Select the provider-proven dedicated Asset Factory Hosting site.
5. Add custom domain:

```text
www.uraiassetfactory.com
```

6. Follow Firebase's ownership verification instructions.
7. Add the DNS records Firebase provides.
8. Wait until Firebase shows the domain as connected and certificate provisioning is complete.

## DNS Checks

From a terminal, check resolution:

```bash
nslookup www.uraiassetfactory.com
```

Optional HTTPS check:

```bash
curl -I https://www.uraiassetfactory.com
```

Expected result after DNS and certificate setup:

- domain resolves
- HTTPS responds
- no certificate error
- Firebase Hosting serves the app

## Asset Factory Read-Only Smoke

Run:

```bash
npm run deploy:verify-custom-domain
```

This uses:

```bash
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com ASSET_FACTORY_SMOKE_READONLY=true npm run smoke:production-finalization
```

Expected output:

```text
Production finalization smoke target: https://www.uraiassetfactory.com
PASS /api/health
PASS read-only production finalization smoke
```

## Full Smoke Option

Only run full write smoke against the custom domain if you explicitly want to create production smoke records through that domain:

```bash
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com npm run smoke:production-finalization
```

Expected output:

- `PASS /api/health`
- `PASS /api/assets`
- `PASS /api/assets/{assetId}`
- `PASS /api/lifemap/events`
- `PASS production finalization smoke`

## Troubleshooting

| Symptom | Likely cause | Next step |
| --- | --- | --- |
| `fetch failed` with `ENOTFOUND` | DNS is not configured or not propagated | Recheck DNS records and wait for propagation |
| `fetch failed` with `ECONNRESET` on port 443 | HTTPS reaches a host, but TLS/proxy/Firebase Hosting mapping is not completing cleanly | Confirm Firebase Hosting custom domain is connected, certificate is provisioned, and DNS points only to Firebase-provided records |
| Certificate error | Firebase certificate is not provisioned yet | Wait until Firebase Hosting shows certificate ready |
| HTTP 404 | Domain points somewhere else or Firebase domain mapping is incomplete | Confirm Firebase Hosting custom domain setup |
| `/api/health` fails | Hosting rewrite, Functions deployment, or runtime issue | Verify the provider-proven dedicated `ASSET_FACTORY_BASE_URL` passes production-target validation and `/api/health` |
| dedicated runtime passes but custom domain fails | Domain/DNS/cert mapping issue | Keep Issue #55 open |

## Completion Criteria

Issue #55 can close only after:

1. `www.uraiassetfactory.com` resolves.
2. HTTPS certificate is valid.
3. Firebase Hosting serves the custom domain.
4. `npm run deploy:verify-custom-domain` passes.
5. `docs/PRODUCTION_VERIFICATION_REPORT.md` is updated with custom-domain evidence.

Historical shared-host evidence remains historical only while this is open; current production authority requires fresh dedicated-runtime proof.
