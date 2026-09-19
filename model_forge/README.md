# URAI Model Forge

Provider-agnostic 3D manufacturing lane for launch-critical UrAi assets.

## Why this exists

The factory owns design intent, provenance, validation, cleanup, literal-pixel review, and promotion. Meshy, Tripo, Rodin, Replicate/Hunyuan, or any later generator is replaceable manufacturing capacity, not the art director and not production authority.

## Pipeline

```text
canonical references/spec
-> provider bake-off (Meshy / Tripo / Rodin / Replicate-Hunyuan)
-> candidate GLB + provenance
-> structural GLB validation
-> Blender cleanup / scale normalization / LOD0-2 export
-> render inside the actual UrAi scene
-> literal-pixel comparison against authority
-> explicit approval
-> governed promotion into urai-spatial
```

No provider candidate is automatically production-approved.

## Safety / spend boundary

Dry-run is the default proof path and makes zero provider calls:

```bash
node model_forge/forge.mjs --spec model_forge/specs/ground-hero-tree.json --dry-run
```

Provider calls are fail-closed unless both conditions are true:

1. required provider credential is available (`MESHY_API_KEY`, `TRIPO_API_KEY`, `RODIN_API_KEY`, or `REPLICATE_API_TOKEN` through its governed boundary), and
2. `URAI_MODEL_FORGE_SPEND_AUTHORIZED=1` is deliberately set for that execution.

Generated runs live under `model_forge/runs/` and should remain uncommitted until a candidate is deliberately promoted through governance.

## Provider strategy

- **Meshy:** preferred for multiview reference-driven generation and high-resolution PBR candidates.
- **Tripo:** independent high-precision comparison lane.
- **Rodin:** independent high-detail geometry/PBR lane; local reference files are supported.
- **Replicate/Hunyuan:** first-class Model Forge adapter using `tencent/hunyuan-3d-3.1`; the protected paid lane intentionally reuses the repository's existing Google WIF/OIDC → Secret Manager boundary rather than duplicating the token into ordinary Actions secrets. Hunyuan 3D 3.1 accepts text or one image; explicit multiview stays with Meshy/Tripo/Rodin.

Use references whenever design fidelity matters. Text-only generation is allowed for exploration, not final authority.

## Validate a candidate

```bash
node model_forge/validate-glb.mjs model_forge/runs/.../candidate.glb 200000
```

Forge also performs structural GLB validation immediately after provider download. A malformed, meshless, unsupported-required-extension, or over-budget candidate is rejected before bake-off status. The standalone validator remains useful for independent revalidation.

Structural validity does not equal visual acceptance.

## Blender cleanup and LODs

```bash
blender --background --python model_forge/blender/clean-export.py -- \
  --input model_forge/runs/.../candidate.glb \
  --output-dir model_forge/runs/.../cleaned \
  --target-meters 9
```

The cleanup v2 script applies transforms, removes duplicate/loose geometry, recalculates normals, grounds the pivot, normalizes metric scale, checks natural-material sanity and missing textures, enforces LOD ordering/budgets, and emits hashed `lod0.glb`, `lod1.glb`, `lod2.glb`, plus a cleanup receipt. Use `model_forge/blender/render-review.py` for standardized front / three-quarter / side / back literal review renders.

## Promotion rule

Do not copy a candidate into `urai-spatial` because a provider call succeeded. Promotion requires the governed chain:

`candidate -> validated -> cleaned -> scene-rendered -> literal-pixel accepted -> approved -> promoted`.


## Bounded launch waves

- `model_forge/waves/wave-01-ground-canopy-bakeoff.json`: Meshy + Tripo + Rodin, one attempt each, maximum three candidates.
- `model_forge/waves/wave-02-replicate-hunyuan-ground-canopy.json`: Replicate/Hunyuan, one attempt, maximum one candidate.
- `.github/workflows/model-forge-replicate-wave.yml`: main-only, production-environment-gated WIF/OIDC execution for Wave 2. It requires the exact dispatch phrase `RUN_ONE_URAI_REPLICATE_MODEL_WAVE`, creates at most one candidate, validates it, retains provenance, and grants no promotion authority.

## Authority discipline — 2026-09-19

PR #274 is the Model Forge source authority while it remains open. Do not hard-code a mutable PR head in this README: every source edit creates a successor and makes such prose stale. Recover the live PR head and fresh workflow state from GitHub before execution.

The model inventory/reference-resolution receipts record the Spatial head they were reconciled against. If Spatial #1237 moves, compare the successor before treating those receipts as current. Ground/Replay ownership must be rechecked if relevant Spatial source changes.

Current external execution boundaries:
- ordinary Actions secrets for Meshy / Tripo / Rodin / Replicate are absent;
- Replicate has an existing protected Google WIF/OIDC → Secret Manager token path, but the Model Forge paid workflow is main-only and this draft PR is not merged;
- canonical current reference-pack PNG filenames remain unresolved as actual current files across GitHub, connected Drive, and ChatGPT Library; historical May storyboards are not current reference authority;
- Blender scripts are source/CI-verified, but real Blender cleanup/render proof requires a Blender-capable runtime after an actual candidate exists.

Do not call the asset program production-complete until real candidates exist, cleaned winners are integrated into the then-current Spatial exact head, and the actual UrAi scene pixels pass governed literal review.
