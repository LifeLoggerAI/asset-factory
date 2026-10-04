# Asset Factory Custom Domain Routing

The canonical Asset Factory domain is:

- https://uraiassetfactory.com

Current public state is **not production-bound**. A 404 or a response from an unrelated/shared UrAi host is not acceptable evidence.

## Dedicated production authority required

Asset Factory custom-domain verification is fail-closed until both of these are explicitly provisioned:

- a dedicated Asset Factory Firebase/GCP project ID;
- a dedicated Asset Factory Firebase Hosting site ID.

The verifier in `scripts/finish-custom-domain-production.mjs` intentionally rejects `urai-4dc1d` as either value. The shared consumer UrAi project/site must not be used merely to eliminate the custom-domain 404.

Set the dedicated identities only after they actually exist:

```bash
export ASSET_FACTORY_FIREBASE_PROJECT_ID='<dedicated-asset-factory-project>'
export ASSET_FACTORY_FIREBASE_HOSTING_SITE='<dedicated-asset-factory-hosting-site>'
export ASSET_FACTORY_BASE_URL='https://uraiassetfactory.com'
```

Then run the governed custom-domain verification:

```bash
node scripts/finish-custom-domain-production.mjs
```

That verifier runs the website and production smokes and writes exact-SHA evidence only after both succeed.

## Historical shared-project evidence

Older documentation and retained evidence may mention `urai-4dc1d.web.app`. That is historical production-slice evidence only. It does **not** authorize the current Asset Factory custom domain to be attached to the shared `urai-4dc1d` project/site.

## Current decision

Until the dedicated project/site exists, is bound to the domain, and the governed smoke succeeds:

- custom-domain state: **NO-GO**;
- provider generation: unchanged;
- shared-project fallback: **forbidden**;
- no production readiness claim may be inferred from DNS, TLS, or an HTTP response alone.
