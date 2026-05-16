# Asset Factory Custom Domain API Still Blocked Evidence

- Environment: production custom domain
- Repo: LifeLoggerAI/asset-factory
- Branch: main
- Commit SHA: 025288e5966b92f559593321d136e301142592bf
- Date/time: 2026-05-16T20:35:36Z
- Firebase project: urai-4dc1d
- Canonical API base tested: https://uraiassetfactory.com

## Commands

```bash
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com ASSET_FACTORY_SMOKE_READONLY=true npm run smoke:website
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com ASSET_FACTORY_API_KEY="$ASSET_FACTORY_API_KEY" ASSET_FACTORY_BEARER_TOKEN="$ASSET_FACTORY_BEARER_TOKEN" ASSET_FACTORY_TENANT_ID=prod-smoke ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied CRON_SECRET="$CRON_SECRET" npm run smoke:prod
```

## Result

| Check | Result | Evidence |
| --- | --- | --- |
| Custom-domain health | fail | /api/health returned Next.js 404 |
| Read-only smoke | fail | failed before read-only smoke could complete |
| Authenticated smoke | fail | failed before authenticated smoke could complete |
| Custom-domain API routing | fail | /api/* still routes to Next.js, not Asset Factory Firebase API |

## Decision

- [ ] Custom-domain API routing accepted
- [ ] Custom-domain read-only smoke accepted
- [ ] Custom-domain authenticated smoke accepted
- [ ] Completion lock can be changed to LOCKED

## Notes

The custom domain is still not production-ready for Asset Factory API traffic. The domain must be attached to Firebase Hosting site urai-4dc1d or proxy /api/* to https://urai-4dc1d.web.app/api/* before custom-domain smoke can pass.
