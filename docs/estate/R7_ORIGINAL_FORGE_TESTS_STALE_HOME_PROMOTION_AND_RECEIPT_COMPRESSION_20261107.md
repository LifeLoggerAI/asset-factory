# R7 — Original Forge contract tests, stale Home promotion and compression-receipt contradictions

**Observed November 7, 2026 Central.** Additive source-pinned report for [Asset Factory draft PR #496](https://github.com/LifeLoggerAI/asset-factory/pull/496). **HOLD**: no production source, model binary, provider, deployment, payment or approval state was changed. This report supplements R1–R6 and preserves the independent owner PR #421.

**Source authority**: Asset Factory PR #421 head `e7d23952bcaa21209ff2d964c81c533f905863ca`; Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8`; R6 audit head `c1b6740a0f0fc856b24848f1c6557663da45e75c`. [Machine-readable R7 source/evidence register](manifests/R7_RELEASE_IDENTITY_COMPRESSION_RECEIPTS_AND_ORIGINAL_TESTS_20261107.json) supplies exact source hashes and seven model checksums without exposing any private Library models.

## 1. Original owner Model Forge GLB container contract **54/54 PASS**

Recovered exact `scripts/test-model-forge-glb-container.mjs` source from PR #421, locally verified `git hash-object = 36a5f688115bbae7af8fc2be7b69e28c72f3dfdc` against the repository blob. Three imported modules also had independently confirmed exact original Git IDs: `model_forge/glb-container.mjs` `0c01290d89730fec92e5af4c0a350e4d4807cfd2`, `model_forge/triangle-budget.mjs` `0f3b1383f8420b36181f71d9071ffc6eb811a38b`, and `model_forge/validate-glb.mjs` `a91538dc260d237870a7dbc0159dafd7f7be27cd`.

Ran `node --test scripts/test-model-forge-glb-container.mjs` with Node **v22.16.0**: **54 tests / 54 pass / 0 fail / 0 skipped**, ~584 ms. Cases include GLB header/chunk boundaries, invalid UTF8, Meshopt placeholders, missing geometry, embedded-only image/buffer rules and actual standalone CLI invocations. **Limitation:** This original test's Forge-intake checks execute the exact contiguous `parseGlbCandidate` / `structuralCandidateReport` excerpt copied from owner `model_forge/forge.mjs`, not the whole Forge application or a full checkout. Thus *original source test file and imported modules* are exact, but not a full original repository CI claim.

A separate **R7-authored** 27/27 local probe confirmed that the owner Forge intake accepts each of 26 privately retained saved models under its required-extension policy and rejects synthetic unknown required extensions. In contrast, the standalone CLI accepts that synthetic unsupported `extensionsRequired` value. Those 27 tests are independent probe evidence, not original-source unit-test cases or release certification. Do **not** publish private model filenames, bytes or individual private SHA-256.

## 2. Original promotion governance exists but approves a **different Home binary**

Spatial already has `scripts/verify-governed-asset-promotion.mjs`, `scripts/verify-aaa-asset-governance.mjs`, and `.github/workflows/governed-asset-promotion.yml`. Those inspect release declarations, reviewed file bytes/hashes and independent reviewers for production promotion. Preserve this existing governance instead of rebuilding it.

However, `operations/assets/promotion-decisions/home-entry-chamber-v1.json` (Git SHA-1 `56c63b7e0f79b944d3eba36b5424a9adbb4872bf`) and `operations/assets/production-receipts/home-entry-chamber-v1.json` (`bccd862d664aedd7b2f3d2894469ffd69f2808d8`) refer to a historically approved **184,160-byte** Home GLB with SHA-256 `b7bdced5a721598a9dfe592ee19da04d754d5b8b1d48b23cc44403a89b1ee529`, signed Aug 1. The current Git-tracked `home-entry-chamber-v1.glb` is **1,786,808 bytes** (Git SHA-1 `a691730494b3fc8374a3794ce3330d713c61326d`). Its current generated receipt records SHA-256 `73f2a49ed2cfd6cd7ae9baed7b3908d53e0cac75b9f36ff1b8be9654e3d3e2f2` and `candidate-not-production-ready`; the Aug 8 replacement rehearsal has `promote:false`, `humanReviewApproved:false`, `visualProofVerified:false`. The current launch registry says `pending-final-review`.

**Result:** The Aug 1 production decision/receipt **cannot authorize the newer replacement binary**; older approved measurements or visual evidence cannot be silently transferred across hashes. No fresh current Home binary raw-byte read was available, so current hash is a *recorded current candidate receipt*, not independently recalculated. The current tracked byte length and Git blob ID were confirmed from Git tree.

## 3. Seven current model receipts claim Meshopt, while actual binaries do not use it

R3 raw-retrieved, SHA-256-hashed and decoded all seven accessible final-model GLBs in Spatial. R7 reread the seven exact generated receipts. **7/7 receipt SHA-256 values correspond to those actual raw binary SHA-256 results**, but each receipt says `compressionStatus: "meshopt"` while each parsed glTF model has zero Meshopt-compressed bufferViews, zero Draco-compressed primitives and neither compression extension in `extensionsUsed` or `extensionsRequired`. The seven affected models are:

| Tracked model | Bytes | Actual GLB primitives | Receipt claims |
| --- | ---: | ---: | --- |
| Portal Ring Master | 242,072 | 6 | Meshopt |
| Ground Terrain | 740,640 | 12 | Meshopt |
| Life Map Memory Star | 373,236 | 11 | Meshopt |
| Focus Memory Chamber | 622,516 | 13 | Meshopt |
| Replay Memory Environment | 435,544 | 7 | Meshopt |
| Orb Avatar | 403,220 | 8 | Meshopt |
| Passport Status Room | 347,512 | 7 | Meshopt |

All seven are `candidate-not-production-ready` per generated receipts, and the launch register requires `draco-or-meshopt` for model release. This is a **content-vs-receipt mismatch**, not a mismatch of SHA-256 for the inspected bytes. A manifest/receipt-only test must never treat the word `meshopt` as proof that geometry is compressed. **Do not alter original receipts in place without a governed new evidence decision**. Home Entry Chamber is the eighth final runtime model and remains too large for the current GitHub binary connector; do not infer its current compression from this set.

## 4. Why "runtime ready" is not "production approved"

The Spatial runtime asset manifest labels eight final GLBs `ready`; `operations/assets/launch-critical-assets.json` puts **all 22 registered models** in `pending-final-review`. Its policy sets `candidateAssetsMayShip:false`, `readyModelsRequireCompression:true`, `readyAssetsRequireSha256:true`, `readyAssetsRequireLicenseRecord:true` and `fallbackRequired:true`. Runtime `resolveUraiSpatialAsset` checks selected asset status and fallback but does not dynamically consult approved production decision and current binary identity. Distinguish source-runtime loadability from owner release authorization.

The original governed promotion verifier is a **separate validation entrypoint**; its mere presence does not show that current main is permitted to ship those eight assets. There is one archived promotion decision in the inspected directory (Home), and that one refers to a superseded binary. No actual deployment or consumer device execution was tested in R7.

## 5. Next work (no spending / no silent source changes)

1. On the **Spatial owner’s own planned branch**, add an exact-current-byte and release-eligible check at a well-defined release boundary, unifying runtime readiness semantics, promotion decision and original asset identity; preserve existing fallback behavior and historical receipts.
2. Add **negative regression tests**: current Home replacement is denied prior to new independent approval, a receipt claiming Meshopt without extension geometry is denied, unknown required extensions fail standalone and actual Forge consistently, and a valid historical approved binary cannot be reused to approve different bytes.
3. Resolve actual Meshopt/Draco compression and evidence for seven readable final models; do not merely relabel receipts to claim completion. The 7 V4 Council candidates and current Home chamber require raw-binary access separately.
4. Run exact-source full CI/build on eligible GitHub runners and real browser/mobile/XR artifact visual acceptance; verify licensing and Privacy/Studio/Jobs/Replay owner and deletion chain before GO.
5. The saved 26-model custody/structural proof from R5 remains intact. Do not regenerate saved files or duplicate asset counts.

**R7 audit PR action:** evidence files only, no branch merge or deployment. **Genesis production HOLD.**
