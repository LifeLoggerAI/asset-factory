# Asset Factory

Production-oriented monorepo for deterministic asset generation and Firebase processing pipelines.

The canonical Studio path uses deterministic local proof plus a governed multimodal provider broker:

- `graphic` -> local SVG proof or approved image provider candidate
- `model3d` -> local GLTF proof or approved 3D provider candidate
- `audio` -> local WAV proof or governed speech / SFX / music provider candidate
- `video` -> provider-backed candidate only; fake local motion cannot be promoted as canonical video
- `bundle` -> JSON bundle manifests
- STT -> separate authenticated audio/video upload route producing transcript provenance

Local proof remains intentionally deterministic so API contracts, manifests, usage metrics, storage paths, and E2E tests can run without external provider credentials. Paid provider selectors remain `local-proof` by default. Provider output is always a candidate until UrAi QA/promotion gates pass.

## Launch status

Asset Factory's production hardening, Model Forge, and multimodal provider work are converging through draft PR #284. The system is **not production-locked until `LAUNCH_READINESS.md` gates pass in staging and production with live evidence**.

Use `LAUNCH_READINESS.md` as the current source of truth for launch blockers, required secrets, staging/prod smoke commands, and definition of readiness. Use `docs/OPERATIONS_RUNBOOK.md` for deploy, smoke-test, monitoring, incident-response, rollback, and release-evidence procedures. Use issue #63 as the live production-lock tracker. Older historical lock/final-report documents are context only when they conflict with the launch-readiness checklist.

For repeatable AI-assisted repo audits and implementation passes, use `docs/ASSET_FACTORY_IMPLEMENTATION_AUDIT_PROMPT.md`. Keep it aligned with the launch-readiness contract by running `npm run test:implementation-audit-prompt` or the broader `npm run test:completion-lock` gate.

### Current production authority

Asset Factory is **not production-locked**.

Historical evidence exists for an older deployment on `urai-4dc1d`, but that project/site is shared consumer infrastructure and is not valid final Asset Factory production authority. Historical May release evidence remains useful only as historical proof.

Final production requires provider-generated dedicated authority supplied through the protected GitHub environment:

- `ASSET_FACTORY_FIREBASE_PROJECT_ID`
- `ASSET_FACTORY_FIREBASE_HOSTING_SITE`
- `ASSET_FACTORY_BASE_URL`
- `GCP_WIF_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

The guarded deploy path rejects `urai-4dc1d`, `asset-factory-dev-id`, their legacy Hosting origins, and `urai.app` as final Asset Factory production targets.

Do not use `uraiassetfactory.com` or `www.uraiassetfactory.com` as production proof until the dedicated provider origin is deployed first and the custom domain is attached to that verified target.

## Repo structure
- `engine/`: sealed headless V1 engine API/runtime.
- `functions/`: historical Node 18 Cloud Functions tree; non-deployable forensic history.
- `life-map-pipeline/functions/`: TypeScript Firebase Functions for LifeMap ingestion.
- `assetfactory-studio/`: web/studio app and canonical multimodal API/provider-broker surface.
- `model_forge/`: governed 3D candidate generation, Blender cleanup/review, GLB validation, inventories, wave manifests, and promotion receipts.
- `tools/blender/`: deterministic GLB finishing utilities that emit receipts without auto-promoting assets.
- `image_asset_generator/`: manifest-driven image asset loop for generate, validate, preview, and export.
- `docs/MULTIMODAL_ASSET_WIRING.md`: asset type, renderer, storage, provider, and E2E contract.
- `docs/OPERATIONS_RUNBOOK.md`: staging/production deploy, smoke, incident, rollback, and release evidence runbook.
- `docs/ASSET_FACTORY_IMPLEMENTATION_AUDIT_PROMPT.md`: automation-first repo audit and safe implementation prompt.
- `LAUNCH_READINESS.md`: current production launch gate checklist.

## Requirements
- Node.js 22.x for Studio/deploy workflow parity. Root packages still accept Node.js 20.19.0 or newer, but use Node 22 when validating the Studio/Firebase deployment path.
- npm 10.8.0 or newer.
- Java 21 for current Firebase emulator/CLI tooling.
- Firebase CLI (`npm i -g firebase-tools`) for emulators/deploy.
- Python 3.11+ for the image asset generator loop.

## Quick start

Recommended fail-fast setup:

```bash
unset NPM_CONFIG_PREFIX
nvm install 22
nvm use 22
node --version
node scripts/setup-local.mjs
```

The fail-fast setup installs the package workspaces used by the current repo gates. The committed `pnpm-lock.yaml` is the root dependency authority and security audit input.

Install root dependencies only when intentionally working on root-level Firebase packages:

```bash
ASSET_FACTORY_SETUP_INSTALL_ROOT_DEPS=true node scripts/setup-local.mjs
```

Manual setup, if you need to run each step yourself:

```bash
unset NPM_CONFIG_PREFIX
nvm install 22
nvm use 22
node --version
npm --prefix engine install
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
nvm install 22
nvm use 22
node scripts/setup-local.mjs
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

### Image asset generator loop
```bash
python -m pip install -r image_asset_generator/requirements.txt
python image_asset_generator/generate_assets.py
python image_asset_generator/validate_assets.py
python image_asset_generator/create_preview.py
python image_asset_generator/export_assets.py
```

This loop reads `image_asset_generator/manifest.json`, creates missing local proof PNGs, validates dimensions and RGBA requirements, builds a review gallery, and exports a ZIP bundle.

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
node scripts/check-legacy-functions-boundary.mjs
npm --prefix life-map-pipeline/functions run build
npm --prefix life-map-pipeline/functions test
python -m pip install -r image_asset_generator/requirements.txt
python image_asset_generator/generate_assets.py
python image_asset_generator/validate_assets.py
python image_asset_generator/create_preview.py
```

### Studio multimodal checks
```bash
cd assetfactory-studio
npm test
npm run e2e
```

The E2E suite exercises graphic, model3d, audio, and bundle jobs through generate -> materialize -> fetch -> publish -> approve.

### Preferred remote launch smoke checks

Use the manual GitHub Actions workflow whenever possible:

```text
Actions -> Deploy Asset Factory -> Run workflow
```

Sequence:

```text
staging / smoke_mode=readonly
staging / smoke_mode=both
production / smoke_mode=readonly
production / smoke_mode=both
```

The smoke workflow never deploys. Each selected protected environment must supply its own `ASSET_FACTORY_BASE_URL`.

Authenticated smoke requires:

```text
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

Production deployment is a separate `Asset Factory Production Readiness` workflow and additionally requires the dedicated project/site/base-URL and WIF variables listed above.

### Manual remote smoke checks

Run these only when debugging deployed staging/production targets with the correct secrets available locally or in CI.

```bash
ASSET_FACTORY_BASE_URL=https://staging.uraiassetfactory.com \
ASSET_FACTORY_API_KEY=$STAGING_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$STAGING_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=smoke-tenant-a \
ASSET_FACTORY_OTHER_TENANT_ID=smoke-tenant-b \
CRON_SECRET=$STAGING_CRON_SECRET \
npm run smoke:staging
```

Production smoke must use the provider-generated dedicated Asset Factory origin:

```bash
ASSET_FACTORY_BASE_URL=$VERIFIED_ASSET_FACTORY_PRODUCTION_BASE_URL \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_OTHER_BEARER_TOKEN=$PROD_ASSET_FACTORY_OTHER_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

Do not substitute `urai-4dc1d.web.app`, `asset-factory-dev-id.web.app`, or `urai.app`.

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

For read-only diagnostics checks on the dedicated provider origin:

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL=$VERIFIED_ASSET_FACTORY_PRODUCTION_BASE_URL \
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

For the image asset generator loop specifically:

- Keep `image_asset_generator/manifest.json` as the canonical image registry.
- Replace the local placeholder renderer while preserving the manifest and validation contract.
- Store approved renderer version, prompt version, content hash, approval status, and Firebase Storage path in the manifest before production lock.
- Run the `Image Asset Generator` GitHub Actions workflow for every PR that changes image generator files.

## Deploy notes

Preferred deployment path for the Studio/Firebase framework surface is the manual GitHub Actions workflow documented above and in `docs/OPERATIONS_RUNBOOK.md`.

Manual Studio deploy command, when debugging with configured Firebase credentials:

```bash
npm run deploy:studio
```

Other deploy scripts exist for explicit lower-level Firebase operations and should only be used with collision-risk review:

```bash
npm run deploy:firebase
npm run deploy:verify-readonly
npm run deploy:verify
npm run check:deploy-workflow
```

Ensure project, service account, and env are configured before deploy.

## Troubleshooting
- If npm reports `not compatible with the NPM_CONFIG_PREFIX environment variable`, run `unset NPM_CONFIG_PREFIX`.
- If npm reports `Unsupported engine` for packages requiring Node `^20.19.0`, upgrade with `nvm install 22 && nvm use 22`.
- If npm reports `Missing script`, run `npm run doctor` from the repository root and recover with `git fetch origin && git reset --hard origin/main` if your checkout is stale.
- If root setup reports missing root dependencies, continue with `node scripts/setup-local.mjs` unless you are intentionally working on root-level Firebase packages; use `ASSET_FACTORY_SETUP_INSTALL_ROOT_DEPS=true node scripts/setup-local.mjs` only for that case.
- If engine tests fail due to stale `db.json`/`users.json`, restore defaults and rerun.
- If Firebase build fails, verify Node version, Java 21, firebase-tools auth, and project selection.
- If Studio E2E fails to boot, verify Node 22, dependencies, and no conflicting process on port 3000.
- If provider mode fails, switch back to `ASSET_FACTORY_MEDIA_PROVIDER=local-proof` and confirm the proof pipeline is green first.
- If image asset validation fails, run `python image_asset_generator/generate_assets.py` first, then rerun `python image_asset_generator/validate_assets.py`.
- If `https://uraiassetfactory.com/api/system/health` or `/api/health` returns a 404 or the wrong product, do not repoint it to `urai-4dc1d`. First establish and verify the dedicated Asset Factory provider origin, then attach the custom domain using provider-generated instructions.
