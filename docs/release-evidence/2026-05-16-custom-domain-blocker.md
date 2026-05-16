# Asset Factory Custom Domain Blocker - 2026-05-16

## Status

Asset Factory is live and healthy on Firebase default hosting, but the canonical custom domain is not correctly routing /api/*.

## Verified working

- Firebase default hosting: https://urai-4dc1d.web.app
- Firebase default API health: https://urai-4dc1d.web.app/api/health
- Result: PASS

## Verified blocker

- Custom domain: https://uraiassetfactory.com
- Custom domain API health: https://uraiassetfactory.com/api/health
- Result: FAIL
- Failure mode: Next.js 404
- Evidence: response includes x-powered-by: Next.js and 404: This page could not be found

## Conclusion

The app code and Firebase default hosting are not the current blocker. The remaining production blocker is domain routing.

## Required fix

Choose one:

### Option A - Firebase owns the domain

Attach uraiassetfactory.com and www.uraiassetfactory.com to Firebase Hosting site urai-4dc1d, then update DNS to the Firebase-provided records.

### Option B - Current domain host keeps the domain

Add a rewrite/proxy on the host currently serving uraiassetfactory.com:

{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://urai-4dc1d.web.app/api/:path*"
    }
  ]
}

## Final verification command

After domain routing is fixed:

curl -fsS https://uraiassetfactory.com/api/health
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com npm run finish:custom-domain
