# Launch asset preparation source

This isolated recipe prepares unadmitted candidates from hash-verified GLB, SVG,
WAV and JSON source. It writes outside the source tree and does not alter runtime
bindings, authority manifests, art admission, providers or deployment.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
node prepare-launch-assets.mjs SOURCE_CHECKOUT MATRIX_JSON CANDIDATE_DIRECTORY
node convert-launch-media.mjs SOURCE_CHECKOUT MATRIX_JSON CANDIDATE_DIRECTORY
```

The matrix contains `assetMatrix` records with source path, source SHA-256,
source commit, measured format and declared budgets. Media conversion requires
FFmpeg/ffprobe with libvorbis. Sharp is pinned to 0.35.5 and verifies librsvg
2.63.2 before processing a trusted SVG.

GLB preparation uses raw unfiltered Meshopt streams without quantization,
reordering, simplification or image recompression. It clears joint indices only
where their weight is exactly zero. Unsupported alpha cutoffs on non-MASK
materials are omitted by the glTF writer. Full decoded Khronos validation,
exact geometry/animation/transform/texture readback, triangle face order/winding
and repeated output hashes are checked. The IEEE-754 sign of zero may normalize
when JSON node transforms are serialized. Original files and review copies must
remain retained.

`prepareModel(bytes, {prepareTangents: true})` is a separate proposal. It adds
MikkTSpace-compatible per-corner tangents and deindexes previous attributes.
Triangle geometry stays the same, but vertex buffers and normal-map shading
need visual and memory review. The default recipe does not make this change.

Meshopt reduces transfer size and needs decoder support; it does not establish
GPU memory, draw calls, frame time or device acceptance. Decoded Khronos results
do not substitute for testing the compressed stream with the actual runtime
decoder. The hash-bound Spatial policy supplies the 3,145,728-byte maximum for
each model when the matrix has no declaration. A stricter positive integer
declaration remains binding; malformed declarations fail. The separate
2,500,000-byte initial-scene ceiling needs the complete first-visible asset set
and does not pass from one model's result. Bounds use decoded logical accessor
values, including normalized quantized positions, without resizing rooms,
bodies, portals or navigation. Static bounds do not establish animation, skin
or morph envelopes.

The declared test inputs must all exist before the preparation suite can run.
The source workflow checks out the exact PR head, installs the frozen lock and
requires a clean tree after the tests.

WebP conversion verifies exact decoded RGBA pixels and repeat-identical bytes.
Vorbis conversion is lossy; it preserves duration, rate and channels, fixes only
the Ogg container serial and standard page CRC for reproducibility, and needs
listening/loop review. Neither format conversion admits the content.

These recipes do not claim zero warnings, zero vulnerabilities, art approval,
runtime admission or production readiness.
