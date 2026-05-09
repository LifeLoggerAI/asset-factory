# Firebase Custom Domain Checklist

Target custom domain:

```text
https://www.uraiassetfactory.com
```

Verified Firebase production URL:

```text
https://urai-4dc1d.web.app
```

## Current Diagnostic Evidence

Latest diagnostics show:

```text
A records: 192.178.210.121
AAAA records: 2607:f8b0:4001:c11::79
CNAME records: ghs.googlehosted.com
TLS certificate: FAIL Client network socket disconnected before secure TLS connection was established
GET https://www.uraiassetfactory.com/api/health: FAIL Client network socket disconnected before secure TLS connection was established
```

Interpretation:

- DNS is resolving.
- `www.uraiassetfactory.com` is pointed at Google-hosted infrastructure.
- TLS does not complete, so no HTTP response is available.
- The verified Firebase runtime remains healthy at `https://urai-4dc1d.web.app`.

## Firebase Console Checks

Open:

```text
https://console.firebase.google.com/project/urai-4dc1d/hosting/sites
```

Then verify:

- [ ] Hosting site is `urai-4dc1d`.
- [ ] Custom domain `www.uraiassetfactory.com` is listed under the same Hosting site.
- [ ] Domain status is connected / active, not pending.
- [ ] SSL certificate status is active / provisioned, not pending.
- [ ] Firebase is not asking for additional TXT ownership verification.
- [ ] Firebase DNS instructions match the registrar records exactly.

## DNS Registrar Checks

At the DNS provider for `uraiassetfactory.com`, verify:

- [ ] `www` is configured exactly as Firebase instructs.
- [ ] There are no conflicting `www` CNAME records.
- [ ] There are no conflicting `www` A / AAAA records if Firebase requested a CNAME.
- [ ] There is no proxy/CDN layer intercepting HTTPS for `www.uraiassetfactory.com` unless intentionally configured.
- [ ] If using Cloudflare or similar, temporarily set `www` to DNS-only while Firebase provisions the certificate.

## Terminal Verification

Run after every Firebase/DNS change:

```bash
npm run diagnose:custom-domain
npm run deploy:verify-custom-domain
```

Passing read-only custom-domain smoke should show:

```text
Production finalization smoke target: https://www.uraiassetfactory.com
PASS /api/health
PASS read-only production finalization smoke
```

## Close Criteria For Issue #55

Close Issue #55 only after:

- [ ] `npm run diagnose:custom-domain` shows a valid TLS certificate.
- [ ] `npm run diagnose:custom-domain` gets an HTTP response from `/api/health`.
- [ ] `npm run deploy:verify-custom-domain` passes.
- [ ] `docs/PRODUCTION_VERIFICATION_REPORT.md` records custom-domain evidence.

Production remains verified at `https://urai-4dc1d.web.app` regardless of this custom-domain checklist.
