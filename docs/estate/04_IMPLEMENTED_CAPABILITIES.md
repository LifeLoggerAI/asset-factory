# Asset Factory — what exists vs what is accepted

| Capability | Evidence and precise scope | R1 classification |
| --- | --- | --- |
| Canonical image input and release versioning | `image_asset_generator/`, `docs/contracts/CANONICAL_VERSION_ASSET_CONTRACT.md`, 213 identities | SOURCE VERIFIED. 47+source prompts must not be conflated with produced bytes |
| Image generator, preview, validation and export scripts | `image_asset_generator/generate_assets.py`, `validate_assets.py`, `create_preview.py`, `export_assets.py`, `export_spatial_handoff.py` | SOURCE VERIFIED; placeholders and source contracts are not literal final artwork |
| Provider generation controls / spending | `provider_renderer.py`, `paid_request_guard.py`, `model_forge/model-spend-client.mjs`, Studio `productionSpend.ts`, `protectedProviderRequest.ts` at #421 | SOURCE VERIFIED; current paid provider runtime unverified, no call made |
| GLB build, validator, PBR / LOD and scenes | `model_forge/forge.mjs`, `validate-glb.mjs`, `glb-container.mjs`, Blender `clean-export.py`/`render-review.py`, generic world builders | SOURCE VERIFIED; archived real binaries must be materialized, validated and accepted separately |
| Real runtime 3D assets | Spatial main 24 tracked GLBs including home chamber, Council rigs and Orb; 20 glTF scenes | GIT TRACKED PATH/BLOB VERIFIED; source/license and actual rendering on current app/device not certified |
| Saved GLB external archive | Nov 4 historical preserved 26 GLBs / 68,094,300 bytes / SHA report | HISTORICALLY BYTE VERIFIED; present re-download and use approval unverified; overlaps Spatial |
| Generic World Library v1.0.2 | archived 278,133,223-byte, 657-file evidence record; 96 GLBs | HISTORICAL PRODUCER RECEIPT; actual archive presently inaccessible, explicitly `NEEDS_REWORK` |
| Studio local full modality life cycle | `docs/MULTIMODAL_ASSET_WIRING.md`; `assetfactory-studio/lib/server/*` | SOURCE VERIFIED; historical local E2E claimed, not re-run on current SHA |
| Protected dedicated Factory cloud | `LAUNCH_READINESS.md`, `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` | PRODUCTION UNVERIFIED; explicit `NOT LOCKED` |
| Tripo V3 migration | owner #421 contains #480, `TRIPO_V3_MIGRATION.md` | SOURCE VERIFIED on #421, not on main; provider request/signed spend unverified |
| Runway 12-source Home task recovery | `model_forge/evidence/home-runway-world001-tasks-20261004.json`; PR #339, #491 | REQUEST/TASK-IDENTITY VERIFIED; no present output bytes/novel-view training/Gold Master verified |
| Digital human and cinematic final | `model_forge/digital-human-aaa-readiness.json`, `film_foundry/finite_time`, waiting-room | SPEC + PARTIAL SOURCE; voice/rig/animation/rights/final footage unverified |
| Cross-service Storytime export | `urai-storytime/src/lib/storytime/asset-factory.ts` | SOURCE VERIFIED but deliberate hard-off default; current positive runtime unverified |

**Interpretation:** Built systems and genuine historically produced media are present. `SOURCE VERIFIED` does not mean `NEEDS_BUILD`; it means real implementation exists but this audit cannot promote it to `INTEGRATED_RUNTIME`, `DEVICE` or `PRODUCTION` without corresponding evidence.
