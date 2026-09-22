# URAI Image Asset Generator Loop

This directory contains the first complete local loop for URAI image assets.

Pipeline:

```text
manifest -> generation -> validation -> preview -> export
```

## Files

- `manifest.json` - canonical registry for names, categories, prompts, sizes, alpha requirements, status, and output paths.
- `generate_assets.py` - local deterministic placeholder renderer for missing PNG assets.
- `validate_assets.py` - checks file existence, dimensions, and RGBA alpha requirements.
- `create_preview.py` - builds a static HTML review gallery.
- `export_assets.py` - bundles assets, manifest, and preview into a ZIP archive.

## Usage

Run from this directory:

```bash
python generate_assets.py
python validate_assets.py
python create_preview.py
python export_assets.py
```

## Next integration step

The current generator creates deterministic placeholders so the loop can be tested without an external model. To wire in final art generation, keep `manifest.json` as the source of truth and replace `render_asset()` in `generate_assets.py` with the approved renderer while preserving exact output paths.

Recommended status flow:

```text
prompted -> generated -> validated -> previewed -> approved -> committed -> shipped
```


## Visual authority boundary

Pipeline success is **not** visual acceptance.

- `renderer: offline-safe` outputs are deterministic **proof-only** placeholders.
- provider-rendered outputs are **candidates**, not accepted art.
- every newly generated output is `acceptance: unreviewed`.
- generation alone always leaves `promotion_eligible: false`.
- only a separate inspect → accept/reject → promote decision may create production visual authority.

The preview gallery and Firebase seed preserve this boundary so a valid pipeline artifact cannot masquerade as a Gold Master or approved product reference.
