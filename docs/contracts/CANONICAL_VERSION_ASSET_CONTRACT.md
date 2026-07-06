# Canonical URAI Version Asset Contract

Last verified: 2026-07-06

## Authority

The production asset version contract is defined by:

1. `image_asset_generator/canonical_version_catalog.json`
2. `image_asset_generator/canonical_release_manifests.py`
3. `image_asset_generator/forge_versioned.py`
4. `image_asset_generator/check_canonical_version_contract.py`

The supported forge entry point is:

```bash
python image_asset_generator/forge_versioned.py --version v1|v2|v3|v4|v5
```

`forge_versioned_legacy.py`, `version_catalog.json`, and the pre-canonical manifest builders are compatibility/source-material files. They do not define public release numbering or provider certification evidence.

## Canonical counts and meanings

| Version | Meaning | Canonical generated manifest | Expected outputs | Asset prefix |
| --- | --- | --- | ---: | --- |
| V1 | Genesis Public Route World | `manifests/generated/v1.manifest.json` | 53 | `assets/urai` |
| V2 | Living System States | `manifests/generated/v2.manifest.json` | 80 | `assets/urai/v2` |
| V3 | Relationship, Shadow and Pattern World | `manifests/generated/v3-canonical.manifest.json` | 14 | `assets/urai/v3` |
| V4 | WebXR, AR and VR Pathway | `manifests/generated/v4-canonical.manifest.json` | 39 | `assets/urai/xr` |
| V5 | Mirror of Becoming and Autonomous Legacy | `manifests/generated/v5-canonical.manifest.json` | 27 | `assets/urai/v5` |

## Source-material mapping

- Canonical V3 uses the 14-entry relationship/legacy source manifest.
- Canonical V4 remaps the generated 39-entry XR graphics set into the V4 release contract.
- Canonical V5 combines the remapped autonomous-council source set with the legacy-governance source set for 27 outputs.

Old source filenames may contain earlier version labels. Those names describe historical source-material organization, not the current release contract.

## Certification rules

A manifest count is not a provider receipt.

A version becomes provider-ready only when the receipt contains:

- canonical version;
- canonical manifest path and SHA-256;
- expected output count matching this contract;
- provider renderer identity;
- successful forge exit code;
- quality report with the full passed count;
- zero-missing Spatial handoff;
- optimized derivatives and checksums;
- Spatial promotion branch or pull request;
- runtime wiring and visual-regression evidence.

V4 additionally requires physical browser/device validation before any headset, Quest, AR, or WebXR certification claim.

## Paid-action boundary

Provider workflows must be manually dispatched, require exact typed authorization, and use the `paid-asset-generation` environment. Pull requests and ordinary pushes may run validation only. They must not expose provider credentials or invoke provider rendering.

## Required check

Run:

```bash
npm run image:check:version-contract
```

The check builds every canonical manifest without making a provider call and fails on count, prefix, manifest-path, duplicate-name, or duplicate-path drift.
