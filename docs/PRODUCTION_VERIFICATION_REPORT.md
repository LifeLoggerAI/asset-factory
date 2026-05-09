# Production Verification Report

Status: **PRODUCTION VERIFIED**

Asset Factory is live on Firebase for project `urai-4dc1d` with production Functions, Hosting rewrites, Firestore rules, Storage rules, and live smoke verification completed.

## Scope Implemented On Main

- Firebase config aligned to `life-map-pipeline/functions` with Node 22 runtime.
- Hosting rewrites added for health, asset request, asset status, and Life Map ingestion APIs.
- Asset Factory TypeScript metadata and lifecycle types added.
- HTTPS Functions implemented for health, asset intake, asset status, and Life Map ingestion.
- Firestore rules expanded for asset request, queue, manifest, public asset, anonymous request, Life Map, and system status records.
- Storage rules hardened for authenticated assets, anonymous assets, public assets, profile images, and deny-all fallback.
- Placeholder hosting page replaced with a production status shell.
- GitHub Actions production readiness workflow added.
- System-of-systems documentation added.
- Production-finalization smoke test added at `scripts/smoke-production-finalization.mjs`.
- Firebase predeploy restored to deterministic `npm ci` after deploy Functions lockfile hardening was merged.

## Local Verification Evidence

Recorded from local shell on `main` after syncing to `origin/main` and deploying the production Functions bundle.

| Check | Command | Result |
| --- | --- | --- |
| Clean sync | `git fetch origin main && git reset --hard origin/main` | Passed; local main reset to `2a0b01e1608c401fb0537ad70ae58e84b58e3129` before final deploy |
| Root build | `npm run build` | Passed; deploy Functions TypeScript build and legacy Functions syntax check completed |
| Engine tests | `npm --prefix engine test` via root `npm test` | Passed; 3 tests passed |
| Deploy functions test | `npm --prefix life-map-pipeline/functions test` via root `npm test` | Passed; build completed |
| Legacy functions test | `npm --prefix functions test` via root `npm test` | Passed; `node --check index.js` completed |
| Launch readiness | `npm run test:launch-readiness --if-present` | Passed; `PASS launch readiness static checks` |
| Post-hardening deterministic predeploy | `npm run verify:local && npm run deploy:functions && npm run deploy:verify` | Passed after Firebase predeploy was restored to `npm ci` |

## Firebase Deployment Evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Firebase project | `urai-4dc1d` | Passed |
| Functions deploy command | `firebase deploy --project urai-4dc1d --only functions` | Passed |
| Functions predeploy install | `npm --prefix "$RESOURCE_DIR" ci` | Passed after lockfile hardening merge |
| Functions predeploy build | `npm --prefix "$RESOURCE_DIR" run build` | Passed |
| Functions source upload | `life-map-pipeline/functions source uploaded successfully` | Passed |
| assetFactoryHealth | Deployed/verified | Passed |
| createAssetRequest | Deployed/verified | Passed |
| getAssetStatus | Deployed/verified | Passed |
| ingestLifeMapEvent | Deployed/verified | Passed |
| processLifeMapEvent | Deployed/verified | Passed |

Function URLs reported by Firebase:

- `https://us-central1-urai-4dc1d.cloudfunctions.net/assetFactoryHealth`
- `https://us-central1-urai-4dc1d.cloudfunctions.net/createAssetRequest`
- `https://us-central1-urai-4dc1d.cloudfunctions.net/getAssetStatus`
- `https://us-central1-urai-4dc1d.cloudfunctions.net/ingestLifeMapEvent`

## Live Smoke Test Evidence

Smoke target:

```text
https://urai-4dc1d.web.app
```

Command:

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app npm run smoke:production-finalization
```

Initial production verification result:

| Endpoint | Required result | Result |
| --- | --- | --- |
| `GET /api/health` | HTTP 200 | Passed |
| `POST /api/assets` | HTTP 202 with asset ID and queue ID | Passed; `assetId=1K2r0m8Dle87cIIBgU0J`, `queueId=krebIOgHF2wOmGLwu9U7` |
| `GET /api/assets/{assetId}` | HTTP 200 status response | Passed |
| `POST /api/lifemap/events` | HTTP 202 accepted event | Passed; `eventId=2MZ90nqWzvrG3wLs9JUV` |
| Full smoke | `PASS production finalization smoke` | Passed |

Post-hardening deterministic predeploy smoke result:

| Endpoint | Required result | Result |
| --- | --- | --- |
| `GET /api/health` | HTTP 200 | Passed |
| `POST /api/assets` | HTTP 202 with asset ID and queue ID | Passed; `assetId=rTiehwlkaa4DdkD4Umzq`, `queueId=11kNuSh3CRgtQqdnLNcT` |
| `GET /api/assets/{assetId}` | HTTP 200 status response | Passed |
| `POST /api/lifemap/events` | HTTP 202 accepted event | Passed; `eventId=mJzdn9uuEL125b0fJ91N` |
| Full smoke | `PASS production finalization smoke` | Passed |

## Deployment Target

- Firebase project: `urai-4dc1d`
- Hosting site: `urai-4dc1d`
- Hosting URL: `https://urai-4dc1d.web.app`
- Custom domain target: `https://www.uraiassetfactory.com`
- Functions source: `life-map-pipeline/functions`
- Runtime: Node 22

## Known Non-Blocking Follow-Ups

- Functions audit hardening reduced the deploy Functions audit surface to 9 low findings. The remaining low advisory chain should not be force-fixed if it downgrades `firebase-admin` from the verified 12.x line.
- Firebase CLI still prints a stale-looking Functions SDK warning even though the deploy Functions package has been verified with `firebase-functions@5.1.1` and `firebase-admin@12.7.0`.
- Custom domain `www.uraiassetfactory.com` is not verified yet. The verified production endpoint is `https://urai-4dc1d.web.app`.
- GitHub Actions deploy still requires repository secret `FIREBASE_SERVICE_ACCOUNT` if CI-based deployment is desired.

## Final Status

All required local build/test/readiness gates, Firebase Functions deployment, deterministic `npm ci` predeploy, and live production smoke checks passed. Asset Factory is production verified on Firebase Hosting and Functions for `urai-4dc1d`.
