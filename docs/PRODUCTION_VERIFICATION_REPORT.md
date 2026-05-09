# Production Verification Report

Status: **NOT YET PRODUCTION VERIFIED**

This report exists so the repo cannot be marked complete until live deployment and smoke tests prove it.

## Scope Implemented On Main

- Firebase config aligned to `life-map-pipeline/functions` with Node 20.
- Hosting rewrites added for health, asset request, asset status, and Life Map ingestion APIs.
- Asset Factory TypeScript metadata and lifecycle types added.
- HTTPS Functions implemented for health, asset intake, asset status, and Life Map ingestion.
- Firestore rules expanded for asset request, queue, manifest, public asset, anonymous request, Life Map, and system status records.
- Storage rules hardened for authenticated assets, anonymous assets, public assets, profile images, and deny-all fallback.
- Placeholder hosting page replaced with a production status shell.
- GitHub Actions production readiness workflow added.
- System-of-systems documentation added.
- Production-finalization smoke test added at `scripts/smoke-production-finalization.mjs`.

## Local Verification Evidence

Recorded from local shell on `main` after pulling commit range through `ab4ade8c0652a768debff49c5768bddb63b31747`.

| Check | Command | Result |
| --- | --- | --- |
| Root update | `git checkout main && git pull origin main` | Passed; fast-forwarded through deploy-functions TypeScript fixes |
| Deploy functions install | `npm --prefix life-map-pipeline/functions install` | Passed; installed 300 packages; audit warnings remain |
| Deploy functions build | `npm --prefix life-map-pipeline/functions run build` | Passed; `tsc --types node` completed |
| Root build | `npm run build` | Passed; deploy Functions TypeScript build and legacy Functions syntax check completed |
| Engine tests | `npm --prefix engine test` via root `npm test` | Passed; 3 tests passed |
| Deploy functions test | `npm --prefix life-map-pipeline/functions test` via root `npm test` | Passed; build completed |
| Legacy functions test | `npm --prefix functions test` via root `npm test` | Passed; `node --check index.js` completed |
| Launch readiness | `npm run test:launch-readiness --if-present` | Passed; `PASS launch readiness static checks` |

## Required Evidence Before Marking Complete

| Check | Required result | Status |
| --- | --- | --- |
| Root dependency install | `npm install` succeeds | Local dependency path verified through package builds/tests |
| Functions dependency install | `npm --prefix life-map-pipeline/functions install` succeeds | Passed locally |
| Build | `npm run build` succeeds | Passed locally |
| Test | `npm test` succeeds or documents intentional skips | Passed locally |
| Launch readiness | `npm run test:launch-readiness` succeeds | Passed locally |
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

Local build, test, and launch-readiness gates now pass. Firebase deployment itself still requires authenticated Firebase credentials or CI secret `FIREBASE_SERVICE_ACCOUNT` to run in GitHub Actions.
