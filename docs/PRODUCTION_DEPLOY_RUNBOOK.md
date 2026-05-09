# Production Deploy Runbook

This runbook is the canonical terminal flow for taking Asset Factory from verified local code to live Firebase production.

## Current Production Target

- Firebase project: `urai-4dc1d`
- Hosting site: `urai-4dc1d`
- Hosting URL: `https://urai-4dc1d.web.app`
- Firebase config: `firebase.json`
- Deployed Functions source: `life-map-pipeline/functions`
- Runtime: Node 20

## One-Time Local Setup

```bash
git checkout main
git pull origin main
npm run install:all
```

## Local Verification Gate

```bash
npm run verify:local
```

This runs:

```bash
npm run build
npm test --if-present
npm run test:launch-readiness --if-present
```

Expected result:

- `life-map-pipeline/functions` TypeScript build passes.
- Legacy `functions/index.js` syntax check passes.
- Engine tests pass.
- Deploy Functions test/build passes.
- Launch readiness static checks pass.

## Firebase Auth Gate

If deploy fails with `Authentication Error: Your credentials are no longer valid`, reauthenticate before retrying:

```bash
firebase login --reauth
firebase use urai-4dc1d
```

For a headless CI session, use a repository secret/service account as described in `docs/FIREBASE_SERVICE_ACCOUNT_SETUP.md`.

## Production Deploy

```bash
npm run deploy:firebase
```

Equivalent raw command:

```bash
firebase deploy --project urai-4dc1d --only hosting,functions,firestore,storage
```

## Live Smoke Test

```bash
npm run deploy:verify
```

Equivalent raw command:

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app npm run smoke:production-finalization
```

The smoke test must pass:

- `GET /api/health`
- `POST /api/assets`
- `GET /api/assets/{assetId}`
- `POST /api/lifemap/events`

## Full Combined Command

Use this only after Firebase auth and project access are confirmed:

```bash
npm run deploy:production
```

## Current Known Deploy Failure and Fix

Observed failure:

```text
Authentication Error: Your credentials are no longer valid. Please run firebase login --reauth
Error: Assertion failed: resolving hosting target of a site with no site name or target name.
```

Repo-side fix applied:

- `firebase.json` now sets the explicit Hosting site: `urai-4dc1d`.

Operator-side fix required:

```bash
firebase login --reauth
git pull origin main
npm run deploy:production
```

## Final Lock Procedure

Only after local verification, Firebase deploy, and live smoke tests pass:

1. Update `docs/PRODUCTION_VERIFICATION_REPORT.md` with:
   - deployed commit hash
   - deploy timestamp
   - Firebase deploy output summary
   - hosting URL
   - health response
   - asset intake/status smoke output
   - Life Map ingestion smoke output
2. Update `LOCK.md` to `STATUS: PRODUCTION VERIFIED`.
3. Close Issue #53.

Do not update `LOCK.md` before live smoke tests pass.
