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

Forge, the standalone candidate validator and the protected Replicate smoke leaf retain one hashed GLB. Their candidate boundary requires buffer and image resources embedded in that file, in line with the existing decoded-asset policy. External sidecars, data URIs and images without a backed bufferView are rejected before candidate evidence or smoke output is recorded. The general container parser still supports external-resource GLBs when this candidate policy is not requested. This byte-custody check does not replace full decoding, art review or runtime/device acceptance.

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

## Authority discipline — historical convergence checkpoint (2026-09-25)

This section preserves the 2026-09-25 convergence checkpoint. It does not identify today's candidate or grant current provider, spend, promotion, or release authority. Use the [Labs estate completion register](https://github.com/LifeLoggerAI/urai-labs-llc/issues/61) and the existing [Asset Factory live-evidence owner issue](https://github.com/LifeLoggerAI/asset-factory/issues/63) to resolve current successors, then read back their live GitHub base/head and exact-head evidence before execution. Any readback expires when the relevant source, configuration, approval, or deployed artifact changes; predecessor proof does not transfer.

At the 2026-09-25 readback, PR #284 was the unified Asset Factory production + Model Forge + multimodal successor, open and non-draft. Its recorded base was PR #278's `converge/asset-factory-terminal-design-security-20260922` branch. Production-hardening PR #281 and Model Forge PR #279 were predecessor lineage incorporated into #284, not that recorded base. This lineage is historical; select today's successor through the current owner/register links above, not through this checkpoint.

The model inventory and reference-resolution records carry their own explicit recovered Spatial #1296 checkpoint. That checkpoint is historical whenever the live Spatial head differs; do not infer current reconciliation from this README or relabel old proof. Compare the declared dependency checkpoint with live GitHub and inspect the intervening lineage before renewing it. The September 17 Drive Gold Master manifest is historical provenance only, as classified by Final Asset Lock Master RCL-031.

Production boundary recorded at the historical checkpoint:
- all seven named canonical reference files are resolved and SHA-256 bound;
- at that checkpoint, Spatial #1296 included pinned CC0 `ground-polyhaven-jacaranda-web-v1` as an integrated Ground canopy candidate replacing the procedural/unapproved canopy, but its receipt remains `humanReviewApproved=false`, `visualProofVerified=false`, `exactHeadChecksPassed=false`, and fail-closed until proof;
- canonical Ground roots/terrain/geology remain existing runtime authority unless current-head literal pixels prove a specific unresolved gap;
- Replay's retained GLB remains runtime-supporting geometry but not Replay visual authority; Focus's retained chamber remains non-runtime supporting reference while the selected Memory Star remains Focus authority;
- that checkpoint recorded **zero authorized paid Model Forge production targets**; the canopy bake-off was source-blocked until the CC0 candidate was accepted or rejected and a specific remaining gap was proven;
- the paid Replicate wave resolves dedicated production project/WIF/service-account values from the protected production environment and explicitly rejects the historical shared `urai-4dc1d` authority;
- Blender cleanup/LOD/review rendering is runtime-proven with deterministic smoke material, but a smoke fixture is not production art;
- PR workflows must explicitly checkout and verify the pull-request branch head; GitHub's synthetic merge ref is not accepted as exact-head proof.

Do not call the asset program production-complete until any actually required provider candidates are manufactured under bounded authority, cleaned winners are integrated into the then-current Spatial exact head, and the real UrAi route pixels pass governed literal review.
