# Asset Factory Custom Domain Checklist

Canonical public production target:

```text
https://www.uraiassetfactory.com
```

## Authority boundary

The backing Firebase/GCP project and Hosting site must be the **provider-proven dedicated Asset Factory targets** supplied through the protected production environment.

The historical shared consumer project `urai-4dc1d` and its default Hosting URLs are historical evidence only. They are explicitly forbidden as current Asset Factory production authority and must not be used as a shortcut for domain attachment or release evidence.

Required current authority values:

- `ASSET_FACTORY_FIREBASE_PROJECT_ID`
- `ASSET_FACTORY_FIREBASE_HOSTING_SITE`
- `ASSET_FACTORY_BASE_URL`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

## Provider checks

- [ ] Dedicated project ID is provider-proven and is not `urai-4dc1d`.
- [ ] Dedicated Hosting site is provider-proven.
- [ ] `www.uraiassetfactory.com` is attached to that dedicated site.
- [ ] Any Firebase/Google ownership TXT challenge is satisfied with the exact current provider-generated value.
- [ ] Current DNS instructions match authoritative registrar records exactly.
- [ ] TLS is active/provisioned for the intended hostname.
- [ ] Apex/www redirect behavior matches the canonical policy.

## DNS checks

- [ ] No stale parking/Squarespace record still wins for the production hostname.
- [ ] No conflicting A, AAAA, or CNAME record exists for the same host.
- [ ] Legitimate ownership TXT records are preserved.
- [ ] HTTP redirects to HTTPS.
- [ ] The rendered surface and `/api/health` response belong to Asset Factory rather than a parked or unrelated host.

## Terminal verification

Run only after the provider and DNS control-plane changes are complete:

```bash
npm run diagnose:custom-domain
npm run deploy:verify-custom-domain
```

The custom-domain gate closes only when TLS, `/api/health`, read-only smoke, authenticated own-tenant allow, cross-tenant denial, canonical metadata, exact deployed SHA, and dedicated project/site authority all agree.

Do not promote historical shared-project smoke to current production proof.
