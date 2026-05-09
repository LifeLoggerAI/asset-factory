# Asset Factory Production Lock

STATUS: PRODUCTION VERIFIED

Asset Factory has passed local verification, Firebase Functions deployment, and live production smoke testing for Firebase project `urai-4dc1d`.

## Verified Production Surface

- Firebase project: `urai-4dc1d`
- Hosting site: `urai-4dc1d`
- Hosting URL: `https://urai-4dc1d.web.app`
- Functions source: `life-map-pipeline/functions`
- Runtime: Node 22

## Verified Functions

- `assetFactoryHealth`
- `createAssetRequest`
- `getAssetStatus`
- `ingestLifeMapEvent`
- `processLifeMapEvent`

## Verified Live Smoke Tests

Command:

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app npm run smoke:production-finalization
```

Passed:

1. `GET /api/health`
2. `POST /api/assets`
3. `GET /api/assets/{assetId}`
4. `POST /api/lifemap/events`
5. Full `PASS production finalization smoke`

Smoke evidence:

- `assetId=1K2r0m8Dle87cIIBgU0J`
- `queueId=krebIOgHF2wOmGLwu9U7`
- `eventId=2MZ90nqWzvrG3wLs9JUV`

## Verification Report

See:

```text
docs/PRODUCTION_VERIFICATION_REPORT.md
```

## Non-Blocking Follow-Ups

- Triage `npm audit` findings separately.
- Refresh lockfiles and confirm Firebase SDK warning disappears.
- Verify custom domain `assetfactory.app` if/when DNS is configured.
- Configure `FIREBASE_SERVICE_ACCOUNT` if GitHub Actions deployment should run from CI.
