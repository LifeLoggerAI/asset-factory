# URAI Image Asset Generator Loop

This directory contains the manifest-driven URAI image asset loop.

```text
manifest -> generation -> validation -> preview -> production visual gate -> seed -> export
```

The deterministic offline renderer exists for **mechanical and diagnostic proof only**. Its output is not production visual authority.

## Core files

- `manifest.json` — canonical registry for names, categories, prompts, sizes, alpha requirements, status, and output paths.
- `generate_assets.py` — provider adapter plus deterministic offline renderer.
- `validate_assets.py` — file, dimension, and alpha checks.
- `run_pipeline.py` — mechanical report plus production visual gate orchestration.
- `production_visual_gate.json` — machine-readable production eligibility decision for the current run.
- `create_preview.py` — static review gallery with authority labeling.
- `create_firebase_seed.py` — no-network metadata seed; production eligibility is inherited from the current in-process global gate.
- `export_assets.py` — self-describing asset pack ZIP.

## No-spend proof

```bash
ASSET_RENDERER_MODE=offline \
ASSET_PIPELINE_REQUIRE_PRODUCTION_VISUALS=0 \
python image_asset_generator/run_pipeline.py
```

A successful offline run means mechanical packaging/integrity passed. It should still report production visual authority and promotion as blocked.

## Production-required mode

```bash
ASSET_PIPELINE_REQUIRE_PRODUCTION_VISUALS=1 \
python image_asset_generator/run_pipeline.py
```

This fails closed unless all retained visuals satisfy the production gate. It does not authorize provider spend.

## Production gate

Production visual authority requires provider-backed per-file provenance, no missing render metadata, no semantic duplicate-hash collisions, explicit visual approval, and no mechanical validation errors.

Recommended status flow:

```text
prompted -> generated -> validated -> previewed -> approved -> committed -> shipped
```

Those statuses do not bypass the global production visual gate.
