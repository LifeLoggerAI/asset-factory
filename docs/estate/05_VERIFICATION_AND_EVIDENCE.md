# Asset Factory — provenance-specific verification matrix R1

Each row separates a directly inspected GitHub metadata/source fact, a historical execution claim, and work not run in R1. **No tests, live providers, remote downloads, deployments or billing operations executed in this R1.**

| Claim | Exact source / receipt | Scope | State |
| --- | --- | --- | --- |
| Main Git tracked files and byte sizes | `a49f611ade29a1754787701ab4bf915c85c0cdc6` complete nontruncated recursive REST tree | 1,546 blob paths / 111,876,455 declared bytes | OBSERVED TREE METADATA |
| #421 / #493 / #494 / #495 tracked tree coverage | SHAs `e7d23952`, `31053530`, `09fb0626`, `a244e8f0` | paths, modes, blob IDs and sizes; no blanket byte rehash | OBSERVED TREE METADATA |
| All branch names | `BRANCH_REFS.json` 476 branch heads, 462 unique head SHAs | refs only, not 476 scanned histories | OBSERVED |
| 36 proof raster/GLTF objects | same Git blobs at all five snapshots | existence of named Git objects, not final 3D and not shader/device run | OBSERVED |
| Spatial 24 GLB + 301 WebP | Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8` tree | tracked files exist and have nonzero declared bytes; current deployed readback unknown | OBSERVED TREE METADATA |
| Image V1–V5 historic generation | Drive `URAI All-Asset Completion Program — Live Execution Receipt — 2026-07-29`, PRs #208/#213/#214, Spatial #1007 | task/CI/artifact ledger, 213 assets historically reported; R1 did not download historical workflow artifacts | HISTORICAL WORKER RECEIPT |
| 26 saved model SHA-256 matches | Drive `UrAi-Meshy-Preservation-Report-20261104.html` | dated 11/04 direct-read verified 26 / 68,094,300 bytes; 17 matching Drive manifests; R1 did not repeat byte hashing | HISTORICAL VERIFIED REPORT |
| Generic world 96 GLBs | `model_forge/generic-worlds/v1/evidence/staging-summary.json` | recorded archive hash/file counts, archive unavailable; assetComplete/visualAccepted/runtimeIntegrated false | HISTORICAL REPORTED BINARY CUSTODY, UNVERIFIED NOW |
| Model Forge dry-run and Tripo V3 regressions | `docs/production/tripo-v3-integration-20261104.md` | worker reports 376/376 local source tests at earlier exact owner SHA; no real paid provider call | HISTORICAL ISOLATED SOURCE TEST |
| #489 GLB packaging transport regression | Factory PR #489 | worker reports 529 local and native previous SHA pass; no physical asset/runtime proof | HISTORICAL TEST |
| #490 input preservation regression | Factory PR #490 | worker reports 26 source tests/21-model semantic fixture, no new producer outputs | HISTORICAL TEST |
| #493 security tests | Factory PR #493 | worker reports engine 40/40, legacy V1 13/13, JWT 4/4 on isolated candidate | HISTORICAL ISOLATED SOURCE TEST |
| Current native #421 Model Forge job | `https://github.com/LifeLoggerAI/asset-factory/actions/runs/41792983444`; job 126450425709 | `failure`, `runner_id:0`, **zero steps**; failure is host/account admission, not a test failure | EXECUTION BLOCKED |
| Current native #494 proof job | `https://github.com/LifeLoggerAI/asset-factory/actions/runs/41910744926`; job 126857318968 | `failure`, `runner_id:0`, **zero steps** | EXECUTION BLOCKED |
| Full current integrated provider and production | `LAUNCH_READINESS.md`, issue #63, `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` | dedicated auth, tenancy, provider output, queue, Stripe, retention, website, monitor, rollback, current protected deployment not complete | PRODUCTION HOLD |

**No test transplant:** an earlier green 376-case source suite or July 213-image ledger cannot certify successor `09fb0626` or production deployment. Failure with 0 steps is an infrastructure/account CI blocker, not a syntax/test failure. Re-run only once original runner admission is legitimately restored; do not work around protected release requirements. Do not authorize new paid provider calls in evidence collection.
