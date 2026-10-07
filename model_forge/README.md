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

Provider execution requires a protected deployment, authenticated exact-request approval, separate purpose-signed tested provider/proxy cost/runtime controls, a current account-attested API snapshot, and a durable atomic reservation in the existing shared account namespace. The old environment spend bit and a provider credential cannot authorize dispatch. The protected pilot admits one target/provider/attempt; ambiguous creates never auto retry or free reservations. Final native charge receipts are required for settlement. Dry-run always reports provider authorization and execution as false.

The complete record contract, recovery command, #436 image-owner handoff and external activation gates are in [Model Forge protected execution](../docs/production/model-forge-protected-execution.md). A local timeout is not proof of a remote provider cost/runtime ceiling. No source test grants spend or asset promotion authority.

Generated runs live under `model_forge/runs/` and should remain uncommitted until a candidate is deliberately promoted through governance.

## Provider strategy

- **Meshy:** preferred for multiview reference-driven generation and high-resolution PBR candidates.
- **Tripo:** independent high-precision comparison lane.
- **Rodin:** independent high-detail geometry/PBR lane; local reference files are supported.
- **Replicate/Hunyuan:** retained Model Forge adapter using `tencent/hunyuan-3d-3.1`; protected deployment must reuse the repository's existing Google WIF/OIDC → Secret Manager boundary. The current protected pilot admits text only; immutable image upload requires owner integration and verified provider authority before dispatch.

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

- `model_forge/waves/wave-01-ground-canopy-bakeoff.json`: retained Meshy/Tripo/Rodin comparison plan. Its three-provider paid fan-out is superseded by one exact bounded job per grant; dry-run remains available and manufacture needs independent admitted provider jobs.
- `model_forge/waves/wave-02-replicate-hunyuan-ground-canopy.json`: retained one-candidate plan, source/reuse and authenticated spend approval still required.
- Current entry points are `forge.mjs` and `run-wave.mjs`. The former README's `model-forge-replicate-wave.yml` workflow is absent from the refreshed #421 tree and supplies no current execution authority.

## Authority discipline — historical lineage and current source owner

At the 2026-10-07 readback, the source owner is Factory #421, `repair/model-forge-current-main-20261007` at `e0d1ff4967562684a866386662bcc01e7d8af4de`. The protected-spend donor is isolated and unmerged; refresh current head, donor admission and checks before depending on this checkpoint. Factory #436 owns protected Python image dispatch, while Labs #229 remains offline consistency policy. The following #284/#1296 statements describe historical authority and must not be treated as current release or source/spend approval.

PR #284 is the unified Asset Factory production + Model Forge + multimodal successor, open and non-draft at the 2026-09-25 readback. Its current base is PR #278's `converge/asset-factory-terminal-design-security-20260922` branch. Production-hardening PR #281 and Model Forge PR #279 are predecessor lineage incorporated into #284, not its current base. Recover the live #284 base, head, and fresh workflow state from GitHub before execution.

The model inventory and reference-resolution records carry their own explicit recovered Spatial #1296 checkpoint. That checkpoint is historical whenever the live Spatial head differs; do not infer current reconciliation from this README or relabel old proof. Compare the declared dependency checkpoint with live GitHub and inspect the intervening lineage before renewing it. The September 17 Drive Gold Master manifest is historical provenance only, as classified by Final Asset Lock Master RCL-031.

Current production boundary:
- all seven named canonical reference files are resolved and SHA-256 bound;
- current #1296 includes pinned CC0 `ground-polyhaven-jacaranda-web-v1` as an integrated Ground canopy candidate replacing the procedural/unapproved canopy, but its receipt remains `humanReviewApproved=false`, `visualProofVerified=false`, `exactHeadChecksPassed=false`, and fail-closed until proof;
- canonical Ground roots/terrain/geology remain existing runtime authority unless current-head literal pixels prove a specific unresolved gap;
- Replay's retained GLB remains runtime-supporting geometry but not Replay visual authority; Focus's retained chamber remains non-runtime supporting reference while the selected Memory Star remains Focus authority;
- therefore there are **zero currently authorized paid Model Forge production targets**; even the canopy bake-off is source-blocked until the current CC0 candidate is accepted or rejected and a specific remaining gap is proven;
- the paid Replicate wave resolves dedicated production project/WIF/service-account values from the protected production environment and explicitly rejects the historical shared `urai-4dc1d` authority;
- Blender cleanup/LOD/review rendering is runtime-proven with deterministic smoke material, but a smoke fixture is not production art;
- PR workflows must explicitly checkout and verify the pull-request branch head; GitHub's synthetic merge ref is not accepted as exact-head proof.

Do not call the asset program production-complete until any actually required provider candidates are manufactured under bounded authority, cleaned winners are integrated into the then-current Spatial exact head, and the real UrAi route pixels pass governed literal review.

