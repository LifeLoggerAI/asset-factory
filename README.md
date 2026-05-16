# Asset Factory

Production-oriented monorepo for deterministic asset generation and Firebase processing pipelines.

The current canonical Studio path supports a local proof pipeline for four core modalities:

- `graphic` -> SVG proof assets
- `model3d` -> GLTF proof meshes
- `audio` -> WAV proof sounds
- `bundle` -> JSON bundle manifests

These local proof renderers are intentionally deterministic so API contracts, manifests, usage metrics, storage paths, and E2E tests can run without external provider credentials. Production provider adapters can be swapped in behind the same renderer contract.

## Launch status

Asset Factory is **not production-ready until `LAUNCH_READINESS.md` gates pass in staging and production**.

Use `LAUNCH_READINESS.md` as the current source of truth for launch blockers, required secrets, staging/prod smoke commands, and definition of readiness. Use `docs/OPERATIONS_RUNBOOK.md` for deploy, smoke-test, monitoring, incident-response, rollback, and release-evidence procedures. Older historical lock/final-report documents are context only when they conflict with the launch-readiness checklist.

### Current verified production surface

- Verified Firebase production API base: `https://urai-4dc1d.web.app`
- Verified production smoke evidence: `docs/release-evidence/2026-05-16-production-api-smoke.md`
- Verified Firebase deploy evidence: `docs/release-evidence/2026-05-16-firebase-deploy.md`
- Verified final local gate evidence: `docs/release-evidence/2026-05-16-final-local-gates.md`
- Known custom-domain API blocker: `docs/release-evidence/2026-05-16-custom-domain-blocker.md`

Do not use `https://uraiassetfactory.com` or `https://www.uraiassetfactory.com` as the API base until the custom-domain blocker is closed. Those domains currently do not prove the Firebase Hosting API rewrites for this repo.

## Repo structure
- `engine/`: sealed headless V1 engine API/runtime.
- `functions/`: Firebase Cloud Functions (legacy/root deployment set).
- `life-map-pipeline/functions/`: TypeScript Firebase Functions for LifeMap ingestion.
- `assetfactory-studio/`: web/studio app and canonical multimodal API surface.
- `docs/MULTIMODAL_ASSET_WIRING.md`: asset type, renderer, storage, provider, and E2E contract.
- `docs/OPERATIONS_RUNBOOK.md`: staging/production deploy, smoke, incident, rollback, and release evidence runbook.
- `LAUNCH_READINESS.md`: current production launch gate checklist.

## Requirements
- Node.js 20.19.0 or newer. Node 20.18.x is too old for current Studio dependencies.
- npm 10.8.0 or newer.
- Firebase CLI (`npm i -g firebase-tools`) for emulators/deploy.

## Quick start
```bash
unset NPM_CONFIG_PREFIX
nvm install 20.19.0
nvm use 20.19.0
node --version
npm install
npm --prefix engine install
npm --prefix functions install
npm --prefix life-map-pipeline/functions install
npm --prefix assetfactory-studio install
npm run doctor
```

If `npm run doctor`, `npm run test:launch-readiness`, `npm --prefix assetfactory-studio test`, or `npm --prefix assetfactory-studio run typecheck` reports a missing script, your local checkout is stale or you are not in the repository root. Recover with:

```bash
git fetch origin
git checkout main
git reset --hard origin/main
unset NPM_CONFIG_PREFIX
nvm install 20.19.0
nvm use 20.19.0
npm install
npm --prefix assetfactory-studio install
npm run doctor
```

## Environment
Copy and edit:
- `./.env.example`
- `engine/.env.example`
- `life-map-pipeline/functions/.env.example`
- `assetfactory-studio/.env.example`

Never commit real secrets.

For local Studio development, keep local proof mode enabled:

```bash
ASSET_FACTORY_FORCE_LOCAL=true
ASSET_FACTORY_MEDIA_PROVIDER=local-proof
```

Provider-backed rendering is configured later via the provider environment variables documented in `assetfactory-studio/.env.example`.

## Run locally

### Asset Factory Studio
```bash
cd assetfactory-studio
npm run dev
```

Then open the Studio and create a `graphic`, `model3d`, `audio`, or `bundle` job. The local proof flow is:

1. `POST /api/generate`
2. `POST /api/jobs/:jobId/materialize`
3. `GET /api/generated-assets/:file`
4. `POST /api/jobs/:jobId/publish`
5. `POST /api/jobs/:jobId/approve`

### Engine API
```bash
cd engine
npm start
```

### LifeMap functions build
```bash
cd life-map-pipeline/functions
npm run build
```

### Firebase emulator (functions package)
```bash
cd life-map-pipeline/functions
npm run serve
```

## Tests and validation

### Repo doctor
```bash
npm run doctor
```

The doctor checks Node/npm versions, `NPM_CONFIG_PREFIX`, required scripts, required files, Studio dependencies, and whether local `HEAD` matches `origin/main`.

### Full intended validation
```bash
npm run doctor
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
npm --prefix engine test
npm --prefix assetfactory-studio run lint
npm --prefix assetfactory-studio run typecheck
npm --prefix assetfactory-studio test
npm --prefix assetfactory-studio run build
npm --prefix assetfactory-studio run e2e
npm --prefix functions run build
npm --prefix functions test
npm --prefix life-map-pipeline/functions run build
npm --prefix life-map-pipeline/functions test
```

### Studio multimodal checks
```bash
cd assetfactory-studio
npm test
npm run e2e
```

The E2E suite exercises graphic, model3d, audio, and bundle jobs through generate -> materialize -> fetch -> publish -> approve.

### Remote launch smoke checks

Run these only against deployed staging/production targets with the correct secrets available locally or in CI.

```bash
ASSET_FACTORY_BASE_URL=https://staging.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$STAGING_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$STAGING_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=smoke-tenant-a \
ASSET_FACTORY_OTHER_TENANT_ID=smoke-tenant-b \
CRON_SECRET=$STAGING_CRON_SECRET \
npm run smoke:staging
```

Verified Firebase production API smoke uses the Firebase Hosting URL until the custom-domain blocker closes:

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

Use the custom domain only after DNS/Firebase Hosting attachment is verified:

```bash
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

For read-only diagnostics checks on the verified Firebase URL:

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
npm run smoke:website
```

For read-only diagnostics checks on the custom domain after the blocker closes:

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
npm run smoke:website
```

## Production notes

Before using real provider-backed rendering in production:

- Replace proof renderer internals with provider adapters behind `assetProviderAdapters.ts`.
- Move long-running generation to durable queue workers.
- Persist artifacts to Cloud Storage or equivalent using canonical storage paths.
- Enforce `ASSET_FACTORY_REQUIRE_AUTH=true` with real tenant membership/RBAC.
- Apply billing and quota checks per modality before queueing jobs.
- Run emulator-backed Firestore/Storage integration tests.
- Run the launch gates in `LAUNCH_READINESS.md`.
- Follow `docs/OPERATIONS_RUNBOOK.md` for release evidence, rollback, and incident response.

## Deploy notes
- Firebase Functions deploy from target package:
  - `cd life-map-pipeline/functions && npm run deploy`
- Root Firebase deploy and verification scripts:
  - `npm run deploy:firebase`
  - `npm run deploy:verify-readonly`
  - `npm run deploy:verify`
  - `npm run check:deploy-workflow`
- Ensure project, service account, and env are configured before deploy.

## Troubleshooting
- If npm reports `not compatible with the NPM_CONFIG_PREFIX environment variable`, run `unset NPM_CONFIG_PREFIX`.
- If npm reports `Unsupported engine` for packages requiring Node `^20.19.0`, upgrade with `nvm install 20.19.0 && nvm use 20.19.0`.
- If npm reports `Missing script`, run `npm run doctor` from the repository root and recover with `git fetch origin && git reset --hard origin/main` if your checkout is stale.
- If engine tests fail due to stale `db.json`/`users.json`, restore defaults and rerun.
- If Firebase build fails, verify Node version and `firebase-tools` auth/project selection.
- If Studio E2E fails to boot, verify Node 20.19.0+, dependencies, and no conflicting process on port 3000.
- If provider mode fails, switch back to `ASSET_FACTORY_MEDIA_PROVIDER=local-proof` and confirm the proof pipeline is green first.
- If `https://uraiassetfactory.com/api/health` returns a Next.js 404, do not rerun smoke expecting a different result. Attach the custom domain to Firebase Hosting site `urai-4dc1d` or proxy `/api/*` to `https://urai-4dc1d.web.app/api/*`, then rerun smoke.
