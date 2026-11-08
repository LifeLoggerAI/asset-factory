# R2 — Exact canonical image crosswalk, external GLB custody and Meshy correction

**Observed:** 2026-11-07 (America/Chicago), connected GitHub, Google Drive and authorized Gmail read-only. **Review only / ZERO SPEND / PRODUCTION HOLD.** Prior R1 history and limitations continue; this R2 adds independently reproduced, current fixed-revision comparisons.

## 1. Canonical image assets: 213 of 213 nonempty Git blobs

**Factory source:** owner #421 immutable commit `e7d23952bcaa21209ff2d964c81c533f905863ca`, still OPEN/DRAFT. **Spatial consumer source:** `LifeLoggerAI/urai-spatial/main` immutable commit `da94837c2457b0a7590e26a7a644cd728de8afb8` (nontruncated recursive Git tree).

Crosswalk [R2_CANONICAL_SPATIAL_IMAGE_CROSSWALK_20261107.json](manifests/R2_CANONICAL_SPATIAL_IMAGE_CROSSWALK_20261107.json) includes **all 213** canonical expected identities, source-manifest paths/blobs, actual Spatial binary paths, Git SHA-1 blob IDs, declared byte lengths, and explicit absent runtime/visual/license/SHA-256 certification.

| Canonical family | Source reconstruction | Present nonempty / expected | Git-declared bytes |
|---|---|---:|---:|
| V1 Genesis | 47 original `image_asset_generator/manifest.json` entries plus 6 additions in `build_version_manifests.py` | 53 / 53 | 20,656,850 |
| V2 living system | Exactly 80 `V2_GROUPS` declarations in `build_version_manifests.py` | 80 / 80 | 26,095,434 |
| V3 relationships | 14 `manifests/v3.manifest.json` | 14 / 14 | 6,629,818 |
| V4 XR | 39 entries derived from `V3_GRAPHICS` and remapped by `canonical_release_manifests.py` | 39 / 39 | 10,617,466 |
| V5 convergence | 14 remapped `manifests/v2.manifest.json` + 13 `manifests/v5.manifest.json` | 27 / 27 | 12,938,612 |
| **Total** | Canonical current catalog V1–V5 | **213 / 213** | **76,938,180** |

**Zero missing, zero zero-byte targets, zero duplicated expected paths** under `urai-tier1/public/assets/urai/`. This confirms real nonempty Git-tracked media *beyond* prompted manifest records, not 213 successful recent provider calls. Every output remains unproven for raw SHA-256, visual quality, exact runtime import/deployment, source/third-party rights, actual WebP decode, file MIME, or physical-device certification. The extra 36 Spatial-side WebPs under this subtree are outside the 213 canonical list; review them separately. These image bytes are a subset of the prior broader 249-WebP subtotal — do not add as new estate bytes.

## 2. Saved GLBs: current Drive metadata and overlap

The previously published `UrAi-Meshy-Preservation-Report-20261104.html` identifies 26 locally/Drive-saved models (historically hashed together: 68,094,300 bytes). Exactly **17** in that report provide Drive file links, and **all 17 are currently retrievable as Drive metadata**, with names, MIME `model/gltf-binary`, and declared bytes exactly matching the previous dated report. Their raw bytes and SHA-256 were **not** downloaded/rehashed in this R2. **Seven** of those 17 match filenames AND byte sizes of existing `urai-spatial/main` human-rig-v3 GLBs. Since no cross-copy raw hash check was rerun, call this *filename-and-size overlap*, not new verified SHA-256 equality.

The remaining **nine** saved-model references in the prior report point to ChatGPT Library aliases (not Drive URLs). Current filename/title Library searches did not independently recover those nine GLBs. Preserve their historical verification evidence, but call current custody **unverified**, not proven lost.

Separately, the immutable Spatial main contains **24** `.glb` tracked paths / 32,801,288 declared bytes and **23 distinct Git SHA-1 blobs**: `generated/models/focus-memory-chamber-v1.glb` and `generated/models/legacy-archive-foundation-v1.glb` refer to the **same 622,516-byte Git blob**. Their different names do not establish two unique designs. These 24 paths overlap the 26 earlier saved models, so **never sum 24+26 as 50 independent models**.

The accessible Google Drive named folder `UrAi Generic World Library` (`1r4ApPjjaQgE9fqJwrXA4NvnExUN_SXEe`) returned `{"files":[]}` under the current authenticated connector; parent listing also returned no entries. Search for `UrAi_Generic_World_Library_1.0.2.zip` and ZIP mime files returned none. The historical ZIP length 278,133,223 bytes and prior SHA-256 `468bd4fe6c59b9cdae6cb02cdb8d8237d4ce8110324061954297572880f1a8f8` remain **receipt-only, not presently recovered archive bytes**. Empty accessible Drive listing does **not** prove the archive is deleted or nonexistent in other permitted storage.

## 3. Meshy support — important correction to prior R1 assumptions

Actual follow-up in the existing Meshy support conversation (Gmail message `1a1a8d68b3315776`, November 4, 2026, 23:13Z) explicitly *corrects* the earlier support assertion that Free cannot download: **Free-tier downloads remain available with a monthly limit**, according to support, and web-app models stay in the account. API output retention is **3 days** for Pro/Premium/Ultra and **14 days** for Studio. Support reports **no Premium extension**, and says the account could not be found under the address used for that inquiry; the original Meshy login identity still needs account-authorized confirmation. November 7, 2026 support follow-up (Gmail message `1a1b4c6b01cf88b4`) repeats existing web models persist, Premium renews/ends November 25, and API outputs should be retained before expiry. These emails provide policy guidance, **not** account-level task inventory or proof of individual output expiration.

No Meshy account task listing, new credential acquisition, generation, regeneration or restricted provider output download was executed in R2. As of this audit, current Meshy-only assets remain **unknown**, rather than zero or lost by presumption.

## 4. Current PR/source and CI continuity

GitHub current readback: Factory `main a49f611a...`; owner #421 `e7d23952...` OPEN/DRAFT; Home source #491 `58415c08...` OPEN/DRAFT; security #493 `31053530...` OPEN/DRAFT; combined #494 `09fb0626...` OPEN/DRAFT; original Genesis #495 `a244e8f0...` OPEN/DRAFT; forensic #496 inherited Genesis #495 branch and remains OPEN/DRAFT. No developer production merge or runtime deployment occurred in this R2.

The R1 native evidence showing `runner_id:0`, `steps:0` remains. No new test suite was executed, so no current exact-head CI pass is claimed.

## 5. Continuation and release gates

**Next:** validate actual 213 WebP decoded pixel data and per-asset visual/provenance/rights, preserve excluded images and media; conduct current 17 Drive GLB byte-level rehash only when raw downloads are explicitly permitted, independently audit 24 Spatial GLB rig/animation/material contents and source identity, locate original generic world ZIP in authorized store, read-only inspect Meshy tasks with correct account and permitted access, resolve genuine active provider configuration and Tripo migration, restore source-pinned native CI, prove Studio/Storytime/Jobs/Privacy/Replay owner/consent/tenant rights and deletion, perform Gold Master visual/mobile/XR acceptance.

**DO NOT** equate canonical path coverage to movie-ready art or launch-ready UX. **Do not** trigger paid generation, provider uploads, protected downloads or production release. **Production HOLD.**
