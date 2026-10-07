# Decoded geometry and explicit numerical policy

Run `node model_forge/launch-asset-preparation/v1/validate-decoded-asset.mjs artifact.glb policy.json` after the existing frozen package install. The verifier never generates assets or sends provider calls.

A policy must declare `schemaVersion: urai-decoded-asset-policy-v1`, the exact `artifactSha256`, a nonempty `limitsSource`, and positive integer `maxFileBytes`, `maxDecodedAccessorBytes`, `maxTriangles`, `maxDrawCalls`, and `maxTexturePixels`. It also requires `bounds: {scope: default-scene-world-space, min: [x,y,z], max: [x,y,z]}` with finite ordered values. There are no default production limits. Obtain caps and scene bounds from current measured consumer/device policy; synthetic fixture caps are not production authority.

The verifier validates the GLB container and Khronos schema, bounds declared accessor/Meshopt allocations before decoding, then uses pinned glTF-Transform and Meshopt to read actual data. It checks finite values, index ranges and vertex counts, default-scene world transforms, actual geometric bounds, triangles and primitive draws per mesh instance. Texture metadata and actual pixels are decoded with Sharp under the declared aggregate pixel cap. File and decoded-accessor byte caps must pass. The original artifact is never changed.

Animated, skinned, morph-target and GPU-instanced geometry is blocked: static positions cannot establish pose-aware bounds or controller/device acceptance. External/data URI resources, unsupported codecs/decoders, missing numerical policy and wrong hashes are blocked explicitly. Numerical limits remain declared inputs whose authority needs independent verification. A passing report does not accept art, physical performance, production, navigation or promotion.

Deliberate owner admission is required. This isolated successor contains #431's existing container guard and adds this verifier without mutating #421, generic-world owner branches, primary Spatial, Studio or Jobs. To combine with a parallel spend-boundary donor, admit the #431 container changes once, then add these new files/workflow; this successor does not modify forge.mjs beyond its inherited #431 version. Preserve predecessor receipts and rerun exact combined-head checks.

Primary standards: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html and https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md . Full-scene controller/headroom, final animated character bounds and physical timing/memory metrics remain separate evidence.
