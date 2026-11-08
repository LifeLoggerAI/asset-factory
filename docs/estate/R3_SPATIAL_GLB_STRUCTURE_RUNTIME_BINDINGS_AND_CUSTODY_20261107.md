# R3 — Spatial 3D bytes, consumer bindings, exact receipt hashes and structural evidence (2026-11-07)

**Audit lane:** [Factory review PR #496](https://github.com/LifeLoggerAI/asset-factory/pull/496) on `audit/genesis-asset-factory-forensic-r1-20261107`; no source, deployment, asset or provider mutations. **PRODUCTION HOLD.**

**Fixed sources:** Spatial `main` commit `da94837c2457b0a7590e26a7a644cd728de8afb8`, Git tree `da94837c2457b0a7590e26a7a644cd728de8afb8` (nontruncated). Factory owner #421 at `e7d23952bcaa21209ff2d964c81c533f905863ca`, source candidate still unmerged as of R2. Labs master registry review PR #262 at `3faa418c07d3b90348c547c0dabc12d71b6b9b9d`. Existing Factory R1/R2 unchanged. This report is **R3 incremental evidence**, not an all-history or release certificate.

## 1. Current GLB inventory and real raw-byte coverage

- **24 Git-tracked GLB paths / 32,801,288 Git-declared bytes / 23 distinct Git SHA-1 blobs**. All nonzero. Full exact path/blob/bytes in [R3 machine crosswalk](manifests/R3_SPATIAL_GLB_STRUCTURAL_CROSSWALK_20261107.json).
- **9 path payloads read as raw GitHub Contents base64**, exact decoded lengths matched tree bytes, independently hashed to **SHA-256**, and passed the stated *limited* GLB header/JSON/buffer-range/geometry-structure checks; **8 distinct readable blobs**. This includes the two paths sharing one Focus blob.
- **7/7 independently read models represented in `operations/assets/generated-receipts/urai-final-glb-pack-v1.json` have byte-for-byte SHA-256 equality with their August 8 receipts; no measured mismatch**. The home-entry model in that pack could not be independently read via this connector and is **NOT** part of that denominator.
- **15 larger GLBs metadata only**: 14 human model GLBs (7 V3 + 7 V4) and one `home-entry-chamber-v1.glb`. Representative >1 MB GitHub Contents API reads returned empty inline base64; GitHub binary blob fetch was UTF-8 rejected; unauthenticated container network unavailable. Previous generated model receipts include per-file SHA-256 and skin/animation claims but their **current raw bytes and geometry were not inspected in R3**.
- **Never add** 24 Spatial GLBs to the previously saved 26 models as though distinct; unknown overlaps remain.

| Model | Bytes in Git | Git blob SHA1 prefix | R3 inspection | Meshes / triangles / animation clips | Final-pack receipt |
| --- | ---: | --- | --- | --- | --- |
| `council-archivist-human-makehuman-v4.glb` | 1,708,944 | `e0017747c2c9` | metadata only | — | not compared |
| `council-builder-human-makehuman-v4.glb` | 1,709,412 | `1ed47c301e78` | metadata only | — | not compared |
| `council-guardian-human-makehuman-v4.glb` | 1,708,672 | `0a6435f6cf75` | metadata only | — | not compared |
| `council-guide-human-makehuman-v4.glb` | 1,708,924 | `9f95ef6d67ec` | metadata only | — | not compared |
| `council-mirror-human-makehuman-v4.glb` | 1,708,872 | `aca3e27e8dc6` | metadata only | — | not compared |
| `council-trickster-human-makehuman-v4.glb` | 1,708,876 | `5975d2bb7a1f` | metadata only | — | not compared |
| `home-human-makehuman-v4.glb` | 1,708,856 | `2391c15dda9a` | metadata only | — | not compared |
| `council-archivist-human-rigged-v3.glb` | 2,097,628 | `b2b559d1110c` | metadata only | — | not compared |
| `council-builder-human-rigged-v3.glb` | 2,231,980 | `d070f27ea940` | metadata only | — | not compared |
| `council-guardian-human-rigged-v3.glb` | 2,240,664 | `3dd98fd3d340` | metadata only | — | not compared |
| `council-guide-human-rigged-v3.glb` | 2,172,896 | `46d7f7dfa785` | metadata only | — | not compared |
| `council-mirror-human-rigged-v3.glb` | 2,116,432 | `086aeb38e365` | metadata only | — | not compared |
| `council-trickster-human-rigged-v3.glb` | 2,092,352 | `0122dae1583e` | metadata only | — | not compared |
| `home-human-rigged-v3.glb` | 2,133,052 | `f5d333c8434f` | metadata only | — | not compared |
| `focus-memory-chamber-v1.glb` | 622,516 | `0f5d5d6fdd87` | **read+SHA256** | 13 / 17,334 / 3 | matches current Aug 8 pack |
| `ground-world-terrain-v1.glb` | 740,640 | `74cf4b0e031d` | **read+SHA256** | 12 / 20,974 / 3 | matches current Aug 8 pack |
| `home-entry-chamber-v1.glb` | 1,786,808 | `a691730494b3` | metadata only | — | not compared |
| `legacy-archive-foundation-v1.glb` | 622,516 | `0f5d5d6fdd87` | **read+SHA256** | 13 / 17,334 / 3 | not compared |
| `life-map-memory-star-v1.glb` | 373,236 | `d05f68a50130` | **read+SHA256** | 11 / 8,770 / 3 | matches current Aug 8 pack |
| `passport-status-room-v1.glb` | 347,512 | `e05fd8451147` | **read+SHA256** | 7 / 7,878 / 4 | matches current Aug 8 pack |
| `portal-ring-master-v1.glb` | 242,072 | `da549c52e173` | **read+SHA256** | 6 / 3,816 / 7 | matches current Aug 8 pack |
| `replay-memory-environment-v1.glb` | 435,544 | `2e406ba7a2dd` | **read+SHA256** | 7 / 10,410 / 4 | matches current Aug 8 pack |
| `urai-orb-avatar-v1.glb` | 403,220 | `2427984ce9c4` | **read+SHA256** | 8 / 9,380 / 12 | matches current Aug 8 pack |
| `polyhaven-fern-02-geometry-v1.glb` | 179,664 | `23c6115a0d89` | **read+SHA256** | 4 / 6,232 / 0 | not compared |

**Readable GLB structural checks**: GLB2 header and declared lengths, JSON/BIN chunk positions, glTF asset version, embedded declared buffer range, every bufferView end within available bytes, accessor bufferView index bounds, mesh primitive references and estimated indexed triangle totals. Each of the 9 passes these checks. For all seven machine-verified pack members, triangles/clip names align with retained August 8 pack records. Embedded images and material counts are recorded in JSON crosswalk. The Poly Haven-labelled fern mesh has 4 meshes / 6,232 triangles but **zero embedded image records and zero material entries**; Home may apply its own materials at runtime, which still needs literal visual inspection. This check is not Blender, gltf-transform, GPU decode, detailed skinned rig validation or current-browser testing.

## 2. Specific contradiction: Legacy model is copied Focus content

`generated/models/legacy-archive-foundation-v1.glb` and `generated/models/focus-memory-chamber-v1.glb` have identical Git blob SHA `0f5d5d6fdd87d5b1b4b26ff067b88c4efea4f820`, identical computed SHA-256 `d0e8a2105927f5fc610f68edc907cbd100b8570253fab3ba942171136d54b79d`, same 13 meshes and 17,334 triangle estimate, and identical clips `Focus_Arrival`, `Focus_Breathing`, `Focus_Exit`. `urai-tier1/src/spatial/legacy/LegacyArchiveWorld.tsx` loads the misnamed Legacy path. **This does not independently establish a Legacy-specific environment**, and requires visual design review and new approved custody; do not silently call it a completed original scene.

## 3. Actual consumer binding tiers — not runtime proof

- **Canonical Council source binding:** `urai-tier1/src/app/council/page.tsx` imports `CouncilRealm`; `urai-tier1/src/spatial/council/CouncilRealm.tsx` selects six `human-makehuman-v4` URLs and calls `useGLTF` / `useAnimations` inside Canvas with accessible/WebGL fallback. The six models exist as tracked blobs, but R3 did **not** decode their 17-joint skins or five clips, nor open a live browser.
- **Canonical Home source binding:** `urai-tier1/src/app/template.tsx` mounts `HomeSpatialRuntimeLayer` → `AssetDrivenHomeWorld` → `HomeWorldProduction`, which **reexports `HomeWorldProductionPolished`**. That active selected source loads `home-entry-chamber-v1.glb`, `urai-orb-avatar-v1.glb`, and `polyhaven-fern-02-geometry-v1.glb`. It does **not directly load `home-human-makehuman-v4.glb`**. That Home human is referenced in alternate `PresenceRig.tsx` / `HomeWorldProductionSacred.tsx`, neither shown mounted by this canonical Home chain. The Home human's canonical route integration therefore remains **unproven**, despite model and receipt presence.
- **Ground/Life Map/Legacy:** `GroundSpatialWorldClean.tsx`, `LifeMapProductionWorld.tsx`, and `LegacyArchiveWorld.tsx` each directly call `useGLTF` with their tracked model. The last points to the duplicated Focus binary.
- **Shared asset layer:** `SpatialWorldAssetLayer.tsx` resolves promoted asset IDs and calls `useGLTF` for Home, Ground, Life Map, Focus, Replay and Passport under conditional phases; `SpatialWorldCanvas.tsx` embeds the layer. This proves component-level bindings but **does not** by itself prove that the canonical route used that layer at runtime.
- **V3 human rigs:** seven nonempty Git blobs and launch/promotion receipts exist, but this audit found no direct current canonical Council `useGLTF` binding to V3; Council loads V4 candidates instead. Do not present V3 as the visually displayed source without further evidence.

**Governance warning:** V4 human receipts (`operations/assets/generated-receipts/*human-makehuman-v4.json`) explicitly record `releaseState: candidate-not-production-ready` and required compression `draco-or-meshopt`; `operations/assets/launch-critical-assets.json` records `candidateAssetsMayShip:false`. Merely referencing these candidate GLBs in a source-rendering path does not authorize production shipping.

## 4. Model Forge validation and provider safety source

Factory owner #421 `model_forge/validate-glb.mjs` reads a candidate from disk, obtains SHA-256 with Node crypto, invokes `parseGlbContainer(..., {requireEmbeddedResources:true})`, checks the triangle budget and reports `structurally-valid-candidate-not-visual-authority`. `model_forge/glb-container.mjs` rejects truncated/misaligned/out-of-range chunk data and missing embedded buffer/image resources. `model_forge/forge.mjs` uses the `TRIPO_STABLE_MODEL='v3.1-20260211'` candidate and guarded paid-provider path. `model_forge/README.md` documents Blender clean-export/LOD, visual renders, human signoff and governed promotion. **These tests/scripts were source-inspected; no Node/Blender/Actions run executed here.** Historic V2/V3 provider and CI evidence remains R1/R2, not newly verified live generation.

## 5. External custody recheck

Authenticated Google Drive query for exact `UrAi_Generic_World_Library_1.0.2.zip` returned **0 results**; directly listed the known `UrAi Generic World Library` folder `1r4ApPjjaQgE9fqJwrXA4NvnExUN_SXEe` and again received **zero accessible children**. This neither proves deletion nor gives a retrievable 278,133,223-byte ZIP. The previously reported ZIP SHA-256 remains **historical metadata, not fresh raw verification**. Existing 17 Drive GLB metadata / 26 historical saved-model claims and Meshy policy correction remain as preserved in R2. No private GLB or provider task was downloaded or generated.

## 6. Exact next steps

1. Obtain user-authorized **read-only** access to raw 15 large public GitHub GLB bytes via an approved binary-capable route and run the same SHA-256/embedded geometry/skin/animation test; compare the 14 human generated-receipt hashes, 17-joint structure and five-clip contract.
2. Run the repository-native standalone `validate-glb.mjs`, gltf-transform validator, Blender skinned/mesh/UV/animation quality tests, and real-browser viewer with source-pinned artifacts. This R3's pure JS inspection is not equivalent.
3. Replace or explicitly approve the mismatched Legacy alias only after original visual design acceptance. Confirm whether canonical Home must show its V4 human; if so bind it in the **current selected Home composition** on a distinct owner branch with tests.
4. Validate assets used in actual Council/Home/Focus/Replay on the exact consumer head across mobile/XR, test fallbacks, resolve rights/CC0 source chain, compression/LOD and device budgets.
5. Recover Generic World archive from a permitted source and verify raw ZIP bytes/hash, then authenticate Meshy account/task inventory **read-only** before expiry risk; do not initiate paid generation.
6. Complete protected Studio/Jobs/Privacy/Replay source→output→revocation/deletion flow and independent release authorization. **HOLD** until verified.

**R3 operations:** no paid provider calls; no GPU or cloud compute; no production source/asset change; no deployment; no private media download. Created only audit documents on independent draft PR #496.
