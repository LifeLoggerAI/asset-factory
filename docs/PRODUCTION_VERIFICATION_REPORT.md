# Production Verification Report

Status: **NOT YET PRODUCTION VERIFIED**

This report exists so the repo cannot be marked complete until live deployment and smoke tests prove it.

## Scope Implemented In This Branch

- Firebase config aligned to `life-map-pipeline/functions` with Node 20.
- Hosting rewrites added for health, asset request, asset status, and Life Map ingestion APIs.
- Asset Factory TypeScript metadata and lifecycle types added.
- HTTPS Functions implemented for health, asset intake, asset status, and Life Map ingestion.
- Firestore rules expanded for asset request, queue, manifest, public asset, anonymous request, Life Map, and system status records.
- Storage rules hardened for authenticated assets, anonymous assets, public assets, profile images, and deny-all fallback.
- Placeholder hosting page replaced with a production status shell.
- GitHub Actions production readiness workflow added.
- System-of-systems documentation added.

## Required Evidence Before Marking Complete

| Check | Required result | Status |
| --- | --- | --- |
| Root dependency install | `npm install` succeeds | Pending CI / local run |
| Functions dependency install | `npm --prefix life-map-pipeline/functions install` succeeds | Pending CI / local run |
| Build | `npm run build` succeeds | Pending CI / local run |
| Test | `npm test` succeeds or documents intentional skips | Pending CI / local run |
| Launch readiness | `npm run test:launch-readiness` succeeds | Pending CI / local run |
| Firebase deploy | `firebase deploy --project urai-4dc1d --only hosting,functions,firestore,storage` succeeds | Pending authenticated deploy |
| Hosting smoke | Firebase hosting URL returns 200 | Pending deploy |
| Health smoke | `/api/health` returns `ok: true` | Pending deploy |
| Asset intake smoke | `POST /api/assets` returns 202 with assetId and queueId | Pending deploy |
| Asset status smoke | `GET /api/assets/{assetId}` returns stored asset | Pending deploy |
| Life Map smoke | `POST /api/lifemap/events` returns 202 and trigger updates `lifeMaps/{userId}` | Pending deploy |
| Custom domain | `assetfactory.app` returns 200 if configured | Pending DNS/deploy check |

## Deployment Target

- Firebase project: `urai-4dc1d`
- Hosting target: default target from `.firebaserc`
- Functions source: `life-map-pipeline/functions`
- Runtime: Node 20

## Final Signoff Requirements

Only update this document to **PRODUCTION VERIFIED** after recording:

1. Commit hash deployed.
2. Firebase deployment output.
3. Hosting URL.
4. Custom domain result, if applicable.
5. Health endpoint response.
6. Asset request and status smoke outputs.
7. Life Map ingestion smoke output.
8. CI workflow URL and passing result.
9. Any known limitations.

## Current Limitation

This branch was prepared through GitHub repository writes. Firebase deployment itself still requires authenticated Firebase credentials or CI secret `FIREBASE_SERVICE_ACCOUNT` to run in GitHub Actions.
