# Asset Factory Custom Domain API Routing

Asset Factory is live and verified on Firebase default hosting:

- https://urai-4dc1d.web.app

The canonical domain is currently blocked because:

- https://uraiassetfactory.com/api/health returns a Next.js 404
- That means /api/* is being handled by the current custom-domain host, not by Asset Factory Firebase Hosting.

## Required production routing

Choose one:

### Option A - Firebase owns the domain

Attach uraiassetfactory.com to Firebase Hosting site urai-4dc1d.

### Option B - Current web host keeps the domain

Add this rewrite/proxy on the host that serves uraiassetfactory.com:

{
  "source": "/api/:path*",
  "destination": "https://urai-4dc1d.web.app/api/:path*"
}

A Vercel-compatible example is provided in:

deploy/custom-domain/asset-factory-api-proxy.vercel.json

Copy the rewrites block into the active custom-domain web app config, then redeploy that app.
