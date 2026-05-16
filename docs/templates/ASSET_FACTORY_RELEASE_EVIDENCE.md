# Asset Factory Release Evidence

Use this template for every staging or production launch decision. Paste completed copies into `docs/release-evidence/<date>-<environment>.md` or attach them to the release PR/issue.

## Release identity

- Environment:
- Repo: `LifeLoggerAI/asset-factory`
- Branch:
- Commit SHA:
- Contract version: `asset-factory-api-v1`
- Release owner:
- Reviewers:
- Date/time:

## Status summary

| Area | Required value | Actual value | Evidence |
| --- | --- | --- | --- |
| Local fallback disabled | `true` for staging/prod |  |  |
| Auth required | `true` |  |  |
| API key required | `true` for protected mutating routes/full diagnostics |  |  |
| Tenant isolation verified | `true` |  |  |
| Provider generation verified | `true` for launch asset types |  |  |
| Durable worker verified | `true` |  |  |
| Stripe entitlements verified | `true` |  |  |
| Diagnostics redacted | `true` |  |  |
| Cron secret enforced | `true` |  |  |
| Observability verified | `true` |  |  |
| Website/legal/trust/status verified | `true` |  |  |
| Rollback SHA recorded | `true` |  |  |

## Commands and outputs

### Local proof

```bash
npm run doctor
npm run test:launch-readiness
npm --prefix assetfactory-studio run check
npm --prefix assetfactory-studio run e2e
npm run verify:local
```

Evidence:

```text
<paste output or link CI run>
```

### Staging smoke

```bash
ASSET_FACTORY_BASE_URL=https://staging.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$STAGING_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$STAGING_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=smoke-tenant-a \
ASSET_FACTORY_OTHER_TENANT_ID=smoke-tenant-b \
CRON_SECRET=$STAGING_CRON_SECRET \
npm run smoke:staging
```

Evidence:

```text
<paste output or link CI run>
```

### Production smoke

```bash
ASSET_FACTORY_BASE_URL=https://www.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

Evidence:

```text
<paste output or link CI run>
```

## Endpoint proof

| Endpoint | Expected | Actual | Evidence |
| --- | --- | --- | --- |
| `GET /api/health` | 200 redacted healthy/degraded |  |  |
| `POST /api/assets` | 202 queued |  |  |
| `GET /api/assets/{assetId}` | 200 own tenant, 403 other tenant |  |  |
| `POST /api/lifemap/events` | 202 accepted |  |  |
| `POST /api/generate` | job created |  |  |
| `POST /api/jobs/:jobId/materialize` | output materialized |  |  |
| `GET /api/generated-assets/:file` | own tenant allowed, other tenant denied |  |  |
| `POST /api/jobs/:jobId/publish` | published |  |  |
| `POST /api/jobs/:jobId/approve` | approved |  |  |
| Stripe webhook unsigned | rejected |  |  |
| Stripe webhook signed | persisted idempotently |  |  |
| Cron missing/wrong secret | rejected |  |  |
| Cron correct secret | accepted |  |  |

## Output inventory proof

### Generated asset outputs

- Graphic:
- 3D model:
- Audio:
- Bundle:

### Data records

- `assetFactoryRequests`:
- `assetFactoryQueue`:
- `assetManifests`:
- generated job records:
- usage records:
- entitlement records:
- dead-letter records:
- system status records:
- Life Map records:

### Storage paths

- Private tenant path:
- Public published path:
- Signed/private download proof:
- Cross-tenant denial proof:

## Observability proof

- Request ID visible:
- Structured logs visible:
- Error tracking visible:
- Queue depth visible:
- DLQ visible:
- Provider spend visible:
- Uptime check visible:
- Incident/support path verified:

## Rollback

- Last known-good SHA:
- Rollback command:
- Feature flag kill switch:
- Core rollback path:

## Decision

- [ ] Do not release
- [ ] Release to staging only
- [ ] Release to production behind feature flag
- [ ] Release to production as locked dependency

Decision rationale:

```text
<write final release rationale>
```
