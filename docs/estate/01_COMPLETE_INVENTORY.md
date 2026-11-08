# Asset Factory — source-pinned inventory R1

**Observed:** 2026-11-07 America/Chicago. **Status:** TREE-METADATA INVENTORY, NOT ALL-BYTE CERTIFICATION. **Git scope:** `LifeLoggerAI/asset-factory` at five immutable candidate commits. See [MANIFEST.json](MANIFEST.json) for individual tracked paths, modes, Git blob SHA-1s, and Git-declared bytes. See [BRANCH_REFS.json](BRANCH_REFS.json) for **476** accessible branch names and current branch-head SHAs, **462** unique heads including this audit branch at creation time.

| Source | Immutable commit SHA | Git blobs | Git-declared bytes | Recursive tree truncated? |
| --- | --- | ---: | ---: | --- |
| main | `a49f611ade29a1754787701ab4bf915c85c0cdc6` | 1,546 | 111,876,455 | No |
| Factory owner PR #421 | `e7d23952bcaa21209ff2d964c81c533f905863ca` | 1,726 | 113,540,036 | No |
| Owner + security composite PR #494 | `09fb062643cbad7cd0576fb85bb05d2db97d7d49` | 1,733 | 113,563,716 | No |
| Security PR #493 | `3105353064d389373b9c792894c78e0e1171158a` | 1,553 | 111,900,135 | No |
| Genesis starter PR #495 | `a244e8f06cffcf34db323d50c148a129e8300cf0` | 1,547 | 111,878,773 | No |

**Do not total these rows as unique bytes/files.** The same blobs recur between commits. The owner vs main has 180 newly tracked paths, 98 changed blobs, zero deletions. One `Google.geminicodeassist-2.69.0.vsix` archive occupies **100,859,904 bytes** of main, and is not UrAi production media. Main `_audit/` has 730 tracked files / 6,327,994 declared bytes. Owner includes `model_forge/` (97), `image_asset_generator/` (58), `film_foundry/` (11), `launch-films/` (6), `manifests/` (17), `outputs/` (7), `scripts/` (137) scoped paths.

**Physical media actually in owner Git tree:** 14 PNG + 14 WebP + 8 glTF proof files, **36 objects / 4,705,580 declared bytes**; unchanged among all five source snapshots. No tracked `.glb`, `.blend`, `.fbx`, `.obj`, `.wav`, `.mp3`, or `.mp4` in owner tree. Local rendered proof glyphs / minimal `.gltf` do not establish a production 3D asset. Other non-media SVGs, caption `.srt` and `.vtt`, fixtures and metadata also exist. Some proof images are duplicated by blob SHA. Each specific path, size and SHA is enumerated in MANIFEST.

**Prompts != output bytes.** `image_asset_generator/manifest.json` has 47 entries, all `status=prompted`; its source V2/V3/V4/V5 manifests contain 14/14/13/13 prompted entries. The *distinct canonical release* contract in `docs/contracts/CANONICAL_VERSION_ASSET_CONTRACT.md` defines V1 53, V2 80, V3 14, V4 39, V5 27 = 213 required output identities, not 213 Factory-local produced binaries.

**Externally retained, historical independently checked records:**
- A 2026-11-04 Google Drive preservation report `UrAi-Meshy-Preservation-Report-20261104.html` records **26 saved GLBs, 68,094,300 bytes**, including **17/17** Drive-manifest SHA-256 matches and nine further read-and-hashed models. Those files were NOT re-downloaded and SHA-256 rehashed in this R1, and some are also tracked in Spatial, so do not sum them with Spatial media. No provider-only Meshy task count is known.
- `model_forge/generic-worlds/v1/evidence/staging-summary.json` records external archive `UrAi_Generic_World_Library_1.0.2.zip`, **278,133,223 bytes**, claimed SHA-256 `468bd4fe6c59b9cdae6cb02cdb8d8237d4ce8110324061954297572880f1a8f8`, 657 entries, 96 GLBs, 90 previews. Archive not in this Git tree and was **not located in the accessible Drive search**. Historical archive identity is not present custody. `NEEDS_REWORK`, `runtimeIntegrated=false`, `visualAccepted=false`, `xrCertified=false`, `productionDeployed=false`.
- July 2026 source-linked paid V1–V5 images and GitHub Actions historical artifacts are reported in the Drive `URAI All-Asset Completion Program — Live Execution Receipt`. Retention was finite, not assumed accessible today. Spatial main supplies an independent present Git-tracked media reality, below.

**Cross-repository tree metadata:** `urai-spatial/main` `da94837c2457b0a7590e26a7a644cd728de8afb8`: 8,927 files / 379,199,014 declared bytes; 490 media entries / 151,884,639 bytes (24 GLBs, 20 glTF, 301 WebPs, 63 PNGs, 20 JPGs, 51 WAVs, 11 MP3s). Specifically 249 nonzero WebPs under `urai-tier1/public/assets/urai/` total 78,659,572 bytes. `urai-studio/main` `854477d80b1a7aa718edb60d1ed4c1cf22dbed9d`: 751 tracked files, zero direct tracked named-media extensions. `urai-storytime/main` `73f586a0a2931961ae221af7cfc0caf1b6aef39d`: 306, zero direct named-media extensions. `urai-content/main` `988ca4f7f38b1ce86e4d3f426361b5866fd23e0d`: 388, two zero-byte PNG placeholders. These are tree metadata, **not runtime or rights acceptance**.

**Unknown/uninspected**: Git history union, all other branch trees, unreachable objects, actual GLB internals (bones/animations/PBR), all non-selected raw Git blob bytes, LFS payload retrieval, all external private media and temp outputs, remote provider task pages, exact generated asset archives and current release deploy. SHA-256 is deliberately null on Git-only metadata rows; Git blob SHA-1 is NOT a content SHA-256. No raw secret, source private-person media, or provider-billed action was accessed.
