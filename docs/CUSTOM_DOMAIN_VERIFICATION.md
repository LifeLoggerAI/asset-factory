# Custom Domain Verification

Asset Factory is production verified at:

```text
https://urai-4dc1d.web.app
```

The custom domain target is:

```text
https://www.uraiassetfactory.com
```

This runbook covers the remaining external DNS / Firebase Hosting setup required before Issue #55 can be closed.

## Prerequisites

- Firebase project: `urai-4dc1d`
- Hosting site: `urai-4dc1d`
- Production smoke passes on `https://urai-4dc1d.web.app`
- Access to DNS settings for `uraiassetfactory.com`
- Access to Firebase Hosting custom domain settings

## Firebase Hosting Setup

1. Open Firebase Console.
2. Select project `urai-4dc1d`.
3. Go to `Hosting`.
4. Select the hosting site for `urai-4dc1d`.
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
| Certificate error | Firebase certificate is not provisioned yet | Wait until Firebase Hosting shows certificate ready |
| HTTP 404 | Domain points somewhere else or Firebase domain mapping is incomplete | Confirm Firebase Hosting custom domain setup |
| `/api/health` fails | Hosting rewrite or Functions deployment issue | Verify `https://urai-4dc1d.web.app/api/health` still passes |
| web.app passes but custom domain fails | Domain/DNS/cert issue, not production runtime | Keep Issue #55 open |

## Completion Criteria

Issue #55 can close only after:

1. `www.uraiassetfactory.com` resolves.
2. HTTPS certificate is valid.
3. Firebase Hosting serves the custom domain.
4. `npm run deploy:verify-custom-domain` passes.
5. `docs/PRODUCTION_VERIFICATION_REPORT.md` is updated with custom-domain evidence.

Production remains verified on `https://urai-4dc1d.web.app` while this is open.
