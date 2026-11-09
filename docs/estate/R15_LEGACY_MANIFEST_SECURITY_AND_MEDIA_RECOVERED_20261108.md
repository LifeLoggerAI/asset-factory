# ONE URAI GENESIS — Asset Factory R15 forensic continuation

**Disposition: REVIEW ONLY / GENESIS PRODUCTION HOLD**  
**Observation window:** 2026-11-07 Central / 2026-11-08 UTC  
**Ownership:** `LifeLoggerAI/asset-factory`; cross-repository source in `LifeLoggerAI/UrAi`, `UrAiProd`, `urai-spatial` and the private Labs master index.  
**Published changes:** none. Existing owner PRs #421, #493, #494 and audit PR #496 were not modified, merged or deployed. A prior GitHub write was declined; it was not retried. No paid provider requests, GPU jobs, prohibited media downloads or production changes occurred.

## Read this first: what is and is not proved

R15 adds **actual exact-source isolated executable tests**, complete legacy-path Git metadata registers, an independently reproduced manifest/public-tree mismatch, and a sanitized privacy risk review. It **does not** certify the 28 original MP4s as playable video, the 47 nonzero historical GLBs as structurally valid, licensing, or current deployment. The repository's Git blob SHA-1 is object identity, **not** independent raw-file SHA-256. Filename, Git mode, source script, provider receipt, historic QA report, or source-level check is never enough to declare production approval.

This report is additive to R14 and Factory PR #496 `docs/estate/`, particularly R2 canonical image crosswalk, R3–R5 GLB custody, R9/R11/R13 proposed promotion safety gates, and the original R1 provenance/license matrix. The R14 handoff archive is bundled here for continuity.

## Immutable source anchors

| Source | Exact source / Git blob |
| --- | --- |
| Factory main | `a49f611ade29a1754787701ab4bf915c85c0cdc6` |
| Factory owner draft #421 | `e7d23952bcaa21209ff2d964c81c533f905863ca` |
| Factory composite draft #494 | `09fb062643cbad7cd0576fb85bb05d2db97d7d49` |
| Factory forensic draft #496 | `21154eb50c312a1846bcf5b229fdc7ad1a3154a0` |
| Spatial main | `da94837c2457b0a7590e26a7a644cd728de8afb8` |
| Original UrAi main | `8cac3ba513830c11261d57bc2b5dd7ad8b83e85a` |
| UrAiProd main | `d3d7ce6e607a5ee1be2c9f9ede6eecf1cfb393b9` |
| Original UrAi `scripts/check-genesis-assets.mjs` | `5eaf22988811b81dbfcb409ee9be98abd38d085a` |
| Original UrAi `scripts/verify-assets.mjs` | `866e8706f5d5eb61dee74046306eb136976a2fc7` |
| Original UrAi `package.json` | `e20dc0995d3dbd00d27c57960e33cfc3ac486eec` |
| Original UrAi `.husky/pre-commit` | `695a60479ff621ce5740226cffc2e8652dac8597` |
| UrAiProd `manifest/glb_manifest.json` | `50882be2da7be53be41e5f03646b4ad95894a796` |
| UrAiProd `scripts/audit-urai-asset-runtime.mjs` | `4a57062a17ae9617d261c8cb6d63aabf5f971fb1` |
| UrAiProd `generate-manifest.mjs` | `df8ffae49783bc210e62f237cf104d44b8e3ad78` |
| UrAiProd `tools/organize-assets.sh` | `a5aaa08e5c0dc4c1e2833f1c84019350ada9eacf` |

## R15-A: 23 original Genesis asset slots missing, while checker returns success

From nontruncated original `UrAi` Git tree, parsed all 23 literal `requiredAssets` in `scripts/check-genesis-assets.mjs`: **0/23 present**. Separate `scripts/verify-assets.mjs` has **4/4 critical fallback files present** and **0/7 optional asset files present**. These are two different assertions; four fallback assets cannot stand in for the 23 final Genesis assets.

Byte-for-byte copy of `scripts/check-genesis-assets.mjs` created locally and verified with `git hash-object` exactly equalling blob `5eaf22988811b81dbfcb409ee9be98abd38d085a`. Running this source in an empty isolated temp directory produced **23 missing messages and exit code 0**. It intentionally sets `process.exitCode = 0` for incomplete assets. Therefore, a successful execution of this checker **does not certify completion**. The original `package.json` has no `assets:ci` or `assets:validate` script, while `.husky/pre-commit` invokes both; `.github/workflows/assets-ci.yml` skips generation/validation if `assets:ci` is missing. No complete native Actions run was executed here.

Safe recommendation: keep local preview fallbacks distinct from a fail-closed release check. Only the owner should decide whether to change the historical checker or quarantine it; the newer canonical Spatial system has separate V1–V5 acceptance. Do not silently promote the old fallback slots into current Genesis authority.

## R15-B: old manifest generator executable failure and local proposed repair

The source at `UrAiProd/generate-manifest.mjs` was copied exactly and checked by `git hash-object` = `df8ffae49783bc210e62f237cf104d44b8e3ad78`. An isolated run with one harmless synthetic JSON record produced `ReferenceError: None is not defined` (exit 1). The generator writes a **partial `assets.registry.json`** first and fails before writing `assets.registry.ts`, because its template uses `JSON.stringify(reg, None, 2)` rather than JavaScript `null`.

A **review-only, one-line diff** changes `None` to `null` (SHA-256 of patch `214dadc481803ed5c7c923f3cd63a09f639ae6b989352328fce4ae16c7ee2974`). In the isolated test, the proposed version exited 0 and wrote both registry artifacts. No original repository was changed. This is **legacy tooling maintenance**, not proof of current release activity, build success, or binary correctness. The source search found no current package-script invocation of that legacy generator.

## R15-C: historical UrAiProd GLB manifest/public-tree mismatch, now path-register exact

The UrAiProd 2025-09-17 `manifest/glb_manifest.json` defines **73 records, 72 distinct `/models/...glb` URL identities, 54 LOD groups covering those 72 identities**, and one duplicate `reticle_flat_LOD0` record. The frozen `UrAiProd` Git source contains **56 GLB paths / 7,781,952 declared bytes**, of which 47 are nonempty and nine are zero-byte. No file is under `public/models/`, which is the declared manifest root. Thus **0/73 declared source public paths exist in this tree**. For 17 *manifest records* (16 unique basenames), a same-named source GLB exists elsewhere under `models/` or `blender/models/`. Such a matching basename **is not** proof of a public URL or successful build-copy process.

The original `scripts/audit-urai-asset-runtime.mjs` scans and verifies `/assets/urai/...` references. Its `collectManifestRefs` encounters GLBs, but the manifest-ref loop only adds URLs beginning `/assets/urai/` to the checked `refs` map. **Its output can count the GLB manifest yet fail to enforce these 72 `/models/...` URLs.** This limitation is source-verified; an exact-head public deployment was not probed. The historical `tools/organize-assets.sh` moves/renames assets and rehomes GLBs under `/public/assets/glb` / `/public/assets/3d`, **not** the manifest's `/public/models`; do not execute it during custody forensics.

A new no-network `r15_manifest_path_guard.py` checks immutable local Git trees and source manifest URLs without modifying the repo. Its **16/16 synthetic regression assertions passed**, including duplicate URLs, symlink substitution, zero-byte GLBs, misplaced same-basename candidates, LOD gaps, unsafe paths, source SHA pinning and strict gate failure. This tool has **not** been executed on a full original Git clone, which was unavailable due to blocked GitHub DNS/UTF-8-only connector binary access. The connected GitHub metadata crosswalk is captured in `URAI_R15_LEGACY_PROD_GLB_CROSSWALK.json` and `.csv` with **73 rows**; matching actual source metadata is in `URAI_R15_LEGACY_PROD_GLB_GIT_METADATA.tsv` with **56 rows**.

## R15-D: original UrAi video preservation register is now path-level and integrity-checked

`URAI_R15_ORIGINAL_VIDEO_GIT_METADATA.tsv` and `URAI_R15_ORIGINAL_VIDEO_GIT_REGISTER.json` contain **all 35 `.mp4` paths**, fixed `UrAi` source SHA, per-path Git blob IDs, exact declared sizes and modes. Classification is **28 substantial nonempty regular media blobs / 317,151,186 bytes**, four zero-byte files, and three symlinks. The three link-target strings were independently read from Git blobs in R14. The videos are candidate background/sky/ground visual sequences, **not** an accepted launch hero film. Actual MP4 bytes, SHA-256, codecs, duration and visual content were not inspected.

A second source, `UrAi/docs/URAI_VIDEO_LAUNCH_AUDIT_2026-05-15.md` blob `fef8be28a932aac89671e4151224c7d884c07ac4`, describes a separate **30.37-second / 30-FPS** historical demo video audit, but the reviewed UUID-named binary was not found in the current inspected Git tree or by an exact Drive filename search. **A review receipt is not custody; this source movie still needs location/rehash before reusing or claiming it exists.** Negative Drive name search is not a complete all-folder proof of absence.

The original `UrAi` main asset manifest `URAI_ASSET_MANIFEST` uses static fallback images for Home/Ground, and text-based code search found no direct hardcoded import of the individual 28 environment MP4 filenames beyond three symlink targets. These may be historic reusable media, not proven current runtime route footage; dynamic URL construction and external deployments remain unverified.

The media TSVs were manually transcribed from two independently fetched nontruncated GitHub tree snapshots and cross-checked against fresh connector-side FNV-1a 32-bit fingerprints: video `43fe4345` (35 rows), GLB `3583e3b6` (56 rows), manifest path order `f43d3024` (73 lines). These fingerprints check **metadata transcription only**, are noncryptographic, and do **not** establish raw binary SHA-256 or source execution.

## R15-E: P0 possible private-reference metadata exposure

The GitHub repository metadata reports `LifeLoggerAI/UrAiProd` as **public**. It holds **three** Git-tracked files under `private-canon/life-reference/`, totaling **20,428 declared bytes**. One JSON index self-classifies as `private-life-reference-canon`; its metadata contains Drive identifier fields and an email-like token using a non-example domain. Two additional person-specific motion/production records are in the same public tree and contain source/Drive identity fields. **Private media content was not fetched or reproduced** in this handoff; the potentially identifying actual values and filenames are intentionally withheld.

This is a **P0 privacy/permission review trigger**, **not** a claim that private media is publicly downloadable or that credential contents are leaked. The owner and Privacy worker must decide whether the identifiers are intended public metadata, require access revocation, or require history-aware containment. No public pull request, disclosure, issue, release artifact, or log should copy the values. Do not assume removing a file from one tip erases its public Git history.

## R15-F: stale production/asset authority conflict is preserved as historical

`UrAi/docs/final-asset-lock/PROMOTED_SPATIAL_MODEL_AUTHORITY.md` blob `98a0bc5c4c0aa7fa324d8dc95dba755b9e330951` asserts prior Home/Orb/portal model SHA-256 and Home production readiness. Factory R12 and R14 document that the current Spatial Home model differs from the earlier approved small binary (current path: 1,786,808 Git-declared bytes; previous receipt: 184,160 bytes). **Do not transplant previous visual or deployment authorization onto a different binary.** Re-establish current exact byte SHA-256, codec validation, LOD/skin/audio/XR/device proofs and independent review.

## R15 tests performed — no paid/external execution

| Test | Evidence | Result | What it does not prove |
| --- | --- | --- | --- |
| Exact old Genesis checker test | Git blob identity matched; 23 missing, exit 0 | **EXPECTED DEFECT REPRODUCED** | Current Spatial build/release behavior |
| Exact old manifest generator test | Git blob identity matched; `ReferenceError: None is not defined`, exit 1 | **EXPECTED DEFECT REPRODUCED** | Current Factory Model Forge failure |
| One-line generator proposal | One synthetic asset, exit 0, both registries emitted | **PASS** | Production integration |
| New manifest path guard | 16 fixture assertions | **16/16 PASS** | Real historical GLB raw bytes |
| R14 offline Git-object inspector rerun | 16 fixture assertions | **16/16 PASS** | Real MP4/GLB decoding |
| Static 35/56/73 metadata register consistency | FNV-1a independently matched connector metadata | **PASS** | Media SHA-256 or rights |
| Provider/account task history | Not requested because authenticated account task inventory still lacks delegated access | **NOT RUN** | Task expiry/custody |
| Native CI, browser/XR and production | Not run | **HOLD** | Release readiness |

## Exact next worker tasks, preserving prior owners

1. **P0 privacy**: privately review the three public `private-canon` files with the Privacy/security owner. Assess identifiable metadata and linked permissions; redact/contain only under authorized, history-aware plan. Do not mirror source content into public audit artifacts.
2. **P0 evidence custody**: on authorized immutable local checkouts, hash and inspect the 28 original MP4s and 47 nonempty original UrAiProd GLBs. Use the bundled Inspector, official Khronos validator and ffprobe/ffmpeg, with no regeneration; collect source SHAs, full SHA-256, format, duration, geometry/skin/animation and rights.
3. **P0 current consumer**: finish raw inspection of eight still-uninspected current Spatial GLBs, independently accept current Home bytes, verify canonical 213 image visuals, 36 additional WebPs, nine mapped Opus files and 51 same-byte legacy placeholders; check actual routes and mobile/XR performance.
4. **P0 governance**: source-owner review the R9/R11/R13 promotion proposals together; ensure GLB official validation + codec decoding + extension/kind coherence + immutable receipt + missing source refusal + protected CI. Avoid conflict with Factory #421, #493, #494, and #496.
5. **P0 historical manifest**: decide whether UrAiProd `manifest/glb_manifest.json` is inactive legacy or intended ship input. If active, fix source->public copy and correct path contract with fail-closed official validator; only then consider visual/rights approval. Do not run destructive `tools/organize-assets.sh` for audit.
6. **P1 historical tools**: repair the old optional registry generator one-line `None` bug only if its owner wants to reuse it. Separate preview fallback from strict final image certification; do not reinterpret old `check-genesis-assets` success as a current build certification.
7. **P0 provider deadline**: read-only Meshy account/task enumeration through authenticated owner account before retained API-output windows lapse. Distinguish web-app retention, Premium cancellation date November 25, and Tripo V2.5/segmentation deprecation December 1, 2026; no paid generation.
8. **P1 film**: locate the historically reviewed May demo UUID video and any full current hero-film master without assuming that empty historical clip paths or storyboard receipts are finished media. Preserve source rights/music/likeness permissions.
9. **P0 final integration**: proof of Privacy -> authorized Factory -> Studio -> Jobs -> owner-only Replay/Storytime with consent/grant/revocation/deletion, then real protected device deployment, rollback and human visual sign-off.

## Source/custody boundaries and latest disposition

- There is **no blanket proof of every historical branch commit, Git LFS object, provider task, private Drive folder, external 278,133,223-byte generic-world ZIP, or all original media bytes**. The older Factory PR #496 and Labs #262 contain broader path registers but not all raw SHA-256 hashes.
- Current Factory `main` differs from owner PR #421, Tripo V3 adapter remains a draft integration, and prior CI failures contain zero executed steps; no native exact-head green exists from this pass.
- Local byte-level source tests verify only two UTF-8 **scripts**. No actual binary model/video was downloaded or decoded in R15.
- No protected/private media, provider credentials, paid API outputs or public sensitive identifier values have been copied into this handoff.

**R15 outcome: legacy-source false-success and generation defects reproduced; video/GLB Git metadata registers completed; historical GLB URL defect confirmed; possible privacy metadata exposure flagged. Full current runtime integration, rights, GLB/MP4 decoding and production remain HOLD.**
