# Replicate provider authentication boundary — 2026-08-10

## Verified state

- Replicate account is funded with a $20 one-time credit purchase on 2026-08-10.
- `REPLICATE_API_TOKEN` exists in Google Cloud Secret Manager with Version 1 enabled.
- Asset Factory PR #229 merged the App Hosting runtime secret reference into `main`.
- The Replicate adapter supports graphic, model3d, and audio provider paths.

## Newly identified compatibility blocker

Current `assetfactory-studio/lib/server/assetProviderRuntime.ts` sends Replicate requests with:

```text
Authorization: Token <REPLICATE_API_TOKEN>
```

Replicate's current HTTP API documentation requires:

```text
Authorization: Bearer <REPLICATE_API_TOKEN>
```

The adapter therefore must be updated before a paid provider smoke is attempted.

## Model candidate

For the first controlled model3d smoke, current Replicate guidance identifies `tencent/hunyuan-3d-3.1` as its preferred all-around 3D model. It accepts a text prompt and returns a GLB output. Do not activate it until the authentication header and App Hosting secret-read permission are verified.

## Remaining gates

1. Grant the `assetfactory-studio` App Hosting backend access to `REPLICATE_API_TOKEN` in project `urai-4dc1d`, region `us-central1`.
2. Change Replicate authorization from `Token` to `Bearer` for prediction creation and polling.
3. Configure a reviewed model identifier/version for `ASSET_FACTORY_MODEL3D_MODEL`.
4. Keep `ASSET_FACTORY_MEDIA_PROVIDER` dormant until the bounded smoke is authorized.
5. Run exactly one controlled provider-backed model3d smoke and retain the prediction ID, cost, model identity, output GLB metadata, and validation result.

No provider spend is authorized by this evidence file itself.
