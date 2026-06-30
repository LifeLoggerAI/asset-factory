# Asset Factory Production Lock Audit Proof

Timestamp: 2026-06-30T00:00:00Z
Repo: LifeLoggerAI/asset-factory
Default branch: main
Audited head observed by GitHub search/fetch: 6dbd7cb911b714807c020535cbdc5aab79b7f7b7
Audit commits applied during this pass:
- 52ac35d214ca9f7011f5c2292e95137b1404e326 - Harden asset approval tenant authorization.
- 36f7aa5e23435734aa7bacb532ea2e71e703e0fd - Verify full asset lifecycle in E2E smoke.

## Verdict

Status: PARTIAL / NOT PRODUCTION-LOCKED.

Asset Factory has a real deterministic local proof asset pipeline and a real Studio/API scaffold for multimodal asset lifecycle operations. It is not ready to claim production asset generation because live staging/production, real provider-backed generation, durable workers, Stripe entitlement persistence, observability, DNS/custom domain, legal/privacy, and final release evidence remain pending.

## Evidence basis

- README describes the deterministic local proof pipeline for graphic, model3d, audio, and bundle assets.
- LAUNCH_READINESS.md states repo-side hardening is complete for the current pass but live staging/production evidence is still required before production lock.
- image_asset_generator contains a manifest-driven deterministic PNG generation pipeline with validation, preview, Firebase seed, ZIP export, and SHA-256 validation reporting.
- Studio package exposes lint, typecheck, test, build, e2e, deploy validation, and production validation scripts.
- The documented E2E script was strengthened in this audit to exercise generate -> materialize -> fetch -> publish -> approve.
- The approval route was hardened in this audit to enforce tenant authorization with publisher-level role before approving assets.

## Safe fixes applied

1. Hardened `assetfactory-studio/app/api/jobs/[jobId]/approve/route.ts`:
   - now loads the existing asset,
   - rejects missing assets before reading body,
   - enforces `authorizeAssetRequest(req, existingAsset.tenantId, 'publisher')`,
   - then applies approval.

2. Strengthened `scripts/e2e-asset-factory.mjs`:
   - supports API key / bearer / legacy tenant headers for remote smoke use,
   - exercises all four canonical asset types,
   - verifies materialized artifact file extension,
   - fetches generated asset,
   - verifies publish,
   - verifies approve.

## Commands not executed in this environment

The local container could not resolve github.com, so a full clone/install/build/test execution was not possible from this runtime. GitHub connector inspection and direct file updates were used instead. Required verification remains:

```bash
npm run doctor
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
npm --prefix assetfactory-studio run lint
npm --prefix assetfactory-studio run typecheck
npm --prefix assetfactory-studio test
npm --prefix assetfactory-studio run build
npm --prefix assetfactory-studio run e2e
python -m pip install -r image_asset_generator/requirements.txt
python image_asset_generator/run_pipeline.py
```

## Production lock decision

Do not mark locked until fresh CI/local evidence plus staging/production smoke evidence is attached, including provider-backed generation and tenant isolation proof with local fallback disabled.
