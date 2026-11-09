# R18 — Actual Spatial GLB byte revalidation, hard access limit, and privacy-scope correction

**Observation:** 2026-11-08 Central / 2026-11-09 UTC. **Repository:** `LifeLoggerAI/asset-factory`; audit-only draft PR #497 stacked on forensic #496. **Classification: source/byte evidence only; ONE URAI GENESIS production HOLD.**

## 1. Immutable source anchors and audit limitations

- Spatial `LifeLoggerAI/urai-spatial` `main da94837c2457b0a7590e26a7a644cd728de8afb8` / recursive tree `cdf46dc08bde44d1473b5a358c4afee4dee7eb8b` (not truncated).
- Existing R3 byte crosswalk (Factory forensic draft #496): `docs/estate/manifests/R3_SPATIAL_GLB_STRUCTURAL_CROSSWALK_20261107.json`, Git blob `3028f2743e4114d73f614a4205355e3190d55a86`.
- Spatial release policy `operations/assets/launch-critical-assets.json`, blob `9e7030543fe7468a74edaecca5f3492405e3bae7`. Runtime registry `urai-tier1/src/spatial/assets/assetManifest.ts`, blob `6de0e9308bebf6ea75a3c1ab18c1a6aa8ef935f5`.
- This run used GitHub Contents `encoding:base64` to access **nine** smaller real GLB bytes, decoded them in memory, ran independent SHA-256 against known test vectors, checked actual file length against pinned Git metadata, checked GLB 2 magic/version and JSON/BIN chunk alignment, parsed GLB JSON and verified bufferView declarations against declared embedded buffer length. It was not full official Khronos glTF validation. No media copies, raw binary body, source personal records, private user imagery, provider task, paid API, or model output was made public.

## 2. Nine independent real binary readbacks

All **9/9** contents were nonempty, decoded successfully, matched exact Git-declared byte sizes and blob identities, computed SHA-256 **9/9 matching R3**, GLB2 header, exact total chunk/container length and zero bufferView-out-of-declared-buffer counts. The Focus and Legacy paths intentionally share one identical Git blob: there are **8 unique binaries across these nine paths**, not nine unique outputs.

| GLB short filename | Actual bytes | Independently recalculated SHA-256 | Meshes | Animations | Draco/Meshopt used |
| --- | ---: | --- | ---: | ---: | --- |
| `focus-memory-chamber-v1.glb` | 622,516 | `d0e8a2105927f5fc610f68edc907cbd100b8570253fab3ba942171136d54b79d` | 13 | 3 | NO |
| `ground-world-terrain-v1.glb` | 740,640 | `b5309b854729566efcc444db029458bd4193ed18e6c83199e164ca8cb3fb2b76` | 12 | 3 | NO |
| `legacy-archive-foundation-v1.glb` | 622,516 | `d0e8a2105927f5fc610f68edc907cbd100b8570253fab3ba942171136d54b79d` | 13 | 3 | NO |
| `life-map-memory-star-v1.glb` | 373,236 | `ae4a70d2964a69025e246e7c09394b674a3c9f7b4b44a014cde6e1bffe7e9efa` | 11 | 3 | NO |
| `passport-status-room-v1.glb` | 347,512 | `15f1f7634389994715e4f263eecf67731b52a8e9ef62a22eae889b6054213257` | 7 | 4 | NO |
| `portal-ring-master-v1.glb` | 242,072 | `5b751cc6e7caa9667d48e4860e76a7b39f6cf84a60afb252497a19f323bb19c5` | 6 | 7 | NO |
| `replay-memory-environment-v1.glb` | 435,544 | `fbc58c40c3b7ee18025e605aee72dfd97988747d169b923f690b363a409362b3` | 7 | 4 | NO |
| `urai-orb-avatar-v1.glb` | 403,220 | `06b21ff93a2221a6367fb8b8e305a0453cb151d3a92194445d72e4d48d6c7708` | 8 | 12 | NO |
| `polyhaven-fern-02-geometry-v1.glb` | 179,664 | `9e3d29b1f917ec9f6e72f713fc7131f1d413ffecfbd3c96e7d72f92529f31a87` | 4 | 0 | NO |

These are **fresh byte identity and basic structure confirmations** of previously investigated files, not nine newly discovered models. Seven named release-core models among them require `draco-or-meshopt` by policy but do not declare either required geometry compression extension. The fern is CC0-labelled and not part of those seven required-compression core model records. Actual rights provenance and visual materials remain unapproved. R3's older result is independently corroborated, not superseded.

## 3. Current larger binary access remains unresolved

The full exact Spatial tree lists **24 nonzero GLB paths** with **23 distinct Git blob identities** and **32,801,288 Git-declared bytes**. Prior R4/R5 already validated seven V3 rigs using saved overlapping external copies, so the **eight remaining current Spatial GLB paths** requiring fresh source-blob inspection continue to be:
- seven `generated/human-makehuman-v4/*.glb` paths of roughly 1.7 MB each;
- `generated/models/home-entry-chamber-v1.glb` at **1,786,808 bytes**.

Connected GitHub Contents reads for representative Home and V4 with `encoding:base64` return **empty inline content**; `fetch_blob` returns UTF-8 decode errors for binary bodies. The container's direct GitHub Git transport cannot DNS resolve `github.com`. **These files are tracked and nonempty in Git metadata, but their raw bytes are not accessible through this session's path.** No missing/invalid binary defect may be inferred. Their current SHA-256, GLB internals/17-joint/five-animation contract, skin/audio, compression and render quality remain **unverified**.

## 4. Release policy conflict remains, without mutation

At fixed Spatial main:
- The launch policy has `candidateAssetsMayShip:false` and `readyModelsRequireCompression:true`; all 22 listed model assets are `releaseState:pending-final-review`.
- The runtime registry `assetManifest.ts` assigns `status:'ready'` to eight final GLB entries. It selects their paths without checking that pending final-review, codec, rights and exact visual approval gates have passed.
- The release artifact auditor treats missing compression on `pending-final-review` models as a warning, and escalates when marked `production-ready`. Its `ok` result for candidates cannot be used to approve a public release; acceptance requires a separate hard shipping gate.
- Existing R9/R11/R13 proposals remain unmerged and require owner review. No new competing promotion controller is created here.

## 5. R17 preserved handoff and privacy correction

- Local R17 ZIP CRC passed; **15/15 archived manifest SHA-256/length checks passed**. The recovered fixed-candidate suites reran from the saved scripts: **11/11 R17 negative/positive assertions**, **16/16 manifest guard**, **16/16 Git media inspector**.
- The review-only R17 patch stored on #497 reproduces the local patch size 1,994 bytes after its missing terminal context line was restored, but is **not installed as release code**.
- **Important evidence correction:** two new direct GitHub metadata reads (`get_repo` and REST GET `/repos/LifeLoggerAI/UrAiProd`) report that `LifeLoggerAI/UrAiProd` is **currently PRIVATE** (`private:true`). Previous R15/R17 public-tree/public-exposure descriptions were therefore too strong. The personal-reference metadata still exists and deserves a confidential authorized permissions/history review, but public accessibility was **not established**. A correction was added to **private Labs issue #283**. No identifying values are published here or in the correction. Historical past visibility is unknown.

## 6. Exact next continuation

1. Obtain an authorized binary-capable immutable source checkout for the eight larger Spatial GLBs, or equivalent exact bytes already available through an approved repository/file connector. Rerun source-object Git identity, raw SHA-256, glTF validator, geometry, 17-joint skin and 5-clip contract against the current immutable SHA. Never use a different saved model as an unlabelled substitute.
2. Confirm **actual production runtime composition** and import for Home/Council/Focus/Replay, rather than treating GLB existence or alternate component refs as proof of live render.
3. Owner-review and unify R9/R11/R13 format/receipt/type gates with the existing artifact audit, actual official Khronos / real Meshopt/Draco decode, and hard launch admission on original protected CI.
4. Validate CC0/third-party graphics and source records, privacy consent, cross-service Studio→Jobs→Replay deletion and physical device/XR quality; obtain independent review and literal AAA+++ signoff.
5. Check original MP4 and UrAiProd GLB media using an authorized local media checkout with `ffprobe`/official glTF validator; trace actual deployment packaging. Provider task/expiry read-only only. No paid generation, account or deployment mutation.

**R18 final classification: 9/9 accessible historical Spatial GLB path bytes independently reverified; eight larger current Spatial GLBs remain raw-uninspected; no release governance, media-rights, production integration, or live/device certification gained. ONE URAI GENESIS PRODUCTION HOLD.**
