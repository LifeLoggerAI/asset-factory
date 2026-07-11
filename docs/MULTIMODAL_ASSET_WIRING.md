# Multimodal Asset Wiring

This document describes the Studio-side wiring for deterministic local proof assets and guarded provider-backed artifacts across the core Asset Factory modalities: graphics, 3D models, audio/sound, video, and bundles.

## Supported asset families

| Canonical type | Aliases | Renderer mode | Default artifact | MIME type | Purpose |
| --- | --- | --- | --- | --- | --- |
| `graphic` | `graphic`, `graphics`, `image`, `visual`, `svg`, `png`, `webp`, `icon`, `logo`, `texture`, `body/neutral` | `svg-proof` | `.svg` | `image/svg+xml` | Deterministic visual proof assets for thumbnails, graphics, textures, logos, and general 2D output. |
| `model3d` | `model`, `model3d`, `3d`, `mesh`, `gltf`, `glb`, `avatar`, `prop`, `environment` | `spatial-renderer` | `.gltf` | `model/gltf+json` | Deterministic GLTF proof assets for spatial/model workflows. |
| `audio` | `audio`, `sound`, `sfx`, `music`, `voice`, `wav`, `mp3`, `ambience` | `audio-renderer` | `.wav` | `audio/wav` | Deterministic WAV proof assets for sound and music workflows. |
| `video` | `video`, `film`, `movie`, `clip`, `short`, `reel`, `animatic`, `mp4`, `webm`, `mov` | `video-animatic` | `.animatic` | `application/vnd.urai.animatic+json` | Deterministic shot timelines for CI and review; guarded Replicate/Fal adapters can return `.mp4`, `.webm`, or `.mov` when explicitly configured. |
| `bundle` | `bundle`, `pack`, `asset-pack`, `collection`, `manifest` | `manifest-only` | `.json` | `application/json` | Bundle manifests for grouping generated assets into a pack. |

The canonical catalog lives in `assetfactory-studio/lib/server/assetTypeCatalog.ts`.

## Request shape

`POST /api/generate` accepts the existing job fields and validates the requested asset type against the catalog.

```json
{
  "jobId": "waiting-room-day-00-doorway",
  "tenantId": "launch",
  "prompt": "A person reaches a doorway into URAI",
  "type": "video",
  "format": "animatic",
  "aspectRatio": "16:9",
  "size": { "width": 1920, "height": 1080 },
  "metadata": {
    "durationSeconds": 6,
    "fps": 24,
    "captionsRequired": true,
    "shots": [
      { "prompt": "The person approaches the doorway", "camera": "slow push-in" },
      { "prompt": "The doorway opens into URAI", "camera": "controlled reveal" }
    ]
  }
}
```

For audio proof assets, `metadata.durationSeconds` and `metadata.sampleRate` can be provided. For video, `metadata.durationSeconds`, `metadata.fps`, accessibility flags, and up to 24 shot records can be provided. For bundles, `metadata.assets` can contain child asset references.

## Generated artifact flow

1. `POST /api/generate` creates a queued job after policy and quota checks.
2. `POST /api/jobs/:jobId/materialize` calls `renderAsset`.
3. The renderer resolves the canonical type.
4. A local video job creates a distinct `${jobId}.animatic` artifact so it cannot collide with the immutable `${jobId}.json` manifest.
5. A provider-backed video job is permitted only when `ASSET_FACTORY_MEDIA_PROVIDER` is `replicate` or `fal`, provider credentials exist, and `ASSET_FACTORY_VIDEO_MODEL` is explicit.
6. Provider artifact downloads require HTTPS, reject private/local hosts, enforce timeouts and byte ceilings, and accept only supported video formats.
7. `GET /api/generated-assets/:file` serves the artifact with a modality-aware content type.
8. `GET /api/usage` reports totals by job status, job type, asset type, renderer mode, format, estimated units, and estimated cost.

## Local proof renderer vs provider adapters

The local implementation intentionally produces deterministic proof artifacts without external credentials or spend:

- Graphics: SVG with hash-derived visual accents.
- 3D models: minimal GLTF proof mesh with hash-derived material metadata.
- Audio: mono WAV proof tone derived from the job hash.
- Video: `.animatic` JSON containing a normalized timeline, deterministic shot seeds, duration, frame rate, captions requirements, and an explicit `productionReady: false` marker.
- Bundles: JSON proof manifest.

The local video artifact is not a finished movie and must never be promoted as provider-rendered footage.

Provider-backed video currently uses the dedicated guarded runtime in `assetVideoProviderRuntime.ts`. Returned footage remains `reviewRequired: true` and `productionReady: false` until creative, legal, accessibility, continuity, provenance, and claim-evidence gates approve the final master.

## Provider configuration

Provider-backed video is disabled unless all required values are explicit.

```text
ASSET_FACTORY_MEDIA_PROVIDER=replicate | fal
ASSET_FACTORY_VIDEO_MODEL=<provider model/version>
REPLICATE_API_TOKEN=<secret>  # for Replicate
FAL_KEY=<secret>              # for Fal
```

Optional safety ceilings:

```text
ASSET_FACTORY_VIDEO_PROVIDER_TIMEOUT_MS=180000
ASSET_FACTORY_VIDEO_PROVIDER_MAX_BYTES=524288000
```

No provider is selected automatically. Missing or unsupported configuration fails closed.

## Policy boundary

- Maximum video duration: 90 seconds per job.
- Maximum dimensions: 3840 × 2160.
- Accepted video outputs: `animatic`, `mp4`, `webm`, `mov`, and the separate immutable JSON manifest.
- Video usage is estimated in seconds with a conservative cost reservation before queueing.
- Provider output is never self-approved.

## Validation

Static multimodal coverage is checked by:

```bash
cd assetfactory-studio
npm test
```

End-to-end multimodal coverage is checked by:

```bash
cd assetfactory-studio
npm run e2e
```

The E2E script exercises `graphic`, `model3d`, `audio`, `video`, and `bundle` generation through the same generate -> materialize -> fetch -> publish -> approve pipeline. The video case verifies the animatic schema, shot count, dedicated extension, and fail-closed production marker.