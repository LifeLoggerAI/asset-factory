# Firebase Service Account Setup

Asset Factory is already production verified from local authenticated deployment. This document is now the CI deployment setup guide for GitHub Actions.

## Current Verified Production Baseline

- Firebase project: `urai-4dc1d`
- Hosting URL: `https://urai-4dc1d.web.app`
- Production lock: `LOCK.md` is `STATUS: PRODUCTION VERIFIED`
- Verification evidence: `docs/PRODUCTION_VERIFICATION_REPORT.md`

CI deploy is a post-production automation hardening item. Production status does not depend on CI until the team chooses to make GitHub Actions the deploy path.

## Required GitHub Secret

Create this repository secret:

```text
FIREBASE_SERVICE_ACCOUNT
```

The value must be the full JSON service account key for Firebase project:

```text
urai-4dc1d
```

Do not commit this JSON file to the repository.

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
2. Install engine dependencies.
3. Install legacy Functions dependencies.
4. Install deploy Functions dependencies.
5. Run doctor/readiness scripts.
6. Build Functions.
7. Run tests.
8. Run non-blocking audit reporting.
9. Deploy hosting, functions, Firestore rules, and Storage rules to `urai-4dc1d`.
10. Run production-finalization smoke tests against `https://urai-4dc1d.web.app`.

## Required Passing Smoke Tests

The CI deploy is not considered verified unless all of these pass:

- `GET /api/health`
- `POST /api/assets`
- `GET /api/assets/{assetId}`
- `POST /api/lifemap/events`

## Expected Failure Modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Workflow says `FIREBASE_SERVICE_ACCOUNT secret is not configured` | Secret is missing or named incorrectly | Add repository secret named exactly `FIREBASE_SERVICE_ACCOUNT` |
| Firebase deploy permission error | Service account lacks one or more deploy roles | Add least-privilege Firebase/GCP deploy roles listed above |
| Smoke test fails after deploy | Runtime or hosting rewrite regression | Do not update lock; inspect workflow logs and rerun local `npm run deploy:verify` |
| Audit step reports low findings | Known post-production dependency hardening item | Keep audit non-blocking unless runtime-reachable high/critical findings appear |

## Final CI Evidence Update

After the first passing CI deployment:

1. Add the GitHub Actions workflow URL and smoke evidence to `docs/PRODUCTION_VERIFICATION_REPORT.md`.
2. Comment on Issue #56 with the passing workflow run link.
3. Close Issue #56.

Do not rotate or expose the service account JSON in issue comments, logs, screenshots, or docs.
