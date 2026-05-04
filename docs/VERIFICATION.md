# Asset Factory Verification Plan

Status: Draft, 2026-05-04

This checklist must pass before `www.uraiassetfactory.com` is considered production-ready.

## Local installation

```bash
npm install
npm --prefix functions install
npm --prefix life-map-pipeline/functions install
npm --prefix assetfactory-studio install
```

## Static verification

```bash
npm run check:runtime
npm run check:docs
npm --prefix functions run build
npm --prefix life-map-pipeline/functions run build
npm --prefix assetfactory-studio run typecheck
```

## Unit and local tests

```bash
npm --prefix functions test
npm --prefix assetfactory-studio test
npm --prefix assetfactory-studio run e2e
```

## Emulator tests to add and require

- Authenticated `createAssetJob` succeeds for active tenants.
- Unauthenticated `createAssetJob` fails with `unauthenticated`.
- Expired/inactive subscription fails with `permission-denied`.
- Duplicate `clientRequestId` reuses the original job.
- `processAssetJob` writes `generatedAssets`, `assetBundles`, `usageLedger`, and `auditLogs`.
- Generated bundle includes `manifest.json` and deterministic output hash.
- `exportAssetBundle` issues a signed URL with `ttlSeconds: 900` and writes `exportJobs`.
- `retryAssetJob` only retries `FAILED` or `DEAD` jobs.
- `cancelAssetJob` only cancels `PENDING` or `PROCESSING` jobs.
- Stripe webhook rejects unsigned requests when webhook secret is configured.
- Stripe webhook records `webhooks/{eventId}` and ignores duplicate event ids.
- Firestore rules reject cross-tenant reads and all client writes to ledgers/audits.
- Storage rules reject cross-tenant reads and all client writes to generated asset paths.
- Replay registration writes `replayJobs` and remains tenant-scoped.
- LifeMap ingestion writes `lifeMapInputs` and remains tenant-scoped.

## Staging deploy gates

```bash
firebase use <staging-project>
firebase deploy --only functions,firestore:rules,firestore:indexes,storage
npm --prefix assetfactory-studio run build
```

Post-deploy smoke checks:

1. Sign in with a test user.
2. Confirm the user has an active test tenant record.
3. Create a job.
4. Wait for processing.
5. Export the bundle.
6. Confirm the signed URL expires in 15 minutes.
7. Confirm usage ledger entry exists.
8. Trigger a duplicate Stripe event and confirm it is ignored.
9. Confirm the privacy page, trust page, support page, and account deletion/export flows are no longer placeholders.

## Production launch blockers

- CI red or skipped.
- Firebase deploy not verified against the target project.
- DNS or SSL unresolved for `www.uraiassetfactory.com`.
- Placeholder legal, privacy, security, billing, support, or account deletion/export pages.
- Any long-lived generated asset signed URL.
- Any route or rule allowing cross-tenant asset access.
- Any production-lock document claiming live/stable status without evidence from CI, staging deploy, and smoke tests.
