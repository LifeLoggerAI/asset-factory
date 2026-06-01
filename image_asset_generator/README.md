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
