# Asset Factory

Production-oriented monorepo for deterministic asset generation and Firebase processing pipelines.

The current canonical Studio path supports a local proof pipeline for four core modalities:

- `graphic` -> SVG proof assets
- `model3d` -> GLTF proof meshes
- `audio` -> WAV proof sounds
- `bundle` -> JSON bundle manifests

These local proof renderers are intentionally deterministic so API contracts, manifests, usage metrics, storage paths, and E2E tests can run without external provider credentials. Production provider adapters can be swapped in behind the same renderer contract.

## Repo structure
- `engine/`: sealed headless V1 engine API/runtime.
- `functions/`: Firebase Cloud Functions (legacy/root deployment set).
- `life-map-pipeline/functions/`: TypeScript Firebase Functions for LifeMap ingestion.
- `assetfactory-studio/`: web/studio app and canonical multimodal API surface.
- `docs/MULTIMODAL_ASSET_WIRING.md`: asset type, renderer, storage, provider, and E2E contract.

## Requirements
- Node.js 20.x (recommended for TypeScript/Firebase packages).
- npm 10+
- Firebase CLI (`npm i -g firebase-tools`) for emulators/deploy.

## Quick start
```bash
npm install
npm --prefix engine install
npm --prefix functions install
npm --prefix life-map-pipeline/functions install
npm --prefix assetfactory-studio install
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

### Full intended validation
```bash
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

## Production notes

Before using real provider-backed rendering in production:

- Replace proof renderer internals with provider adapters behind `assetProviderAdapters.ts`.
- Move long-running generation to durable queue workers.
- Persist artifacts to Cloud Storage or equivalent using canonical storage paths.
- Enforce `ASSET_FACTORY_REQUIRE_AUTH=true` with real tenant membership/RBAC.
- Apply billing and quota checks per modality before queueing jobs.
- Run emulator-backed Firestore/Storage integration tests.

## Deploy notes
- Firebase Functions deploy from target package:
  - `cd life-map-pipeline/functions && npm run deploy`
- Ensure project, service account, and env are configured before deploy.

## Troubleshooting
- If engine tests fail due to stale `db.json`/`users.json`, restore defaults and rerun.
- If Firebase build fails, verify Node version and `firebase-tools` auth/project selection.
- If Studio E2E fails to boot, verify Node 20, dependencies, and no conflicting process on port 3000.
- If provider mode fails, switch back to `ASSET_FACTORY_MEDIA_PROVIDER=local-proof` and confirm the proof pipeline is green first.
