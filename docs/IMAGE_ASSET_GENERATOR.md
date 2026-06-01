# Image Asset Generator Production Loop

The image asset generator is the manifest-driven loop for URAI visual assets.

## Pipeline

```text
manifest + schema
-> manifest validation
-> local generation
-> asset validation
-> preview gallery
-> Firebase seed metadata
-> ZIP export
-> validation report with hashes
-> CI artifact upload
```

## Source of truth

- `image_asset_generator/manifest.json`
- `image_asset_generator/manifest.schema.json`

Every asset entry should define:

- `name`
- `category`
- `prompt`
- `sizes`
- `alpha`
- `status`
- `path_template`

Optional production fields:

- `description`
- `renderer`
- `prompt_version`
- `firebase_storage_prefix`
- `tags`

## Commands

From the repository root:

```bash
npm run image:install
npm run image:manifest
npm run image:check
```

Individual commands are also available:

```bash
npm run image:generate
npm run image:validate
npm run image:preview
npm run image:seed
npm run image:export
```

## Outputs

The generated outputs are intentionally ignored by git unless a release owner decides to commit them:

- `image_asset_generator/assets/`
- `image_asset_generator/preview.html`
- `image_asset_generator/firebase_seed.json`
- `image_asset_generator/validation_report.json`
- `image_asset_generator/asset_pack.zip`

## CI

The `Image Asset Generator` GitHub Actions workflow runs when image generator files change. It uploads these artifacts:

- `asset_pack.zip`
- `preview.html`
- `validation_report.json`
- `firebase_seed.json`

## Firebase seed contract

`firebase_seed.json` is a no-network metadata export. It is safe for CI. Each record maps a generated local file to a proposed Firebase Storage path and includes SHA-256 verification metadata.

Collection target:

```text
imageAssets
```

Default storage prefix:

```text
urai/image-assets
```

## Production completion checklist

Before production-locking the loop:

- Replace local proof generation in `render_asset()` with the approved renderer/provider adapter.
- Preserve exact manifest output path behavior.
- Add renderer version and prompt version to every manifest entry.
- Add approval metadata when assets are visually accepted.
- Upload approved assets to Firebase Storage using the `storagePath` values in `firebase_seed.json`.
- Import metadata into the `imageAssets` collection.
- Keep SHA-256 hashes in the report for release evidence.
- Attach `validation_report.json` and `asset_pack.zip` to release evidence.

## Status flow

```text
prompted -> generated -> validated -> previewed -> approved -> committed -> shipped
```
