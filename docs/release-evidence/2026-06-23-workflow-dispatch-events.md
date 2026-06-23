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

## Run IDs observed

`gh run list --repo LifeLoggerAI/asset-factory --workflow=deploy-asset-factory.yml --limit 20` showed the new workflow_dispatch runs:

```text
28016651307
28016636174
28016620673
28016609782
```

## Run result

All four new workflow runs reached the same blocker:

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

## Patch applied after failure

Commit `2c92bf36a74f6a4114459c1a899b4e92dd257d90` updated `package.json` so `npm run verify:local` is self-contained for the workflow runner:

```text
corepack enable && corepack prepare pnpm@9.15.9 --activate && npm run image:install && npm run build && npm test --if-present && npm run test:launch-readiness --if-present && npm run test:completion-lock --if-present && npm run image:check
```

Reason: `verify:local` depends on `pnpm` for workspace build/test, and the image pipeline depends on Pillow from `image_asset_generator/requirements.txt`.

## Interpretation

The release workflow dispatch step is complete for all four production-lock phases:

1. staging / deploy=false / smoke_mode=readonly
2. staging / deploy=true / smoke_mode=both
3. production / deploy=false / smoke_mode=readonly
4. production / deploy=true / smoke_mode=both

The first run set did not prove production lock because every run stopped at the local verification gate before deploy, secret validation, smoke testing, provider-backed generation, tenant-isolation proof, Stripe proof, observability proof, or domain/TLS proof.

## Required rerun after patch

Dispatch the four workflows again on main after commit `2c92bf36a74f6a4114459c1a899b4e92dd257d90`:

```text
staging / deploy=false / smoke_mode=readonly
staging / deploy=true / smoke_mode=both
production / deploy=false / smoke_mode=readonly
production / deploy=true / smoke_mode=both
```

Do not mark Asset Factory complete until the rerun passes the local verification gate and reaches deploy/smoke evidence.

## Next evidence to attach

Run IDs and artifacts should be collected with:

```bash
gh run list --repo LifeLoggerAI/asset-factory --workflow=deploy-asset-factory.yml --limit 20
```

For each relevant run:

```bash
gh run view <RUN_ID> --repo LifeLoggerAI/asset-factory --log
```
