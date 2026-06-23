# Asset Factory runtime environment blockers — 2026-06-23

## Scope

This file records the concrete blockers from the second patched `deploy-asset-factory.yml` workflow run set.

The previous code/local-verification wall was cleared after commit `2c92bf36a74f6a4114459c1a899b4e92dd257d90` (`ci: make local verification self-contained`). The remaining failures are runtime environment, DNS, and GitHub environment secret configuration blockers.

## Runs inspected

- `28017140102` — staging, `deploy=false`, `smoke_mode=readonly`
- `28017162054` — production, `deploy=false`, `smoke_mode=readonly`
- `28017149298` — staging, `deploy=true`, `smoke_mode=both`
- `28017184641` — production, `deploy=true`, `smoke_mode=both`

## Confirmed progress

The patched reruns passed the repo-side gates that were blocking earlier:

- doctor gate
- launch readiness gate
- completion lock gate
- local verification gate

## Confirmed blockers

### 1. Staging read-only smoke DNS failure

Run: `28017140102`

Target:

```text
https://staging.uraiassetfactory.com/api/health
```

Failure:

```text
FAIL /api/health fetch failed for https://staging.uraiassetfactory.com/api/health: fetch failed (code=ENOTFOUND, errno=-3008, syscall=getaddrinfo, hostname=staging.uraiassetfactory.com)
```

Interpretation:

`staging.uraiassetfactory.com` is not resolving from GitHub Actions. This is a DNS/custom-domain configuration blocker, not a repo build blocker.

### 2. Production read-only smoke HTTPS reset

Run: `28017162054`

Target:

```text
https://www.uraiassetfactory.com/api/health
```

Failure:

```text
FAIL /api/health fetch failed for https://www.uraiassetfactory.com/api/health: fetch failed (code=ECONNRESET, host=www.uraiassetfactory.com, port=443)
```

Interpretation:

`www.uraiassetfactory.com` resolves far enough to attempt HTTPS, but the connection is reset. This points to custom-domain/TLS/hosting/backend routing not yet serving the Asset Factory health endpoint.

### 3. Staging deploy/authenticated smoke secrets missing

Run: `28017149298`

The workflow reached `Validate required secrets`, then failed before Firebase CLI install/deploy.

Missing secrets:

```text
FIREBASE_TOKEN
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

### 4. Production deploy/authenticated smoke secrets missing

Run: `28017184641`

The workflow reached `Validate required secrets`, then failed before Firebase CLI install/deploy.

Missing secrets:

```text
FIREBASE_TOKEN
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

## Required actions before rerun

### GitHub environment secrets

Configure these in the `staging` and `production` GitHub Actions environments for `LifeLoggerAI/asset-factory`:

```text
FIREBASE_TOKEN
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

Notes:

- `FIREBASE_TOKEN` is required only when `deploy=true`.
- The four Asset Factory auth/cron secrets are required for `smoke_mode=authenticated` or `smoke_mode=both`.
- `ASSET_FACTORY_OTHER_BEARER_TOKEN` must represent a different tenant/context so the two-token tenant isolation/support-denial smoke can prove cross-tenant boundaries.

### DNS/TLS/hosting

Configure/verify:

```text
staging.uraiassetfactory.com
www.uraiassetfactory.com
```

Both must serve the Asset Factory app and expose:

```text
/api/health
/api/system/health
/api/system/manifest
```

Recommended minimum checks after DNS/TLS changes:

```bash
curl -I https://staging.uraiassetfactory.com/api/health
curl -I https://www.uraiassetfactory.com/api/health
curl -sS https://staging.uraiassetfactory.com/api/health
curl -sS https://www.uraiassetfactory.com/api/health
```

## Rerun order after fixes

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=staging \
  -f deploy=false \
  -f smoke_mode=readonly
```

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=staging \
  -f deploy=true \
  -f smoke_mode=both
```

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=production \
  -f deploy=false \
  -f smoke_mode=readonly
```

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=production \
  -f deploy=true \
  -f smoke_mode=both
```

## Launch interpretation

Do not mark Asset Factory production-locked yet.

Safe statement:

> Asset Factory now clears repo-side gates on the patched workflow. The remaining blockers are GitHub environment secrets plus staging/production DNS/TLS/health endpoint routing.
