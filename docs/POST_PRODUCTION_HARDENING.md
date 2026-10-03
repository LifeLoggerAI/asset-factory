# Historical Production-Slice Hardening Notes

The Firebase evidence referenced by this document is historical production-slice evidence. Current Asset Factory V200 remains **NOT LOCKED**. These notes must not be interpreted as proof of a current production lock; current authority is `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md`.

## Verified Baseline

- Hosting URL: `https://urai-4dc1d.web.app`
- Production smoke command: `npm run deploy:verify`
- Verified endpoints:
  - `GET /api/health`
  - `POST /api/assets`
  - `GET /api/assets/{assetId}`
  - `POST /api/lifemap/events`
- Historical lock/report references: `LOCK.md`, `docs/PRODUCTION_VERIFICATION_REPORT.md`
- Current completion authority: `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md`
- Current status: **NOT LOCKED**

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

## Current V200 Boundary

The historical Firebase slice does not create a current production lock. Do not change `LOCK.md` or the current completion contract to a production-locked state unless the present V200 lock conditions are independently evidenced. Missing provider, deployment, tenancy, billing, worker, observability, rollback, custom-domain, privacy/legal, or independent-review evidence remains blocking where applicable.
