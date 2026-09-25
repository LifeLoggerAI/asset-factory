# URAI Multimodal Provider Authority

Status date: 2026-09-25
Authority branch: `converge/asset-factory-production-multimodal-20260925`
Unified authority: PR #284, stacked on production-hardening PR #281. PR #284 carries the complete Model Forge and multimodal file surfaces previously split across PRs #279 and #282.

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

Additional governed provider lanes outside the unified Studio router:
- OpenAI Sora video exists in separately authorized, finite paid film workflows under protected `paid-asset-generation` authority. It is not a hidden fallback for the Studio video router.
- Model Forge supports Meshy, Tripo, Rodin/Hyper3D, and Replicate as candidate 3D generators under its own no-spend/spend gates.
- The legacy image generator supports `openai` plus a provider-neutral `custom` HTTPS renderer endpoint. That generic adapter is not a named production provider until a specific endpoint/account is governed and certified.

The legacy `ASSET_FACTORY_MEDIA_PROVIDER` remains a compatibility fallback only.

## Current implementation truth

### OpenAI image

- Runtime adapter exists.
- Default model: `gpt-image-2.5-sunburst`.
- Current Image API request shape is used.
- PNG/JPEG/WebP output format is explicitly validated and provenance/MIME follow the actual requested format.
- Optional OpenAI TTS fallback uses `gpt-4o-mini-tts`, but speech voice identity is fail-closed until `ASSET_FACTORY_OPENAI_VOICE` is explicitly approved.
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
- Default image/multi-image model registry: `meshy-7.1`; text-to-3D is now explicitly model-pinned instead of being mislabeled while relying on a server default.
- Image/text geometry may use up to 4k where supported; multi-image is isolated to its documented `standard|2k` geometry-resolution boundary so a shared 4k default cannot invalidate requests.
- Generated geometry is stamped candidate-only and still requires QA/promotion.
- Live artifact smoke is not claimed by this branch.

### Runway

- Direct Runway video API path exists with server-only key support, version header, bounded polling, output download, and provenance.
- Text-to-video and image-to-video both use the verified `POST /v1/image_to_video` endpoint; text-only generation omits `promptImage`, while image-conditioned generation supplies it.
- Runtime readiness also requires `ASSET_FACTORY_RUNWAY_VIDEO_ACCOUNT_READY=true`; it defaults false so a credential/model string alone cannot falsely certify account capability.
- Connected Runway workspace was re-checked directly on 2026-09-25: authenticated workspace `Life`, Free plan, zero eligible video models, and 2 purchased credits.
- No Runway generation was executed and no credits were spent.
- Runtime activation therefore remains external-blocked by account plan/model availability plus production secret binding.

### Replicate

- Existing image, 3D, audio, speech, and video adapters remain.
- Server-pinned model registry remains the fallback/model-lab authority.
- MiniMax speech no longer has a stock `Friendly_Person` fallback; `ASSET_FACTORY_REPLICATE_SPEECH_VOICE` must be explicitly approved/configured before speech can run.
- Request-level model/input overrides stay fail-closed by default.
- Protected App Hosting verification and the one-time paid smoke consume the dedicated `asset-factory-production` environment variables rather than historical shared-project authority.
- `urai-4dc1d`, project-number WIF authority under `952723774155`, the historical deploy service account, and `asset-factory-dev-id` are explicitly rejected as final production authority.
- The paid smoke remains main-only, manual-only, exact-confirmation gated, one-prediction maximum, and separately classified from source/WIF/App Hosting verification.

### fal

- Existing media adapter remains an optional low-latency fallback.
- Video model id remains server-pinned and fail-closed until explicitly configured through `ASSET_FACTORY_FAL_VIDEO_MODEL`.
- Direct REST authentication uses `Authorization: Key ...`.
- Long-running video uses fal's queue protocol: submit to `queue.fal.run/{model}`, validate provider-returned status/result URLs back to `queue.fal.run`, poll with the governed timeout, then fetch the completed result.
- Queue failure, cancellation, unexpected status, timeout, redirect, or untrusted provider URL fails closed.
- Video REST fields use the provider contract naming such as `aspect_ratio`; request-level provider input overrides remain disabled unless explicitly enabled.

### Stability

- Existing image adapter remains optional/fallback.
- Current Stable Image Core/Ultra routing uses `/v2beta/stable-image/generate/core|ultra`; legacy `stable-image-core` naming is normalized rather than embedded as an invalid endpoint path.
- Service selection is allowlisted to `core` or `ultra`.
- It is not required for core launch authority.


### OpenAI Sora / film workflows

- Sora is present as a separate governed moving-cinema lane, including `sora-2` authorization/workflow contracts.
- Those workflows are main-only / authorization-marker gated and use the protected `paid-asset-generation` environment.
- Existing Sora authorization receipts are historical/exact-authority specific; they do not automatically authorize current provider spend, promotion, deployment, delivery, or public release.
- Sora is not currently wired as an automatic fallback in `ASSET_FACTORY_VIDEO_PROVIDER`; the Studio router remains Runway / Replicate / fal.

### Tripo

- Tripo is implemented in Model Forge as a governed 3D candidate provider.
- It is not a first-class Studio runtime provider selector.
- Current provider-credential presence proof reports `TRIPO_API_KEY=absent` in ordinary Actions.
- Paid execution remains blocked by Model Forge spend and current-gap proof.

### Rodin / Hyper3D

- Rodin/Hyper3D is implemented in Model Forge as a governed 3D candidate provider.
- The lane requests GLB/PBR candidate output and retains candidate provenance.
- It is not a first-class Studio runtime provider selector.
- Current provider-credential presence proof reports `RODIN_API_KEY=absent` in ordinary Actions.
- Paid execution remains blocked by Model Forge spend and current-gap proof.

### Provider-neutral custom image renderer

- The legacy image-generation pipeline supports a generic `ASSET_RENDERER_PROVIDER=custom` HTTPS JSON endpoint.
- This is an adapter surface, not a named provider certification.
- The endpoint must use HTTPS; the prior `ASSET_RENDERER_ALLOW_HTTP` escape hatch is removed.
- Provider-returned image URLs are accepted only over HTTPS and downgrade redirects fail closed.
- A specific vendor behind this adapter must still satisfy the normal credential, budget, provenance, smoke, and promotion gates before being considered LIVE VERIFIED.

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

Speech identity is fail-closed across ElevenLabs, OpenAI TTS, and Replicate/MiniMax. No stock voice is treated as the UrAi voice merely because a provider supplies one.

Provider-returned artifact URLs and provider-supplied reference URLs are rejected when they resolve syntactically to loopback, RFC1918/private IPv4, link-local IPv4, IPv6 loopback/unspecified, IPv6 unique-local, or IPv6 link-local host literals. Video and non-video provider downloaders enforce the same boundary. Meshy image and multi-image reference URLs use the same public-URL guard.

Supported production provider transport is HTTPS-only. Provider JSON/artifact requests reject redirects rather than following them across a trust boundary. Direct binary provider responses are governed by the configured maximum-byte ceiling; authenticated JSON POSTs reject redirects as well.

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

These are not counted as AI generation providers:
- RealityScan / Polycam / photogrammetry: real-world capture/reconstruction inputs.
- Blender: cleanup, normalization, LOD, validation, and finishing authority.
- Substance: human-assisted PBR finishing lane where used.
- HeyGen, Google Veo, Kling, Luma, Adobe Firefly and other named media vendors are not current Asset Factory runtime providers merely because they may exist elsewhere in the broader UrAi ecosystem or future plans; they require explicit integration and evidence before being added to this authority.

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

1. dedicated Asset Factory production target/site/base URL are provider-generated and verified;
2. short-lived GitHub OIDC/WIF deployment identity is configured for that dedicated target;
3. credential exists in approved secret storage;
4. deployed runtime is bound to that secret;
5. server-side modality selector enables the provider;
6. budget ceiling and spend authorization are active;
7. real minimal governed smoke succeeds;
8. artifact is captured into UrAi storage;
9. provenance is recorded;
10. consuming system successfully uses it;
11. exact-head evidence is retained.

The no-spend readiness surface reports explicit blockers including `dedicated-production-target-not-configured`, `wif-not-configured`, `provider-live-smoke-not-certified`, provider credential/model/endpoint blockers, approved-voice blockers, account-capability blockers, and provider-spend authorization.

Code presence alone is not live-provider certification.
