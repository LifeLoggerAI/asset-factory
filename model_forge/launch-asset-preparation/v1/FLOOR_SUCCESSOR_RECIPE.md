# Floor-only candidate correction

prepareFloorFootprint accepts hash-bound source bytes, one exact floor node
name and declared target width/depth. It changes only that floor's X/Z
positions and recomputes smooth area-weighted normals. It does not enlarge
footprints, move nodes, scale people or portals, change other geometry or
modify materials, UV/index data, animations or skeletons.

The recipe rejects a hash mismatch, animated/shared/skinned/morph floor,
unsupported floor transform, nontriangle or degenerate geometry, invalid
dimensions and static authored content that would fall outside the new
floor. Protected graph and animation-channel bindings are independently
decoded and compared, and writing twice must produce identical hashes.

A successful candidate is unadmitted. Its static geometry does not establish
the animated envelope, collision/navigation correspondence, physical
clearance, visual approval or runtime placement. Use deliberate linked
successor manifests and those checks before replacing any runtime source.
