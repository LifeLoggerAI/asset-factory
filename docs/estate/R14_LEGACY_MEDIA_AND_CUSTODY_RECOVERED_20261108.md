# ONE URAI GENESIS — Asset Factory R14 forensic continuation

**Status:** REVIEW ONLY · PRODUCTION HOLD  
**Observation window:** 2026-11-07 Central / 2026-11-08 UTC  
**Owner:** `LifeLoggerAI/asset-factory` / historical `LifeLoggerAI/UrAi`, `UrAiProd`, `UrAi-Dev`, `urai-spatial`, `urai-studio`, `urai-storytime`, `urai-content`.

## Evidence and custody rules

This is **an additive, source-pinned investigation**, not an all-file raw-byte, all-history, LFS, provider-account, rights, device, or release certificate. All counts below come from fixed, **nontruncated Git tree metadata**, except for explicitly identified historical worker tests and the new synthetic offline inspector tests. `git_blob_sha1` means Git's blob-content identity, **not SHA-256**. Provider task metadata, manifests, symlinks, thumbnails and zero-byte placeholders are never treated as finished playable media. The R14 source review did **not** fetch protected private media, create provider jobs, purchase compute, download Meshy outputs, change production, merge owner PRs or publish executable changes.

### Fixed Git sources

| Repository / lane | Exact commit |
|---|---|
| Factory main | `a49f611ade29a1754787701ab4bf915c85c0cdc6` |
| Factory owner PR #421 | `e7d23952bcaa21209ff2d964c81c533f905863ca` |
| Factory security PR #493 | `3105353064d389373b9c792894c78e0e1171158a` |
| Factory composite PR #494 | `09fb062643cbad7cd0576fb85bb05d2db97d7d49` |
| Factory existing forensic PR #496 | `21154eb50c312a1846bcf5b229fdc7ad1a3154a0` |
| Spatial main | `da94837c2457b0a7590e26a7a644cd728de8afb8` |
| Original UrAi main | `8cac3ba513830c11261d57bc2b5dd7ad8b83e85a` |
| UrAiProd main | `d3d7ce6e607a5ee1be2c9f9ede6eecf1cfb393b9` |
| UrAi-Dev main | `08257158e2ffee8bbeb183ae89185f1677bad1da` |
| Studio main | `854477d80b1a7aa718edb60d1ed4c1cf22dbed9d` |
| Storytime main | `73f586a0a2931961ae221af7cfc0caf1b6aef39d` |
| Content main | `988ca4f7f38b1ce86e4d3f426361b5866fd23e0d` |

Existing full Factory source-path inventory: `LifeLoggerAI/asset-factory` PR #496, `docs/estate/MANIFEST.json` and `BRANCH_REFS.json` (five frozen trees / 8,105 repeated file rows / 476 branch names at capture). Labs master PR #262, `docs/estate/manifests/`, includes main-tree source registers for all 19 connected repositories. **These are path/size/Git SHA inventories, not all raw SHA-256 coverage**.

## New R14: eight additional historical Factory branch trees

Each was independently retrieved as a complete recursive Git tree and compared with Factory owner PR #421 for *new media paths* (PNG, WebP, JPEG, GLB, glTF, FBX, Blend, OBJ, MP4/MOV, ZIP, WAV/MP3/Opus, GIF). All eight retained the same existing 36 raster/glTF proof-media paths and **no additional tracked GLB or MP4 paths**; this does not rule out external or earlier unreachable artifacts.

| Branch | Head SHA | Blob paths | New media paths vs owner |
|---|---|---:|---:|
| `asset/generic-world-kits-v1-20261007` | `eba0c4ee7f60ef6e52d7d22a4cb885b926dc6c03` | 1,569 | 0 |
| `assets/generic-world-connected-navigation-20261007` | `c85a4628c5a8b0713a353ed197af1d46717aedb7` | 1,580 | 0 |
| `film/before-rest-world-full-master-t1-20260801` | `0e0cbda2d08ec35bb3a8e4dc36af7561ecea987d` | 1,446 | 0 |
| `feat/finite-time-film-foundry-20260721` | `bb0667cb14fc052d6777b95773480ebc0f8f2d51` | 1,393 | 0 |
| `film-001-built-from-survival-hero-cinema-20260829` | `45fb9599694cacef245517e4df5d7f55f557818d` | 1,476 | 0 |
| `fix/final-v1-avatars` | `3fa07df16266ed0b6cc22e1c593a268525419684` | 1,301 | 0 |
| `feat/urai-model-forge-bakeoff-20260919` | `12bd3dbf19dd9deadc97938fd9b2a7504ef2d58f` | 1,506 | 0 |
| `evidence/home-materialized-sfm-20261006` | `4b507d11a55df1081e2b2b50f9258437f0c34bfd` | 1,544 | 0 |

This **does not** scan the remaining branch-head trees, the union of all ancestor commits, unreachable Git objects, or deleted refs.

## Eight-repository static media union — exact selected trees

Categories: images = PNG/WebP/JPG/JPEG/GIF/HDR/EXR, models = GLB/glTF/OBJ/FBX/Blend/USDZ, audio = WAV/MP3/Opus/FLAC/AAC/M4A/Ogg, video = MP4/MOV/WebM, archive = ZIP/7z, captions = SRT/VTT. SVGs and general source are excluded from this particular media union.

| Repository | Image paths | Model paths | Audio paths | Video paths | Archives | Captions |
|---|---:|---:|---:|---:|---:|---:|
| Factory owner | 28 | 8 | 0 | 0 | 0 | 18 |
| Spatial | 384 | 44 | 71 | 0 | 10 | 0 |
| UrAi original | 51 | 4 | 0 | 35 | 0 | 0 |
| UrAiProd original | 187 | 153 | 32 | 9 | 73 | 22 |
| UrAi-Dev | 1 | 0 | 0 | 0 | 0 | 0 |
| Studio | 0 | 0 | 0 | 0 | 0 | 0 |
| Storytime | 0 | 0 | 0 | 0 | 0 | 0 |
| Content | 2 | 0 | 0 | 0 | 0 | 0 |

**Aggregate for this limited eight-tree union:** 1,132 named media paths; 1,024 nonempty regular-file paths; 105 zero-byte media paths; three media symlinks; **859 distinct nonzero regular Git blobs**. The sum of nonzero regular path sizes is 800,058,023 bytes, but deduplicating identical SHA-1 Git blobs gives **747,942,684 unique declared bytes**. Includes archives and unaccepted proof/placeholder media; **neither number is usable media capacity, license-cleared work nor actual downloaded bytes in R14**.

Across repository names, five nonzero Git blob SHA-1 identities recur. Extensive repeated payloads also occur within individual repos, especially the 51 tiny Spatial aliases and multiple UrAiProd ZIPs.

## Canonical Spatial media crosswalk

- 213 expected V1–V5 image paths: **213 present/nonempty, 213 distinct Git blob IDs, zero missing paths, zero exact-byte duplicate Git blob IDs**; 76,938,180 declared bytes. Source: Factory `docs/estate/manifests/R2_CANONICAL_SPATIAL_IMAGE_CROSSWALK_20261107.json` at PR #496. This is not image-decoded or license-cleared certification.
- 36 **additional, noncanonical** WebP image paths under `urai-tier1/public/assets/urai/`: 1,721,392 declared bytes. By folder: audio 2 / 103,068 bytes; avatars 4 / 132,876; demo 1 / 43,990; open-graph 3 / 162,152; social 3 / 132,602; tier4 7 / 377,420; tier5 7 / 340,810; ui 3 / 150,010; xr 6 / 278,464. They require separate visual/usage/rights verification.
- Another 51 WebP paths under `urai-tier1/public/urai/assets/` all share **one 42-byte Git blob** `7e7229eb635107465eabdb80b947cc21c080b28f`, 2,142 repeated declared bytes. Initial GitHub search found them in legacy fallback documentation, not direct current runtime string references. Treat as legacy tiny **placeholder candidates** pending decoding, not 51 finished artworks.
- One separate `urai-tier1/public/asset-audit/contact-sheet-raster.webp` / 715,424 bytes. Thus all **301 WebP paths = 213 canonical + 36 extra + 51 tiny aliases + one contact sheet**; 251 distinct WebP Git blobs across the paths, not 301 unique images.
- Spatial has 24 `.glb` paths / 32,801,288 declared bytes, 23 distinct Git blobs. Previous R3/R4 investigations inspected raw bytes on 16 paths; seven current MakeHuman V4 and the current Home Entry Chamber remain raw-inaccessible to the connector. Current Legacy Archive GLB and Focus Chamber GLB are byte-identical aliases.
- Spatial has nine distinct nonempty `.opus` paths / 2,187,659 declared bytes. Eight directly map to ambient/cue source URLs in `urai-tier1/src/spatial/audio/useAudioController.ts` blob `a21852f34e93acbe921bf184d5a6a10d3e8aacf4`. The separate ambient bed is present. Eleven historical `.mp3` paths are zero-byte and are not the canonical controller's referenced Opus URLs. Decode and playback acceptance not performed.
- Spatial has 10 ZIP paths totaling 99,769,355 declared bytes; most are historical **screenshot QA packages**, one duplicated ZIP SHA and one tiny 411-byte `operations/assets/candidate-bundles/urai-3d-core.zip`. None is proof of custody of the separately reported **278,133,223-byte** Generic World 1.0.2 ZIP.

## Recovery of original `UrAi` video sources

At `UrAi/main 8cac3ba513830c11261d57bc2b5dd7ad8b83e85a`, there are 35 `.mp4` paths, correctly classified using **Git mode**:

- **28 regular, nonempty substantive MP4 blobs**: 28 different SHA-1 identities, **317,151,186 declared bytes**; under `public/assets/sky/` and `public/assets/ground/`, grouped as bloom/cosmic/energy/fracture environment sequences. **Raw MP4 codec/duration/visual inspections were not available.**
- Four **zero-byte** MP4 placeholders: `public/assets/sky/fracture/sky-fracture-05.mp4`, `-05a`, `-06`, `-06a` (empty Git blob `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391`).
- Three `.mp4` **symbolic links (mode `120000`)**, NOT additional videos: `public/assets/avatar/avatar-demo.mp4` -> `../ground/cosmic/ground-cosmic-10.mp4`; `public/assets/ground/ground-demo.mp4` -> `cosmic/ground-cosmic-09.mp4`; `public/assets/sky/sky-demo.mp4` -> `cosmic/sky-cosmic-09.mp4`. Symlink target bytes were read from Git blob source; link targets exist in the inspected tree.
- The original `UrAi/.gitattributes` blob `5db90d0ac215bd4031b8628ea1cdc4322488eff1` does not mark the MP4s for LFS filtering; its sole LFS path is a JSON/Lottie asset.
- Additional original media: three nonempty avatar OBJ model files (6,219,044 bytes combined), one 1,889-byte glTF, 47 nonzero PNG/JPG/WebP images, four zero-byte PNGs. Ownership/visual/license and active route use remain unverified.

**Critical recovery priority:** Preserve the 28 substantial video blobs as distinct historic footage candidates before purchasing replacements, but do not identify them as an approved current Genesis hero film or current deployable environment without literal media review.

**Historical CI limitation:** Original `UrAi/.github/workflows/assets-ci.yml` (blob `17b59bc55588dd94cfbae1b018a36e5295ae6a31`) checks for an `assets:ci` package script and deliberately skips validation if missing. The exact `UrAi/package.json` (blob `e20dc0995d3dbd00d27c57960e33cfc3ac486eec`) does not contain `assets:ci`; `scripts/generateManifests.mjs`, `scripts/validateManifests.mjs`, and the Sky/Ground generated manifests were not present in the same frozen tree. Thus workflow YAML existence does not demonstrate MP4 codec/manifest validation on this revision. No live Actions run result was inferred.

## `UrAiProd` model and launch-film reconciliation

At `UrAiProd/main d3d7ce6e607a5ee1be2c9f9ede6eecf1cfb393b9`:

- `.glb`: 56 paths, 47 nonempty unique Git blobs, nine zero-byte model paths; 7,781,952 declared bytes overall. Includes 7,340,032-byte `biped/Animation_Crawl_and_Look_Back_withSkin.glb` (contents not decoded), environment-kit, ring-gate, AR-reticle and related proof/small LOD files.
- `.obj`: 95 paths, 88 nonempty, seven zero; 9,786,644 declared bytes.
- `.zip`: 73 paths / 4,692,117 bytes but only 48 unique nonempty Git blobs; multiple duplicated campaign, launch, press and design archives. Contents uninspected.
- `.mp4/.mov`: nine paths and **all nine are zero bytes**, including the four `URAI_LAUNCH_MEDIA/01_VIDEO/02_Clips/scene*.mp4` inputs and both named final demo exports.
- The After Effects `URAI_20s_AE_Builder.jsx` blob `216224e9d4aa063c7cd524edb7901a13695fe819` and Premiere `URAI_20s_Timeline.xml` blob `2e524829f6f164608916055ad70a93a39b5af9c5` are genuine editable timeline/script **source**, but their four referenced scene clip Git files are empty.
- More broadly, `URAI_LAUNCH_MEDIA/` has **44 tracked paths, 36 zero-byte, eight nonempty**. Empty payloads include six MP4s, two MOVs, eight WAVs, one MP3, 16 PNGs, and native `.aep`/`.prproj`/`.capcut` project placeholders. Nonempty material consists of scripts, an XML timeline, captions and text/design documentation; it is **not** a delivered film.
- Crucial public deployment mismatch: `manifest/glb_manifest.json` blob `50882be2da7be53be41e5f03646b4ad95894a796` declares `root: './public/models'` and 73 asset records (72 unique expected paths; duplicated `reticle_flat_LOD0`). **Zero of 73 records** matches a tracked `public/models/...` GLB. Seventeen records have same-named Git GLBs somewhere else under `models/` or `blender/models/`. An initial source search found no confirmed exact copying pipeline that proves release packaging. This is an actual **source-tree/manifest path mismatch**, not proof that no historical deployment ever served copied files.

## Security, release and provider evidence (previous R1–R13 survives)

Existing R5 previous-worker result: 26/26 saved GLBs, 68,094,300 actual bytes raw-read/hashed and limited container tests; **not re-executed in R14**. Existing R7 result: original Model Forge container test 54/54 source-level PASS. Existing R8–R13 proposal tests show (a) stale Home promotion receipt tied to different bytes, (b) seven actual GLBs not compressed despite Meshopt receipt claims, (c) standalone promoter + AAA accepting fake GLBs in isolated synthetic tests, (d) future `.glb` kind misclassification acceptance; R9/R11/R13 patches remain **owner review proposals**, not executable production safeguards. Official Khronos validator, actual codec decode and current source-level protected CI not established. Original Actions failures have zero visible steps/unavailable logs, so no root cause asserted.

Main Factory `model_forge/forge.mjs` blob `22146eb20a9199070ff95fe8c96f98f20ccbd46b` submits Tripo using `https://api.tripo3d.ai/v2/openapi/task`. Owner candidate blob `e01440825c739e937e2f2b48d2bd2168e3d7b467` uses `https://openapi.tripo3d.ai/v3/generation/...`. The existence of V3 migration on unmerged #421 does not prove current deployment selected it. Meshy support corrected Free-download restrictions (Free limited monthly downloading), web-model retention, and Pro/Premium/Ultra API 3-day vs Studio 14-day API output policy. Individual Meshy tasks/expiry and currently deployed source remain unknown. Tripo's November 2 provider notice lists December 1, 2026 retirement for designated legacy V2.5/segmentation V1 models; November 3 notice reports credits-to-USD display conversion. No generation or download triggered.

Existing rights matrix `asset-factory/docs/estate/10_PROVENANCE_AND_LICENSE_MATRIX.md` remains the review source. No blanket license/likeness/commercial-rights/voice/music clearance is inferred from Git presence, generated status, public accessibility or provider receipts.

## New local reproducible inspection tool

- `urai_asset_forensic_inspector.py`: no-network, read-only Git `ls-tree` + streaming `git cat-file --batch`; recomputes full SHA-256 and Git-blob SHA-1, checks exact lengths and basic PNG/WebP/JPEG/GLB/glTF/WAV/Ogg/MP4/ZIP headers, detects zero files, symlinks, LFS pointers and duplicate blobs. No symlink traversal and no provider calls. **It does not produce official codec, render, licensing or deployment acceptance.**
- `test_urai_asset_forensic_inspector.py`: temporary synthetic Git repository, 16 assertions **16/16 PASS** with Node-independent Python/Git runtime. These are tool harness tests, **not tests on raw original UrAi binaries**.
- Full all-byte SHA-256 certificate is **not** claimed: the working container cannot DNS-resolve the GitHub raw host and the connected GitHub content API rejects non-UTF8/big binary downloads. Obtain an authorized local Git clone or binary-capable route before invoking this tool for actual source media.

## Exact next owner tasks in safest order

1. On authorized local checkouts, use the inspector at all immutable SHAs above; generate per-blob SHA-256, verify 28 UrAi video containers and all 47 nonzero UrAiProd GLBs, preserve unique source media without duplicating or re-generating.
2. Verify 28 UrAi MP4s with `ffprobe`/`ffmpeg`, collect only non-sensitive metadata, frame contact sheets and rights/provenance classifications. Specifically distinguish background loop, demo source, and launch film; no public private-person media.
3. Independently resolve 73-entry UrAiProd GLB manifest path mismatch, historical build packaging and nine zero-byte launch videos; check 56 GLB geometry via official validator and Blender on a local isolated device.
4. Validate the 36 outside-contract Spatial WebPs and 51 same-blob tiny legacy aliases; confirm active route fallbacks and eliminate only after the consumer owner has proven replacement and accessibility.
5. Complete raw inspection of eight remaining Spatial GLBs (seven V4 humans + current Home), official glTF semantic/codec validation, mesh compression/LOD, skin/clip playback and explicit new Home approval. Preserve independent owner #421 and composite #494 branches.
6. Restore real protected native Actions and inspect job logs, ensure full production promotion runs hard-failing format and receipt gates (R9/R11/R13 proposals reviewed and integrated, never silently merged).
7. Confirm actor/music/voice/texture/person likeness and AI provider commercial-rights records; real signed consent and Privacy→Factory→Studio→Jobs→owner-only Replay→revocation/deletion lifecycle; then actual physical-device/mobile/XR performance.
8. Read-only enumerate Meshy tasks via authorized account before any expiry; verify Tripo production version, never call billable generation or download restricted/private assets without owner authorization.
9. Continue original all-branch history and inaccessible byte accounting; after all 476 head refs and historical unions, clearly label truly unreachable/deleted objects versus uninspected but available objects.

**Disposition: EXISTING CREATIVE SYSTEM AND MATERIAL MEDIA CONFIRMED; ALL-BYTE/HISTORY, RIGHTS, FULL VIDEO/GLB DECODE, INTEGRATED DEVICE AND PRODUCTION ACCEPTANCE REMAIN HOLD.**

No existing owner-worker GitHub PR was overwritten or merged. An isolated audit branch had previously been created, but the attempted R14 `create_file` write was declined by the connection and was **not retried**. This R14 continuation is delivered locally, not represented as a published GitHub commit.
