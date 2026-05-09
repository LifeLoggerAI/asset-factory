# Firebase Service Account Setup

Asset Factory production deployment is intentionally blocked until GitHub Actions has a Firebase deploy credential.

## Required GitHub Secret

Create this repository secret:

```text
FIREBASE_SERVICE_ACCOUNT
```

The value must be the full JSON service account key for Firebase project:

```text
urai-4dc1d
```

## Required Permissions

The service account must be able to deploy:

- Firebase Hosting
- Firebase Functions
- Firestore rules
- Storage rules

Recommended roles for the deploy account:

- Firebase Admin, or narrowly equivalent deploy permissions
- Cloud Functions Admin
- Cloud Build Editor
- Service Account User
- Firebase Hosting Admin
- Firestore Rules Admin / Firebase Rules Admin
- Storage Admin or Firebase Storage rules deploy equivalent

Use the least-privilege role set available in the Firebase / Google Cloud console.

## GitHub UI Path

1. Open `LifeLoggerAI/asset-factory`.
2. Go to `Settings`.
3. Go to `Secrets and variables`.
4. Open `Actions`.
5. Select `New repository secret`.
6. Name it exactly:

```text
FIREBASE_SERVICE_ACCOUNT
```

7. Paste the full JSON key as the value.
8. Save.

## Trigger Deployment

After the secret exists:

1. Go to `Actions`.
2. Open `Asset Factory Production Readiness`.
3. Select `Run workflow`.
4. Choose `main`.
5. Run it.

The workflow will:

1. Install root dependencies.
2. Install Firebase Functions dependencies.
3. Run doctor/readiness scripts.
4. Build Functions.
5. Deploy hosting, functions, Firestore rules, and Storage rules to `urai-4dc1d`.
6. Run production-finalization smoke tests against `https://urai-4dc1d.web.app`.

## Required Passing Smoke Tests

The deploy is not production verified unless all of these pass:

- `GET /api/health`
- `POST /api/assets`
- `GET /api/assets/{assetId}`
- `POST /api/lifemap/events`

## Final Lock Update

Only after a passing workflow and successful live smoke output should these files be updated:

- `docs/PRODUCTION_VERIFICATION_REPORT.md`
- `LOCK.md`

`LOCK.md` must stay `STATUS: NOT YET PRODUCTION VERIFIED` until live deploy evidence exists.
