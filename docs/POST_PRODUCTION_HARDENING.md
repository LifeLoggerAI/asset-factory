# Post-Production Hardening Plan

Asset Factory is production verified on Firebase project `urai-4dc1d`. This document tracks non-blocking hardening work that should be handled after the production lock.

## Verified Baseline

- Hosting URL: `https://urai-4dc1d.web.app`
- Production smoke command: `npm run deploy:verify`
- Verified endpoints:
  - `GET /api/health`
  - `POST /api/assets`
  - `GET /api/assets/{assetId}`
  - `POST /api/lifemap/events`
- Production lock: `LOCK.md`
- Verification evidence: `docs/PRODUCTION_VERIFICATION_REPORT.md`

## Hardening Tracks

### 1. Dependency Audit Triage

Run:

```bash
npm run audit:all
```

Then classify findings into:

- runtime exploitable
- dev-only
- transitive dependency
- requires breaking upgrade
- false positive / accepted risk

Do not run `npm audit fix --force` directly on `main` without a branch and full deploy smoke test.

### 2. Lockfile Refresh

The Firebase predeploy command now uses `npm install` because the deploy Functions lockfile was stale after the Functions SDK upgrade.

Preferred follow-up:

```bash
npm --prefix life-map-pipeline/functions install
npm --prefix life-map-pipeline/functions run build
npm run verify:local
```

Commit the refreshed `life-map-pipeline/functions/package-lock.json` only after verifying deploy still passes.

### 3. Firebase SDK Warning Cleanup

Firebase CLI still reports that the Functions SDK appears outdated. Confirm installed versions with:

```bash
npm --prefix life-map-pipeline/functions ls firebase-functions firebase-admin
```

If the package-lock refresh resolves the warning, restore Firebase predeploy from `npm install` to `npm ci`.

### 4. Custom Domain Verification

The verified production URL is currently:

```text
https://urai-4dc1d.web.app
```

After DNS is configured, verify the custom domain with:

```bash
npm run deploy:verify-custom-domain
```

This runs a read-only health check against:

```text
https://assetfactory.app
```

### 5. CI Deploy Readiness

GitHub Actions deployment requires the repo secret described in:

```text
docs/FIREBASE_SERVICE_ACCOUNT_SETUP.md
```

After the secret is added, run the `Asset Factory Production Readiness` workflow manually once and compare its smoke output with the production verification report.

## Do Not Reopen The Production Lock For These Items

These tasks are non-blocking hardening items unless they break a verified production endpoint. `LOCK.md` should remain `STATUS: PRODUCTION VERIFIED` unless a live smoke regression is observed.
