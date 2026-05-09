# Asset Factory Production Lock

STATUS: NOT YET PRODUCTION VERIFIED

This repo must not be called 100% complete until live deployment and smoke tests pass.

## Implemented in `production-finalization-asset-factory`

- Firebase Node 20 config and hosting rewrites.
- Production API functions for health, asset request, asset status, and Life Map event ingestion.
- Durable Asset Factory metadata types and queue item types.
- Firestore rules for asset, Life Map, queue, manifest, public, usage, and system-status records.
- Storage rules for user assets, anonymous assets, public assets, profile images, and deny-all fallback.
- Hosting status page replacing the placeholder.
- GitHub Actions readiness and deploy workflow.
- System-of-systems documentation.
- Production verification report template.

## Required Before Changing Status

Change this file to `STATUS: PRODUCTION VERIFIED` only after all of the following are recorded in `docs/PRODUCTION_VERIFICATION_REPORT.md`:

1. Passing CI build/test/readiness workflow.
2. Successful Firebase deploy to `urai-4dc1d`.
3. Hosting URL returns HTTP 200.
4. `/api/health` returns `ok: true`.
5. `POST /api/assets` returns a queued asset and queue ID.
6. `GET /api/assets/{assetId}` returns that asset.
7. `POST /api/lifemap/events` accepts an event.
8. The Life Map Firestore trigger updates `lifeMaps/{userId}`.
9. Firestore rules and Storage rules deploy successfully.
10. No unresolved critical blockers remain.

## Current Manual Gate

Firebase deployment requires authenticated Firebase credentials or GitHub secret `FIREBASE_SERVICE_ACCOUNT`.
