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

## Interpretation

The release workflow dispatch step is complete for all four production-lock phases:

1. staging / deploy=false / smoke_mode=readonly
2. staging / deploy=true / smoke_mode=both
3. production / deploy=false / smoke_mode=readonly
4. production / deploy=true / smoke_mode=both

This does not by itself prove production lock. Final lock still requires reading the resulting GitHub Actions runs, job logs, smoke artifacts, Firebase deploy evidence, provider-backed generation proof, tenant-isolation proof, Stripe proof, observability proof, and domain/TLS/legal proof.

## Next evidence to attach

Run IDs and artifacts should be collected with:

```bash
gh run list --repo LifeLoggerAI/asset-factory --workflow=deploy-asset-factory.yml --limit 20
```

For each relevant run:

```bash
gh run view <RUN_ID> --repo LifeLoggerAI/asset-factory --log
```

And if artifacts exist:

```bash
gh run download <RUN_ID> --repo LifeLoggerAI/asset-factory
```

## Lock rule

Only mark the Asset Factory completion lock as production-ready if the workflow logs and artifacts prove every required launch gate in `LAUNCH_READINESS.md`.
