# URAI Multimodal Provider Authority

Status date: 2026-09-25
Authority branch: `converge/asset-factory-production-multimodal-20260925`
Unified authority: draft PR #284, stacked on production-hardening PR #281. PR #284 carries the complete Model Forge and multimodal file surfaces previously split across PRs #279 and #282.

## Canonical rule

External providers generate candidates. UrAi owns routing, provenance, QA, approval, optimization, promotion, storage, and runtime integration. No provider output becomes canonical merely because generation succeeded.

All paid provider selectors default to `local-proof`. This branch does not authorize provider spend.

## Provider routing

| Modality | Primary target | Fallback/lab | Activation variable |
| --- | --- | --- | --- |
| Image | OpenAI GPT Image 2.5 Sunburst | Replicate / Stability / fal | `ASSET_FACTORY_IMAGE_PROVIDER` |
| 3D | Meshy | Replicate / fal | `ASSET_FACTORY_MODEL3D_PROVIDER` |
| Speech | ElevenLabs | OpenAI / Replicate | `ASSET_FACTORY_AUDIO_PROVIDER` |
| SFX | ElevenLabs | Replicate / fal | `ASSET_FACTORY_SFX_PROVIDER` |
| Music | ElevenLabs Music v2.5 | Replicate | `ASSET_FACTORY_MUSIC_PROVIDER` |
| STT | ElevenLabs Scribe v2 | deferred fallback | `ASSET_FACTORY_STT_PROVIDER` |
| Video | Runway | Replicate / fal | `ASSET_FACTORY_VIDEO_PROVIDER` |

The legacy `ASSET_FACTORY_MEDIA_PROVIDER` remains a compatibility fallback only.

## Current implementation truth

### OpenAI image

- Runtime adapter exists.
- Default model: `gpt-image-2.5-sunburst`.
- Current Image API request shape is used.
- Credential is server-only: `OPENAI_API_KEY`.
- Activation remains off by default.
- Live artifact smoke is not claimed by this branch.

### ElevenLabs

- Speech, sound-effects, music, and STT code paths exist.
- Permanent UrAi voice is fail-closed: `ELEVENLABS_VOICE_ID` has no stock fallback.
- Speech default: `eleven_v3`.
- SFX default: `eleven_text_to_sound_v2`.
- Music default: `music_v2_5`.
- STT default: `scribe_v2`.
- STT uses authenticated file upload, bounded size/type, source SHA-256, diarization, and audio-event tagging.
- Zero-retention may be requested only when the account supports it.
- Live artifact smoke is not claimed by this branch.

### Meshy

- First-class model3d adapter exists.
- Text-to-3D preview/refine, image-to-3D, and multi-image-to-3D paths exist.
- GLB/PBR candidates are downloaded into UrAi's artifact flow.
- Default image/multi-image model registry: `meshy-7.1`.
- Generated geometry is stamped candidate-only and still requires QA/promotion.
- Live artifact smoke is not claimed by this branch.

### Runway

- Direct image-to-video API path exists with server-only key support, version header, bounded polling, output download, and provenance.
- Text-to-video remains fail-closed unless a verified endpoint is pinned.
- Connected Runway workspace was authenticated on 2026-09-25 but exposed no available video models and only 2 purchased credits.
- No Runway generation was executed and no credits were spent.
- Runtime activation therefore remains external-blocked by account plan/model availability plus production secret binding.

### Replicate

- Existing image, 3D, audio, speech, and video adapters remain.
- Server-pinned model registry remains the fallback/model-lab authority.
- Request-level model/input overrides stay fail-closed by default.

### fal

- Existing media adapter remains an optional low-latency fallback.
- Video endpoint remains server-pinned and fail-closed until explicitly configured.

### Stability

- Existing image adapter remains optional/fallback.
- It is not required for core launch authority.

## Provenance

Provider-backed manifests now record:

- source type
- provider
- provider model
- provider task/job/prediction id
- prompt hash
- reference hash
- full input hash
- candidate-only state

Provider generation never changes `approvalStatus` from draft by itself.

## Real-world identity assets

Specific real people, rooms, objects, keepsakes, or locations must not be silently replaced by AI approximations.

Accepted source classifications:

- scanned-real
- reconstructed-real
- artist-authored
- ai-generated
- hybrid
- procedural

RealityScan/Polycam/photogrammetry capture is a human/physical acquisition step. UrAi ingestion should preserve source identity and provenance through Blender/Substance finishing.

## Blender finishing contract

Canonical 3D promotion should verify or normalize:

- meters, Y-up/right-handed runtime convention
- transforms and origins
- normals/manifold state
- topology/polycount
- UV validity
- material slots
- PBR texture bindings
- LOD/collision where required
- GLB validity
- runtime draw-call/material budgets
- KTX2/Meshopt/Draco decisions where compatible with the consuming surface

Blender is a finishing/repair authority, not a generative source of identity.

## Substance finishing contract

Substance is a human-assisted premium PBR finishing lane where needed. The handoff should preserve:

- base color
- roughness
- metallic
- normal
- ambient occlusion where used
- emissive only when canon requires it
- texture resolution tier
- source/material license
- OpenPBR/PBR semantics
- export profile and final checksum

No automated Substance API is claimed by this repository unless one is actually integrated later.

## Activation boundary

A lane is not LIVE VERIFIED until all of these are true:

1. credential exists in approved secret storage;
2. deployed runtime is bound to that secret;
3. server-side modality selector enables the provider;
4. budget ceiling is active;
5. real minimal smoke succeeds;
6. artifact is captured into UrAi storage;
7. provenance is recorded;
8. consuming system successfully uses it;
9. exact-head evidence is retained.

Code presence alone is not live-provider certification.
