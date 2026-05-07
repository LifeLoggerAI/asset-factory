# Multimodal Asset Wiring

This document describes the Studio-side wiring for deterministic local proof assets across the core Asset Factory modalities: graphics, 3D models, audio/sound, and bundles.

## Supported asset families

| Canonical type | Aliases | Renderer mode | Default artifact | MIME type | Purpose |
| --- | --- | --- | --- | --- | --- |
| `graphic` | `graphic`, `graphics`, `image`, `visual`, `svg`, `png`, `webp`, `icon`, `logo`, `texture`, `body/neutral` | `svg-proof` | `.svg` | `image/svg+xml` | Deterministic visual proof assets for thumbnails, graphics, textures, logos, and general 2D output. |
| `model3d` | `model`, `model3d`, `3d`, `mesh`, `gltf`, `glb`, `avatar`, `prop`, `environment` | `spatial-renderer` | `.gltf` | `model/gltf+json` | Deterministic GLTF proof assets for spatial/model workflows. |
| `audio` | `audio`, `sound`, `sfx`, `music`, `voice`, `wav`, `mp3`, `ambience` | `audio-renderer` | `.wav` | `audio/wav` | Deterministic WAV proof assets for sound and music workflows. |
| `bundle` | `bundle`, `pack`, `asset-pack`, `collection`, `manifest` | `manifest-only` | `.json` | `application/json` | Bundle manifests for grouping generated assets into a pack. |

The canonical catalog lives in `assetfactory-studio/lib/server/assetTypeCatalog.ts`.

## Request shape

`POST /api/generate` accepts the existing job fields and validates the requested asset type against the catalog.

```json
{
  "jobId": "example-graphic-001",
  "tenantId": "demo",
  "prompt": "Generate a neon icon set",
  "type": "graphic",
  "format": "svg",
  "size": { "width": 1024, "height": 1024 },
  "metadata": { "style": "neon" }
}
```

For audio proof assets, `metadata.durationSeconds` and `metadata.sampleRate` can be provided. For bundles, `metadata.assets` can contain child asset references.

## Generated artifact flow

1. `POST /api/generate` creates a queued job.
2. `POST /api/jobs/:jobId/materialize` calls `renderAsset`.
3. The renderer picks the adapter from `resolveAssetType(type)`.
4. The generated artifact and `${jobId}.json` manifest are written to `.asset-factory-local/generated`.
5. `GET /api/generated-assets/:file` serves the artifact with a modality-aware content type.
6. `GET /api/usage` reports totals by job status, job type, asset type, renderer mode, and format.

## Local proof renderer vs provider adapters

The current implementation intentionally produces deterministic proof artifacts without external credentials:

- Graphics: SVG with hash-derived visual accents.
- 3D models: minimal GLTF proof mesh with hash-derived material metadata.
- Audio: mono WAV proof tone derived from the job hash.
- Bundles: JSON proof manifest.

Production provider adapters should replace only the renderer internals while preserving the catalog, API contract, storage paths, manifest fields, and E2E assertions.

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

The E2E script exercises `graphic`, `model3d`, `audio`, and `bundle` generation through the same generate -> materialize -> fetch -> publish -> approve pipeline.
