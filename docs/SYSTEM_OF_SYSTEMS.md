# Asset Factory System of Systems

Asset Factory is the production control plane for URAI / LifeLogger asset generation and Life Map event wiring.

## Subsystems

### 1. Hosting Surface

Firebase Hosting serves `public/index.html` as the live production shell. The page identifies the deployed service and exposes the API routes used for readiness checks.

### 2. HTTPS API Functions

Firebase Functions expose:

- `GET /api/health` via `assetFactoryHealth`
- `POST /api/assets` via `createAssetRequest`
- `GET /api/assets/{assetId}` via `getAssetStatus`
- `POST /api/lifemap/events` via `ingestLifeMapEvent`

### 3. Asset Intake

`createAssetRequest` validates project, asset type, identity, format, prompt, tags, dimensions, and source. It writes a durable request to `assetFactoryRequests`, a queue item to `assetFactoryQueue`, and a manifest to `assetManifests`.

### 4. Queue and Lifecycle

`assetFactoryQueue` records the durable work item. Lifecycle states are intentionally explicit: requested, queued, processing, rendered, stored, published, failed, and archived.

### 5. Metadata and Manifest Layer

Asset metadata is typed in `life-map-pipeline/functions/src/lifemap.types.ts`. The metadata includes asset IDs, user or anonymous session identity, project IDs, asset type, format, lifecycle status, storage path, prompt, tags, dimensions, and version.

### 6. Life Map Pipeline

`ingestLifeMapEvent` accepts symbolic events. The Firestore trigger `processLifeMapEvent` appends those events into the user Life Map, sorts chapters, increments the version, and recalculates a deterministic content hash.

### 7. Firestore Security

`firestore.rules` protects tenant, job, asset request, queue, Life Map, usage, dead-job, billing, and system metric records. Public read access is limited to public manifests, public assets, and system status.

### 8. Storage Security

`storage.rules` isolates authenticated user assets, anonymous session uploads, public published assets, and profile images. A final deny-all rule protects every unrecognized path.

### 9. CI/CD

`.github/workflows/production-readiness.yml` runs install, build, tests, and launch readiness on pull requests and main. Production deployment is manual, exact-main-only, protected by the `asset-factory-production` environment, and uses GitHub OIDC -> Google WIF with provider-proven dedicated Asset Factory target values. The shared consumer project `urai-4dc1d` is rejected.

### 10. Verification

Production is not considered complete until these pass:

1. Root install succeeds.
2. Functions install succeeds.
3. TypeScript build succeeds.
4. Tests and launch readiness checks succeed.
5. Firebase deploy succeeds.
6. Hosting URL loads.
7. `/api/health` returns `ok: true`.
8. Asset request endpoint queues an asset.
9. Asset status endpoint returns that asset.
10. Life Map event ingestion accepts an event and the Firestore trigger updates the Life Map.

## Environment and Secrets

Required deployment identity configuration:

- `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` for short-lived WIF impersonation.
- `ASSET_FACTORY_FIREBASE_PROJECT_ID`, `ASSET_FACTORY_FIREBASE_HOSTING_SITE`, and `ASSET_FACTORY_BASE_URL` for the dedicated target.

Long-lived Firebase tokens and service-account JSON are prohibited.

Optional runtime environment:

- `ASSET_FACTORY_ALLOWED_ORIGIN` — CORS origin. Defaults to `*` until narrowed for production.
- `GIT_SHA` — deployment version override if the hosting/deploy pipeline provides it.

## Finalization Rule

Do not mark the repo as production verified unless the verification report includes live URLs, endpoint outputs, successful CI/build/test evidence, and Firebase deployment evidence.
