# Asset Factory Custom Domain API Routing

`uraiassetfactory.com` must not be attached to the consumer URAI Hosting site `urai-4dc1d`.

Current public verification shows the custom domain can resolve to consumer URAI/Life Map content when it is bound to that site. Treat that state as a routing failure, not as an Asset Factory deployment.

## Required production routing

Use a dedicated, provider-proven Asset Factory web/Hosting target. Do not guess or synthesize a site ID.

Before any domain or Hosting mutation, establish all of the following from provider-native inventory:

- the exact Firebase/GCP project that owns the Asset Factory runtime;
- the exact dedicated Hosting site ID intended for Asset Factory public web content;
- the current custom-domain attachment for `uraiassetfactory.com` and `www.uraiassetfactory.com`;
- the API origin that returns the Asset Factory health contract;
- rollback ownership for the previous domain attachment.

The dedicated Hosting site ID must not be `urai-4dc1d`.

### If Firebase owns the domain

Attach `uraiassetfactory.com` only to the verified dedicated Asset Factory Hosting site, then verify the literal rendered product plus `/api/health` before calling the domain live.

Do not attach the domain to `urai-4dc1d` merely because Asset Factory backend services currently share resources in that Firebase project.

### If another web host owns the domain

Keep the public Asset Factory web app on that host and proxy only the required API surface to the verified Asset Factory API origin.

A Vercel-compatible example exists at:

`deploy/custom-domain/asset-factory-api-proxy.vercel.json`

Do not use the proxy example until the API origin has been independently verified as Asset Factory and not consumer URAI. After deployment, verify apex and `www`, TLS, rendered product identity, `/api/health`, authenticated read-only smoke, and rollback readiness.

## Fail-closed state

Until provider-native inventory proves the dedicated target and domain attachment, custom-domain production cutover remains blocked. Source-green or Firebase-default-host reachability is not equivalent to a correct `uraiassetfactory.com` deployment.
