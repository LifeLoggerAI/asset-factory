# Generic World exported-byte QA

`validate.py` independently reads GLB2 chunks, bufferViews, accessors, image data,
material bindings, and scene transforms. It does not use the production
generator's triangle or bounding-box summaries. `validate_package.py` checks
versioned package dependency bytes/hashes and horizontal navigation metadata.
Both return JSON on stdout, accept `--report`, and exit nonzero on errors.

```sh
python model_forge/generic-worlds/v1/qa/validate.py path/to/lod0.glb --max-triangles 150000 --max-bytes 50000000 --max-texture-size 2048 --report path/to/qa-desktop.json
python model_forge/generic-worlds/v1/qa/validate.py path/to/collision.glb --kind collision --report path/to/qa-collision.json
python model_forge/generic-worlds/v1/qa/validate_package.py path/to/package.json --report path/to/qa-package.json
python -m unittest discover -s model_forge/generic-worlds/v1/qa -p 'test_*.py' -v
python model_forge/generic-worlds/v1/qa/run_tests.py --report path/to/versioned-test-receipt.json
python model_forge/generic-worlds/v1/qa/run_all.py model_forge/generic-worlds/v1/packages --report path/to/versioned-qa-index.json
python model_forge/generic-worlds/v1/qa/run_all.py model_forge/generic-worlds/v1 --version 1.0.1 --report path/to/versioned-world-and-kit-qa-index.json
```

Dependencies are Python 3.10+, numpy, and Pillow. No paid service, external
asset, graphics driver, browser, or GLB generation code is required.

`run_all.py` selects the latest semantic version per identifier by default, or an
explicit `--version`. It excludes prior versions with an immutable manifest-hash
record instead of reopening their authority. It validates composed-world
navigation/collision separately from per-element kit hashes and geometry. Kits
do not claim safe navigation until governed scene composition. Output counts
distinguish world `packages` from element `kits`. Tier budgets are structural
design targets and do not prove frame rate. `run_tests.py` records exact tested
source hashes, test IDs, environment versions, log hash, and actual failures.
Both batch/test runners refuse to overwrite an existing receipt.

The GLB checker rejects corrupt lengths/chunks, duplicate/nonstandard JSON,
out-of-bounds buffers/accessors, bad alignment/stride, unsupported mandatory
extensions, nonfinite geometry, incorrect accessor bounds, inconsistent vertex
counts, invalid indices, zero-area triangles, nonunit normals, broken material
and texture references, corrupt/mislabeled images, missing/collapsed required
UVs, cycles/multiple parents, invalid transforms, and configured budget overruns.
It checks declared static-world triangle primitives and embedded PNG/JPEG images;
skinning, animations, morph targets, required Draco/meshopt/KTX2, and external
buffers/images are deliberately outside this profile. Such features cannot earn
a pass by bypassing byte decoding.

Reports include exact SHA-256, chunk/accessor/image inventory, unique and
scene-instanced triangle counts, decoded accessor bytes, PNG/JPEG dimensions,
worst-case RGBA8 texture memory including mipmaps, and transformed scene AABB.
UV tiling outside [0,1] is legitimate and is not rejected. Repeated image hashes,
missing/repeated names, collapsed individual UV triangles, optional unchecked
extensions, and normal/winding disagreement are warnings for follow-up review.
The collision profile omits render-normal requirements; geometric checks still
apply. Reports identify the validator's own SHA-256 for reproducible receipts.

Package checks reject escaped/missing dependencies, hash or byte-count mismatch,
missing profile references, missing collision/navigation records, inconsistent
truth classification, or inflated integration/acceptance flags. Navigation checks
measure convex horizontal cell integrity, agent-expanded obstacle intersections,
and entry/exit/teleport-center containment. Boundaries that only touch are valid.
Cells above/below an obstacle's vertical range are not falsely blocked.

Navigation area is the **sum** of cell areas, not a union estimate. Full teleport
disk clearance, route connectivity, 3D head clearance, runtime navigation baking,
collision behavior, and movement still need distinct verification. A producer's
`clearanceChecked` boolean is preserved as a claim rather than promoted to proof.
Source-spec hashes are checked for format but are not remotely authenticated by
the package checker; governance/source verification is a separate receipt.

The reference is the official [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html),
including component/vertex alignment, accessor bounds, GLB padding, material
references, scene hierarchy, and coordinate conventions. glTF uses meters,
right-handed coordinates, +Y up, and +Z asset front; cameras look along -Z.
The checker measures a design's exported coordinates. It cannot establish an
object's actual historical size, an era's authenticity, photorealism, licensing,
frame rate, GPU allocation, runtime integration, AAA visual acceptance, physical
XR certification, or independent approval.

Every pass is **machine validation within the explicit structural/static scope**.
Visual judgment, runtime behavior, and release acceptance remain separate.
