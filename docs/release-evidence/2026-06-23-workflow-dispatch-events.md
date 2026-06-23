# Asset Factory workflow dispatch events — 2026-06-23

## Context

URAI Spatial was built, exported, deployed to Firebase Hosting project `urai-4dc1d`, and route-verified with HTTP 200 responses for:

- `/`
- `/home`
- `/ground`
- `/life-map`
- `/focus`
- `/replay`
- `/mirror`
- `/passport`
- `/status`

After that, the Asset Factory production-lock workflow was manually dispatched from Cloud Shell using GitHub CLI.

## Workflow dispatched

Workflow:

```text
deploy-asset-factory.yml
```

Repository:

```text
LifeLoggerAI/asset-factory
```

Branch/ref:

```text
main
```

## Dispatch commands executed

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=staging \
  -f deploy=false \
  -f smoke_mode=readonly
```

Result:

```text
✓ Created workflow_dispatch event for deploy-asset-factory.yml at main
```

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=staging \
  -f deploy=true \
  -f smoke_mode=both
```

Result:

```text
✓ Created workflow_dispatch event for deploy-asset-factory.yml at main
```

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=production \
  -f deploy=false \
  -f smoke_mode=readonly
```

Result:

```text
✓ Created workflow_dispatch event for deploy-asset-factory.yml at main
```

```bash
gh workflow run deploy-asset-factory.yml \
  -R LifeLoggerAI/asset-factory \
  -f environment=production \
  -f deploy=true \
  -f smoke_mode=both
```

Result:

```text
✓ Created workflow_dispatch event for deploy-asset-factory.yml at main
```

## Initial run IDs observed

`gh run list --repo LifeLoggerAI/asset-factory --workflow=deploy-asset-factory.yml --limit 20` showed the first new workflow_dispatch runs:

```text
28016651307
28016636174
28016620673
28016609782
```

## Initial run result

All four initial workflow runs reached the same blocker:

- checkout passed
- Node 22 setup passed
- Java 21 setup passed
- root/engine/functions/LifeMap/Studio dependency installs passed
- doctor gate passed
- launch readiness gate passed
- completion lock gate passed
- local verification gate failed
- deploy workflow gate skipped
- deployment target resolution skipped
- secret validation skipped
- Firebase deploy skipped
- read-only/authenticated smoke skipped
- release evidence artifact upload passed

## Patch applied after initial failure

Commit `2c92bf36a74f6a4114459c1a899b4e92dd257d90` updated `package.json` so `npm run verify:local` is self-contained for the workflow runner:

```text
corepack enable && corepack prepare pnpm@9.15.9 --activate && npm run image:install && npm run build && npm test --if-present && npm run test:launch-readiness --if-present && npm run test:completion-lock --if-present && npm run image:check
```

Reason: `verify:local` depends on `pnpm` for workspace build/test, and the image pipeline depends on Pillow from `image_asset_generator/requirements.txt`.

## Rerun commands executed after patch

The four workflow phases were dispatched again on patched `main`:

```text
staging / deploy=false / smoke_mode=readonly
staging / deploy=true / smoke_mode=both
production / deploy=false / smoke_mode=readonly
production / deploy=true / smoke_mode=both
```

The observed rerun IDs were:

```text
28017140102
28017149298
28017162054
28017184641
```

## Rerun result summary

The rerun cleared the previous local verification blocker across all inspected runs.

### `28017140102` — staging / deploy=false / smoke_mode=readonly

Result: failed at read-only smoke.

Passed gates:

- checkout
- Node 22 setup
- Java 21 setup
- dependency installs
- doctor gate
- launch readiness gate
- completion lock gate
- local verification gate
- deploy workflow gate
- deployment target resolution
- required secret validation

Skipped:

- Firebase CLI install
- Firebase Studio deploy
- authenticated smoke

Failed:

- read-only smoke against `https://staging.uraiassetfactory.com`

Artifact produced:

```text
asset-factory-staging-evidence-28017140102
```

### `28017162054` — production / deploy=false / smoke_mode=readonly

Result: failed at read-only smoke.

Passed gates:

- checkout
- Node 22 setup
- Java 21 setup
- dependency installs
- doctor gate
- launch readiness gate
- completion lock gate
- local verification gate
- deploy workflow gate
- deployment target resolution
- required secret validation

Skipped:

- Firebase CLI install
- Firebase Studio deploy
- authenticated smoke

Failed:

- read-only smoke against `https://www.uraiassetfactory.com`

Artifact produced:

```text
asset-factory-production-evidence-28017162054
```

### `28017149298` — staging / deploy=true / smoke_mode=both

Result: failed at required secret validation.

Passed gates:

- checkout
- Node 22 setup
- Java 21 setup
- dependency installs
- doctor gate
- launch readiness gate
- completion lock gate
- local verification gate
- deploy workflow gate
- deployment target resolution

Failed:

- required secret validation

Skipped:

- Firebase CLI install
- Firebase Studio deploy
- read-only smoke
- authenticated smoke

Artifact produced:

```text
asset-factory-staging-evidence-28017149298
```

### `28017184641` — production / deploy=true / smoke_mode=both

Result: failed at required secret validation.

Passed gates:

- checkout
- Node 22 setup
- Java 21 setup
- dependency installs
- doctor gate
- launch readiness gate
- completion lock gate
- local verification gate
- deploy workflow gate
- deployment target resolution

Failed:

- required secret validation

Skipped:

- Firebase CLI install
- Firebase Studio deploy
- read-only smoke
- authenticated smoke

Artifact produced:

```text
asset-factory-production-evidence-28017184641
```

## Interpretation after rerun

The code-side CI blocker was fixed. The workflow now reaches live release gates.

Remaining blockers are operational/live-environment gates:

1. `deploy=true` runs fail before deploy because required secrets are not fully available to the selected GitHub environment.
2. `deploy=false` read-only runs fail because the configured public health targets are not proving healthy yet:
   - `https://staging.uraiassetfactory.com`
   - `https://www.uraiassetfactory.com`
3. Asset Factory cannot be marked production locked until the above pass, followed by authenticated smoke, tenant isolation, provider-backed generation, queue/DLQ, Stripe, observability, DNS/TLS, rollback, and owner approval evidence.

## Required next fix

Update GitHub environment/repository secrets for both `staging` and `production` environments:

```text
FIREBASE_TOKEN
ASSET_FACTORY_API_KEY
ASSET_FACTORY_BEARER_TOKEN
ASSET_FACTORY_OTHER_BEARER_TOKEN
CRON_SECRET
```

Important: issue `#63` previously listed `FIREBASE_TOKEN`, `ASSET_FACTORY_API_KEY`, `ASSET_FACTORY_BEARER_TOKEN`, and `CRON_SECRET`; the workflow also requires `ASSET_FACTORY_OTHER_BEARER_TOKEN` for authenticated/both smoke so cross-tenant denial can be proven.

Then confirm `staging.uraiassetfactory.com` and `www.uraiassetfactory.com` resolve to the deployed Asset Factory health surface, or update the workflow target mapping to the correct live Firebase/App Hosting URLs before retrying.

## Required next commands

Inspect exact failing step logs:

```bash
gh run view 28017140102 --repo LifeLoggerAI/asset-factory --log | sed -n '/Read-only smoke/,/Authenticated smoke/p'
gh run view 28017162054 --repo LifeLoggerAI/asset-factory --log | sed -n '/Read-only smoke/,/Authenticated smoke/p'
gh run view 28017149298 --repo LifeLoggerAI/asset-factory --log | sed -n '/Validate required secrets/,/Install Firebase CLI/p'
gh run view 28017184641 --repo LifeLoggerAI/asset-factory --log | sed -n '/Validate required secrets/,/Install Firebase CLI/p'
```

After secrets and target URLs are fixed, rerun the four workflow phases.

## Rule

Do not mark Asset Factory complete until the reruns pass live smoke and the final release evidence file validates against `docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md`.
