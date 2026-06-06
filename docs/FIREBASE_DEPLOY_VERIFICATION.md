# Firebase Deploy Verification

This repo is considered release-ready only after both repo checks and live health verification pass.

## 1. Run release readiness

In GitHub Actions, run the manual workflow:

- `Asset Factory Release Readiness`

Use one of these live URL inputs only after a Firebase deploy exists:

- `https://urai-4dc1d.web.app`
- `https://urai-4dc1d.firebaseapp.com`

The workflow runs:

- production asset validation
- runtime spatial contract validation
- Firebase rules surface validation
- Firebase deploy preflight validation
- studio lint
- studio typecheck
- studio tests
- studio build
- Firebase Functions install
- Firebase Functions build
- optional live `/api/health` verification

## 2. Local release commands

From `assetfactory-studio`:

```bash
npm install
npm run validate:production
npm run check
```

From `life-map-pipeline/functions`:

```bash
npm ci
npm run build
```

## 3. Deploy

Deploy with Firebase credentials that can deploy project `urai-4dc1d`:

```bash
firebase deploy --project urai-4dc1d --only hosting,functions,firestore:rules,storage
```

## 4. Verify live health

From `assetfactory-studio`:

```bash
ASSET_FACTORY_LIVE_URL="https://urai-4dc1d.web.app" npm run verify:live
```

If needed, also test:

```bash
ASSET_FACTORY_LIVE_URL="https://urai-4dc1d.firebaseapp.com" npm run verify:live
```

## 5. Release rule

Do not mark the asset factory as live verified until one deployed URL passes `npm run verify:live`.
