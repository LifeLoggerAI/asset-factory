# R4 — Independent GLB binary custody, 17 saved models, V3 skins and Legacy recovery

**Observed 2026-11-07 Central.** Additive documentation-only evidence on Asset Factory draft PR #496, no production mutations, no generation, no spend. **PRODUCTION HOLD.**

Immutable evidence anchors: Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8`, R3 audit `be45400c253dd161dd0c3284fca106b9ba351c47`, Factory owner candidate #421 `e7d23952bcaa21209ff2d964c81c533f905863ca`, original Drive `UrAi-Meshy-Preservation-Report-20261104.html` SHA-256 `b4951e1f000ee45e2209b835893d29ca8a5aaacc0c904b76a305e13da03a9aea` and 28,982 bytes.

[Machine-readable R4 17-file manifest](manifests/R4_OFF_MESHY_DRIVE_17_GLB_RAW_HASH_AND_SPATIAL_EQUIVALENCE_20261107.json) contains full SHA-256 values, byte lengths, Spatial Git blob associations, mesh/triangle/animation counts and specific limitations. **This report does not include or upload any media or personal likeness.**

## R4 verified additions

1. Retrieved all **17 accessible saved Drive GLBs** via the connected authenticated Drive read-only route and inspected their actual **16,543,164 raw bytes** locally. Every SHA-256 and length matches the historical preservation report: **17/17 PASS**. Each passed a limited GLB2 chunk/JSON/embedded buffer-view/accessor/animation metadata validator, and each imported as a scene through `trimesh 4.11.1`: **17/17 PASS**. These are independently executed checks, not current browser/visual/device tests.
2. **All 7 V3 Council/Home human rigs** have computed Git blob SHA-1 IDs identical to the corresponding immutable Spatial main objects. Exact binary identity independently confirms that the seven preserved Drive copies and current Spatial blobs are the same content. The seven collectively total **15,085,004 bytes**; do not double-count as new inventory.
3. Each of those seven V3 rigs has **7 declared mesh objects, 10 primitives, 4 skinned primitives, 1 skin / 17 joints, 8 embedded images, and 5 real animation clips**: `idle_breath` (3.0s), `listen_acknowledge` (1.35s), `speak_calm` (2.0s), `gesture_open` (2.0s), `gaze_shift` (2.1s). Animation channels, sampler/accessor lengths and strictly increasing finite keyframe timestamps passed the implemented checks. Triangle counts range **50,840–54,560**, below the recorded 65,000 budget. No visual motion quality is claimed.
4. **7/7 V3 models lack Draco/Meshopt compression**. Current Spatial launch policy still demands `requiredCompression: draco-or-meshopt` and forbids candidate shipment, so this is not a production-green result.
5. Ten additional original Real World Extension V1 Drive GLBs (four environment models, six older Council human representations) total **1,458,160 bytes**, verified by raw SHA-256 and geometry import. They are standalone retained candidates with **no glTF skins and no animation clips**, not replacements for the active Council V4.
6. **A distinct Legacy scene is genuinely saved:** `legacy-archive-real-v1.glb`, **87,120 bytes**, SHA-256 `80a667bbf03f7cc68fae0e661ba86e6a191a35726ae95816c6d183808b8470fe`, 101 declared meshes, 5,854 triangles, ~12.02 × 5.055 × 16.0 meter imported extents. Its labeled nodes include `legacy-floor`, walls, shelves and books. Spatial's currently referenced `legacy-archive-foundation-v1.glb` remains a byte-for-byte duplicate of Focus (R3). **Review and accept design first; do not silently replace current assets.**

## All 17 decoded saved model candidates

| File | Bytes | Declared meshes | Triangle estimate | Skins / joints / clips | Spatial main exact Git blob |
| --- | ---: | ---: | ---: | --- | --- |
| `council-trickster-human-rigged-v3.glb` | 2,092,352 | 7 | 50,840 | 1 / 17 / 5 | **MATCH** |
| `council-builder-human-rigged-v3.glb` | 2,231,980 | 7 | 54,316 | 1 / 17 / 5 | **MATCH** |
| `council-archivist-human-rigged-v3.glb` | 2,097,628 | 7 | 50,964 | 1 / 17 / 5 | **MATCH** |
| `council-guardian-human-rigged-v3.glb` | 2,240,664 | 7 | 54,560 | 1 / 17 / 5 | **MATCH** |
| `council-mirror-human-rigged-v3.glb` | 2,116,432 | 7 | 51,444 | 1 / 17 / 5 | **MATCH** |
| `council-guide-human-rigged-v3.glb` | 2,172,896 | 7 | 52,864 | 1 / 17 / 5 | **MATCH** |
| `home-human-rigged-v3.glb` | 2,133,052 | 7 | 51,848 | 1 / 17 / 5 | **MATCH** |
| `legacy-archive-real-v1.glb` | 87,120 | 101 | 5,854 | 0 / 0 / 0 | external retained |
| `mirror-chamber-real-v1.glb` | 93,296 | 18 | 4,570 | 0 / 0 / 0 | external retained |
| `shadow-hall-real-v1.glb` | 74,596 | 34 | 7,266 | 0 / 0 / 0 | external retained |
| `council-chamber-real-v1.glb` | 109,576 | 41 | 5,802 | 0 / 0 / 0 | external retained |
| `council-trickster-human-v1.glb` | 181,328 | 27 | 15,892 | 0 / 0 / 0 | external retained |
| `council-builder-human-v1.glb` | 181,252 | 27 | 15,892 | 0 / 0 / 0 | external retained |
| `council-archivist-human-v1.glb` | 183,768 | 28 | 16,212 | 0 / 0 / 0 | external retained |
| `council-guardian-human-v1.glb` | 181,392 | 27 | 15,892 | 0 / 0 / 0 | external retained |
| `council-mirror-human-v1.glb` | 184,776 | 29 | 16,788 | 0 / 0 / 0 | external retained |
| `council-guide-human-v1.glb` | 181,056 | 27 | 15,892 | 0 / 0 / 0 | external retained |

## Exact coverage and remaining work

Spatial main has **24 GLB paths**, 23 distinct Git blobs. R3 directly raw-read and SHA-256-verified nine paths; R4 independently raw-read seven additional V3 models with exact Git blob hashes. Thus **16/24 Spatial GLB paths now have actual raw-byte evidence**; the **eight still uninspected** are **7 MakeHuman-v4 Council/Home candidates and the 1,786,808-byte Home Entry Chamber**. Git object presence and receipt hashes alone do not establish their actual geometry or full validation in this session.

The separate historical 26-saved-model report totals **68,094,300 bytes**; nine old ChatGPT Library-held models totaling **51,551,136 bytes** were not freshly accessed, partly involving private likeness. No evidence of loss should be inferred. Generic World 1.0.2's 278,133,223-byte ZIP remains inaccessible in current Drive search/list. No Meshy task-level expiry inventory was authenticated.

Model Forge owner PR #421's `validate-glb.mjs`, `glb-container.mjs`, Forge guard and test files were source-reviewed in R3, but **no new exact-head native `node --test`, Blender or official glTF-validator suite** ran here because authenticated GitHub source does not supply a complete local checkout and the runtime cannot clone the repo due to DNS. Do not invent PASS results or consider isolated Python GLB checks equivalent.

**Next:** obtain remaining eight large Spatial binaries through an approved raw download route, run official glTF validation and true skin playback/device tests, evaluate Legacy-specific geometry against UX authority, review Home human canonical owner and Council V4 candidate-release policy, recover the generic ZIP, enumerate only existing Meshy tasks read-only, prove Privacy/Studio/Jobs/Replay protected output and deletion, and secure independent rights and release signoff.

**No cloud build, GPU, payment, production deployment, provider generation, protected private media redistribution, or production-code modification. PRODUCTION HOLD.**
