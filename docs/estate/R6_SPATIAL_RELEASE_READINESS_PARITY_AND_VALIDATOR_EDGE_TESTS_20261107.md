# R6 — Spatial asset release eligibility and GLB validator parity (2026-11-07)

**PRODUCTION HOLD.** Incremental audit evidence for [Asset Factory draft PR #496](https://github.com/LifeLoggerAI/asset-factory/pull/496), independent of existing owner PR #421. **No generated model, source mutation, provider task, billable call, deployment, or production promotion.**

## Frozen sources

- Spatial main: `da94837c2457b0a7590e26a7a644cd728de8afb8` (rechecked unchanged).
- Asset Factory owner PR #421 head: `e7d23952bcaa21209ff2d964c81c533f905863ca` (rechecked unchanged).
- Audit R5 preceding head: `9511d8d987d79fe01144af480d91ab4205eee482`.
- Exact source blob hashes: `operations/assets/launch-critical-assets.json` `9e7030543fe7468a74edaecca5f3492405e3bae7`; `urai-tier1/src/spatial/assets/assetManifest.ts` `6de0e9308bebf6ea75a3c1ab18c1a6aa8ef935f5`; `urai-tier1/src/spatial/council/CouncilRealm.tsx` `f98f22d426c61acdc2c8a570c37ba192c53ba546`; `urai-tier1/src/spatial/layout/HomeWorldProduction.tsx` `158768f468963745578a8949a4137f52c8d973ec`; selected `HomeWorldProductionPolished.tsx` `e3769bb52c9c969fa7ab2bd4b0d5526068b1fcb6`.
- [Structured R6 source-parity register](manifests/R6_SPATIAL_RELEASE_STATUS_COMPRESSION_AND_VALIDATOR_PARITY_20261107.json) captures the 22 model statuses, eight ready-versus-pending overlaps, seven inspected raw GLB compression summaries, seven V4 receipt states, route bindings and tests.

## 1. Release status conflict: runtime readiness is not release approval

Exactly **22 model assets** under Spatial `operations/assets/launch-critical-assets.json` have `releaseState: pending-final-review`; its policy sets `candidateAssetsMayShip:false`, `readyModelsRequireCompression:true`, `readyAssetsRequireSha256:true`, `readyAssetsRequireLicenseRecord:true`, and `fallbackRequired:true`. In contrast, `urai-tier1/src/spatial/assets/assetManifest.ts` calls **eight matching final models `status: ready`**, selected by `resolveUraiSpatialAsset` without checking final-review/compression/license criteria. This is an **authority semantics mismatch**. Interpret `ready` as potentially *runtime loadable*, never as authority to ship. Do not silently change declarations in an audit PR.

The eight overlapping models are Home Entry Chamber, Portal Ring, Ground Terrain, Life Map Memory Star, Focus Memory Chamber, Replay Memory Environment, Orb Avatar, and Passport Status Room.

## 2. Compression requirement empirically absent for seven inspectable final GLBs

Directly reread the raw embedded GLB JSON from the exact Git blobs for **seven** of the eight final manifest models: all have **zero compressed mesh primitives**, **no `KHR_draco_mesh_compression` or `EXT_meshopt_compression`** in their required/used extension declarations, despite `requiredCompression: draco-or-meshopt` in the launch register. The seven range from 242,072 bytes to 740,640 bytes and collectively have 64 uncompressed glTF primitives. `home-entry-chamber-v1.glb` (1,786,808 bytes) remains raw-uninspected: **do not assume its compression status**.

These seven are real nonempty model bytes but **cannot meet the current compression prerequisite as recorded**. Other license/visual/performance gates are also unverified.

## 3. Seven V4 receipts and six canonical Council models remain previews

Independently read all **seven** `operations/assets/generated-receipts/*human-makehuman-v4.json`: every receipt explicitly says `releaseState: candidate-not-production-ready`, with `requiredCompression: draco-or-meshopt`. The canonical `CouncilRealm.tsx` hardcodes the **six Council V4 GLB paths** and preloads with `useGLTF`, using `useAnimations`. The Council error/capability path gives semantic `CouncilFallback` UI. Although receipts refer to V3 fallbacks, the active Council component does **not** load V3 models on model failure; distinguish **recorded fallback intent** from **implemented fallback execution**. Browser/device execution and six V4 raw binaries remain untested.

Home's canonical composition reexports `HomeWorldProductionPolished`, directly referencing Home Entry Chamber, Orb, and the Poly Haven-labelled fern geometry—not a V4 human. A recorded Home V4 model is not proof of live embodiment.

## 4. Actual exact-source validation divergence

Previous R5 recovered and verified exact Git objects for `model_forge/glb-container.mjs` `0c01290d89730fec92e5af4c0a350e4d4807cfd2`, `triangle-budget.mjs` `0f3b1383f8420b36181f71d9071ffc6eb811a38b`, and `validate-glb.mjs` `a91538dc260d237870a7dbc0159dafd7f7be27cd`. **R6 executed 35 local Node v22.16.0 test assertions, 35 PASS / 0 FAIL**, including malformed GLB headers/chunks, missing data, embedded-only source policy and triangle budgets. The tests are **R6-authored local probes**, not a claim that the original repository `scripts/test-model-forge-glb-container.mjs` fully ran.

A synthetic GLB with `extensionsRequired:["EXT_not_a_real_supported_extension"]` returned **exit 0** from the current exact-source standalone `validate-glb.mjs`; the standalone parser only verifies chunk/embedded ranges and triangle budget, then prints that required extension in its report. Meanwhile `model_forge/forge.mjs` **separately implements an allowlist in `structuralCandidateReport`** and rejects unknown required extensions. This is a concrete **policy divergence**: standalone success should not be treated as full Forge intake acceptance or production signoff. This is not evidence of actual asset exploitation, just fail-open acceptance in an approval-adjacent CLI. Recommend aligning the same required-extension allowlist across both entrypoints with shared code and negative tests, on the owner's branch after review.

## 5. Unverified binary access and CI

Spatial main contains **24 tracked GLB paths**. R3/R4 verified **16** paths as raw Git-equivalent bytes; **eight** remain uninspected: seven V4 MakeHuman models plus Home Entry Chamber. Attempts to access >1 MB binaries through GitHub Contents returned empty inline bytes; GitHub Git-blobs/raw routes reject non-UTF8 bytes; local container DNS resolution for GitHub failed. Google Drive exact-title searches returned reference documents, not raw copies. **This is an inspection access limit, not evidence that a Git-tracked asset is absent or defective**.

The complete original owner source test suite, full frozen-install build, official Khronos validation, Blender rendering, CI on live runners, mobile/XR device acceptance, visual authority, asset licensing, and memory privacy/deletion E2E remain unverified. Previous GitHub Actions failure outcomes and unavailable logs are not counted as passing CI.

## 6. Next actions and disposition

1. Owner engineers should reconcile runtime `ready` vs release-approved and create **explicit, enforceable asset release admission** for all 22 model entries; do not conflate existence, runtime loading and release eligibility.
2. Resolve compression/LOD policy for seven raw-verified final models; validate visual quality, licenses and device budgets before any approval.
3. Obtain proper binary-capable read-only access to the remaining eight GLBs and run 17-joint/five-clip tests, binary hashes, compression inspection and WebGL playback.
4. Harmonize standalone and Forge required-extension rejection logic in one source-of-truth helper with original-source tests; re-run frozen CI when runners permit.
5. Distinct Legacy GLB is preserved in Drive (R4), but must be visually approved and integrated by the Spatial owner before replacing Focus duplicate.
6. Hold asset promotion and Genesis release until actual cross-system Privacy–Jobs–Studio–Replay, authorization, consent, deletion, licensing, device and production acceptance are demonstrated.

**No production status changes have been performed. This report is evidence, not certification or a request to merge another worker's PR.**
