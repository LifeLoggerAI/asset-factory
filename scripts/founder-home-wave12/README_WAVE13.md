# UrAi World 001 â Wave 13 V3 modeled source (research only)

This is a **non-destructive successor** to the existing Wave 12 founder-aligned Home architectural study, in `LifeLoggerAI/asset-factory` PR #491. It imports the retained V2 authoring source rather than replacing or rebuilding it. All source is in `scripts/founder-home-wave12/`.

**Source truth:** `MODELED INTERPRETIVE / NOT AUTOBIOGRAPHICAL / NOT PHYSICAL PHOTOGRAPHY`. The four original founder images are PRIVATE visual references, not calibrated cameras, and are never embedded in public code, PNG test frames, textures or GLB.

## Actual authoring changes

* Single right-handed Y-up coherent GLB; 1,262 semantic geometry nodes and 64,958 indexed triangles in the tested V3 build.
* The same doorway, tree root, gathering area and Orb anchor coordinate meanings as V2, without overwriting V2.
* Additional hand-built architectural masonry, worn entry path, outer gathering-area cobbles, woven bark supports, much smaller canopy leaf clusters, grounded shrubs.
* Six original URAI-owned procedural 512-pixel color/roughness texture pairs embedded by UV-mapped glTF materials. **Prototype textures; NOT final photoreal assets or licensed external materials.**
* Four real 1280Ã720 software camera renders from one GLB, with artistically inferred viewing poses (no recovered original camera metadata).

## Model/research replay (no provider spend)

Create a separate output directory and set `URAI_FOUNDER_HOME_OUTPUT` there. Python dependencies: NumPy, trimesh, Pillow, VTK, OpenCV. Standard `.py` scripts are a reproducible research pipeline, NOT certified deployment tools. If offscreen VTK requires Xvfb, use `xvfb-run -a`.

1. `python scripts/founder-home-wave12/author_founder_home_v3.py` and `python scripts/founder-home-wave12/render_founder_home_v3.py`.
2. Set `URAI_OWNER_PRIVATE_W4_LOCK` to the authorized **owner-private**, previously frozen baseline lock receipt. Never publish that lock or original pixels.
3. `python scripts/founder-home-wave12/build_coherent_camera_dataset_v3r2.py train` writes 18 training views and freezes the camera protocol before the separately reserved 6 test images exist.
4. `python scripts/founder-home-wave12/adapt_modeled_segments_to_canonical_preflight.py "$URAI_FOUNDER_HOME_OUTPUT/modeled_acquisition_v3r2"` writes an auditable metadata-only adapter. The existing Jobs preflight uses fixed historic segment ID vocabulary; the appended `modeled_analogue_label` explicitly prevents confusing these new model cameras with historical S07/S04/S08 footage.
5. Run the existing `urai-jobs` canonical `world001-source-correction-preflight.py` using the private baseline lock, frozen source manifest and `--output` to the modeled acquisition directory. This establishes **format only**, NOT geometric or production acceptance.
6. Set `URAI_JOBS_CANONICAL_DESCRIPTOR_SCRIPT` to the actual canonical `urai-jobs` `scripts/world001_train_descriptor_consensus.py`. Run `train_founder_home_v3_with_canonical_consensus.py`. The repaired equal-share training camera-pair budget is strictly training-only, so late pairs are not starved by the 1,600-point cap. This does not change canonical descriptor-consensus rules.
7. **Before any holdout frames exist**, compute a SHA-256 freeze of `evaluate_founder_home_v3_holdout.py`, the frozen training protocol and model. Save `FROZEN_EVALUATOR_BEFORE_HOLDOUT_V3.json` with matching source hashes and status `FROZEN_BEFORE_ANY_V3_TEST_IMAGES_RENDERED`; do not generate test frames before this step. The owner-private Wave 13 bundle contains the frozen evidence from the actual execution.
8. `python scripts/founder-home-wave12/build_coherent_camera_dataset_v3r2.py holdout` renders six pre-registered new viewpoints. `python scripts/founder-home-wave12/evaluate_founder_home_v3_holdout.py` applies **unchanged** 4-pixel per-view median, 8-pixel per-view p90 and full-survey completion.
9. `python scripts/founder-home-wave12/test_founder_home_v3.py` checks actual output bytes and the entire six-view receipt. `check_wave13_public_source.py` runs offline on repo source without any external provider or original private file.

## Preserved results and boundaries

Wave 12 H03 frozen p90 **139.7206 px**: `MODELED_SOURCE_IMAGE_FEATURE_SCREEN_FAILED_NO_TRAINING` remains immutable. Root cause: the first-come 1,600 training candidate cap filled before later camera-pairs; along with descriptor aliases this severely reduced late-view reliable features. Frozen Wave 13 successor: **18 actual modeled training PNGs, 843 retained canonical-consensus points, 6 new withheld images, 6/6 views localized and every p90 below 8 px**. This is `MODELED_SOURCE_IMAGE_FEATURE_SCREEN_PASS_RESEARCH_ONLY`, and not original-survey acceptance, photoreal visual acceptance or authorization for Splatfacto.

The model has approximate materials; normal maps, high-fidelity scan-derived stone, bark and foliage, terrain, physical sunlight, real-world collision mesh, accepted navigable Orb and independently approved Home remain outstanding. **0 production frames admitted; Gaussian GPU hard off; no paid provider generation, LIVE billing, or protected production deploy.**
