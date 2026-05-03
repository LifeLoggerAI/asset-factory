# Asset Factory

Production-oriented monorepo for deterministic asset generation and Firebase processing pipelines.

## Repo structure
- `engine/`: sealed headless V1 engine API/runtime.
- `functions/`: Firebase Cloud Functions (legacy/root deployment set).
- `life-map-pipeline/functions/`: TypeScript Firebase Functions for LifeMap ingestion.
- `assetfactory-studio/`: web/studio app.

## Requirements
- Node.js 20.x (recommended for TypeScript/Firebase packages).
- npm 10+
- Firebase CLI (`npm i -g firebase-tools`) for emulators/deploy.

## Quick start
```bash
npm install
cd engine && npm install
cd ../life-map-pipeline/functions && npm install
```

## Environment
Copy and edit:
- `./.env.example`
- `engine/.env.example`
- `life-map-pipeline/functions/.env.example`

Never commit real secrets.

## Run locally
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

## Tests
```bash
cd engine
npm test
```

## Build checks
```bash
cd life-map-pipeline/functions
npm run build
```

## Deploy notes
- Firebase Functions deploy from target package:
  - `cd life-map-pipeline/functions && npm run deploy`
- Ensure project, service account, and env are configured before deploy.

## Troubleshooting
- If engine tests fail due to stale `db.json`/`users.json`, restore defaults and rerun.
- If Firebase build fails, verify Node version and `firebase-tools` auth/project selection.
