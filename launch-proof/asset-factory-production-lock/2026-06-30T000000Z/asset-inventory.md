# Asset Inventory

## Declared manifest-driven PNG image assets

Source: `image_asset_generator/manifest.json`.

The manifest declares 12 logical image assets with 24 expected PNG outputs across two sizes each:

| Name | Category | Sizes | Alpha | Path template | Status in manifest |
| --- | --- | --- | --- | --- | --- |
| home_threshold_main | urai_spatial_home | 1024, 1600 | false | assets/urai/home/home-threshold-main_{size}.png | ready_for_generation |
| home_ground_portal | urai_spatial_home | 1024, 1600 | false | assets/urai/home/home-ground-portal_{size}.png | ready_for_generation |
| home_sky_ascent | urai_spatial_home | 1024, 1600 | false | assets/urai/home/home-sky-ascent_{size}.png | ready_for_generation |
| ground_world_main | urai_spatial_ground | 1024, 1600 | false | assets/urai/ground/ground-world-main_{size}.png | ready_for_generation |
| life_map_galaxy_main | urai_spatial_lifemap | 1024, 1600 | false | assets/urai/life-map/life-map-galaxy-main_{size}.png | ready_for_generation |
| focus_memory_chamber_main | urai_spatial_focus | 1024, 1600 | false | assets/urai/focus/focus-memory-chamber-main_{size}.png | ready_for_generation |
| replay_memory_film_main | urai_spatial_replay | 1024, 1600 | false | assets/urai/replay/replay-memory-film-main_{size}.png | ready_for_generation |
| mirror_chamber_main | urai_spatial_mirror | 1024, 1600 | false | assets/urai/mirror/mirror-chamber-main_{size}.png | ready_for_generation |
| passport_consent_vault_main | urai_spatial_passport | 1024, 1600 | false | assets/urai/passport/passport-consent-vault-main_{size}.png | ready_for_generation |
| location_map_emotional_weather | urai_spatial_location_map | 1024, 1600 | false | assets/urai/location-map/location-map-emotional-weather_{size}.png | ready_for_generation |
| orb_states | urai_spatial_ui | 256, 512 | true | assets/urai/ui/orb-states_{size}.png | ready_for_generation |
| workforce_avatar_pack | urai_spatial_avatars | 512, 1024 | true | assets/urai/avatars/workforce-avatar-pack_{size}.png | ready_for_generation |

Notes:
- The manifest is ready to generate local proof assets.
- Generated binary PNG outputs were not found tracked at the expected paths during GitHub contents lookup for `image_asset_generator/assets/urai/home/home-threshold-main_1024.png`.
- `.gitignore` ignores broad generated/historical output folders, but the specific `image_asset_generator/assets/...` tree is not explicitly ignored. Decide whether these generated PNGs should be tracked release assets or generated-only CI artifacts.

## Studio/API multimodal proof asset types

Source: `docs/MULTIMODAL_ASSET_WIRING.md` and Studio scripts.

| Canonical type | Default artifact | Renderer mode | Purpose |
| --- | --- | --- | --- |
| graphic | .svg | svg-proof | deterministic visual proof assets |
| model3d | .gltf | spatial-renderer | deterministic GLTF proof mesh |
| audio | .wav | audio-renderer | deterministic WAV proof tone |
| bundle | .json | manifest-only | deterministic bundle manifest |

## Generated outputs expected by pipeline

When `python image_asset_generator/run_pipeline.py` passes, expected outputs are:

- `image_asset_generator/assets/.../*.png` for declared manifest outputs.
- `image_asset_generator/preview.html`.
- `image_asset_generator/firebase_seed.json`.
- `image_asset_generator/asset_pack.zip`.
- `image_asset_generator/validation_report.json` with per-asset SHA-256 hashes.

## Current inventory conclusion

Asset Factory has a real manifest and deterministic generation code. It does not yet have fresh generated-output proof from this audit environment, and therefore the generated asset inventory must be treated as declared/expected until CI or a local workstation runs the pipeline and attaches `validation_report.json` plus artifact checksums.
