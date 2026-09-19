# Image Asset Generator Proof and Production Gate

The image asset generator is the manifest-driven loop for URAI visual assets.

The loop deliberately separates **mechanical proof** from **production visual authority**. A green local/offline pipeline proves packaging and integrity only. It does not certify fallback imagery as production art.

## Pipeline

```text
manifest + schema
-> manifest validation
-> local/provider generation
-> asset validation
-> preview gallery
-> production visual gate
-> fail-closed Firebase seed eligibility
-> validation report with hashes/provenance
-> self-describing ZIP export
-> CI artifact upload
```

## Source of truth

- `image_asset_generator/manifest.json`
- `image_asset_generator/manifest.schema.json`
- per-file `*.png.render.json` provenance produced with each retained image
- `production_visual_gate.json` for the current pipeline execution

Every asset entry should define `name`, `category`, `prompt`, `sizes`, `alpha`, `status`, and `path_template`.

Optional fields include `description`, `renderer`, `prompt_version`, `firebase_storage_prefix`, and `tags`.

## No-spend mechanical proof

Use explicit offline mode:

```bash
ASSET_RENDERER_MODE=offline \
ASSET_PIPELINE_REQUIRE_PRODUCTION_VISUALS=0 \
python image_asset_generator/run_pipeline.py
```

Expected result:

- pipeline mechanical status: `passed`;
- `status_scope: mechanical_integrity_only`;
- production visual gate: `blocked`;
- `production_visual_authority: false`;
- `promotion_allowed: false`;
- Firebase seed: `productionEligible: false`;
- Firebase seed usage policy: `diagnostic-only-do-not-promote`.

## Production-required fail-closed mode

A production/promotion lane may require:

```bash
ASSET_PIPELINE_REQUIRE_PRODUCTION_VISUALS=1 \
python image_asset_generator/run_pipeline.py
```

The command exits non-zero unless the current retained pack satisfies the complete production visual gate. Requiring production visuals does not authorize provider spend by itself; provider execution remains separately configured and governed.

Production visual eligibility requires, at minimum:

- provider-backed render provenance for every retained visual;
- per-file render metadata present;
- no semantic duplicate-hash collision across distinct required assets;
- explicit `approved`, `committed`, or `shipped` manifest status;
- no mechanical validation errors.

## Outputs

Generated outputs are ignored by git unless a release owner explicitly chooses otherwise:

- `image_asset_generator/assets/`
- `image_asset_generator/preview.html`
- `image_asset_generator/firebase_seed.json`
- `image_asset_generator/validation_report.json`
- `image_asset_generator/production_visual_gate.json`
- `image_asset_generator/asset_pack.zip`

`asset_pack.zip` is self-describing: it contains the fresh validation report, production visual gate, Firebase seed, preview, manifest, images, and per-image render metadata.

## Firebase seed contract

`firebase_seed.json` is a no-network metadata export. It is **not** permission to publish or promote assets.

Production eligibility is fail-closed. The seed can say `productionEligible: true` only when the current in-process global production visual gate is eligible and the individual record is provider-backed, has render provenance, and has explicit visual approval. Standalone seed generation without a current in-process gate remains diagnostic-only.

Never import/promote a seed whose:

- `productionEligible` is false;
- `productionGateEligible` is false;
- `usagePolicy` is `diagnostic-only-do-not-promote`.

## CI

`Asset Factory Pipeline Proof` runs the no-spend offline mechanical proof, exercises the production-required negative path, verifies the ZIP is self-describing, and uploads the mechanical artifact.

`Image Asset Validation` validates manifests, no-spend forge planning, and the production visual gate contract. Its optional `BUILD_LOCAL_PACK` job is explicitly local/offline and non-production.

`Asset Factory Release Readiness` also treats this generated pack as offline mechanical evidence. Provider-backed production art remains a separately governed requirement.

## Historical evidence

Files under dated `launch-proof/` directories are historical receipts. They do not override the current exact-head gate, report, retained artifact, or PR source truth.

## Status flow

```text
prompted -> generated -> validated -> previewed -> approved -> committed -> shipped
```

The status flow is necessary but not sufficient: production promotion still requires the current production visual gate to be eligible.
