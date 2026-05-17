# Asset Factory Custom Domain Routing Blocker - 2026-05-17

Asset Factory is implemented and working on Firebase default hosting.

## Verified working

- Firebase project: urai-4dc1d
- Firebase default URL: https://urai-4dc1d.web.app
- Health endpoint: https://urai-4dc1d.web.app/api/health
- Smoke command: ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app npm run smoke:website
- Result: PASS

## Remaining blocker

The canonical custom domains are not yet routed to the Asset Factory Firebase Hosting site.

### Apex

- URL: https://uraiassetfactory.com/api/health
- Result: HTTP 404
- Evidence: x-powered-by: Next.js and 404: This page could not be found
- Interpretation: apex is still served by previous Next.js host.

### WWW

- URL: https://www.uraiassetfactory.com/api/health
- Result: TLS connection reset
- DNS observed: CNAME ghs.googlehosted.com
- Interpretation: www certificate/routing is not fully provisioned to the intended Firebase site.

## Required external fix

Attach both custom domains to Firebase Hosting site urai-4dc1d:

- uraiassetfactory.com
- www.uraiassetfactory.com

Then apply the exact Firebase-provided DNS records and wait until both domains show connected/certificate provisioned.

## Final acceptance commands

curl -fsS https://uraiassetfactory.com/api/health
curl -fsS https://www.uraiassetfactory.com/api/health
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com npm run finish:custom-domain
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com npm run smoke:website

Expected result:

- HTTP 200
- JSON contains ok true
- smoke passes
