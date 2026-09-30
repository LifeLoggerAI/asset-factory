# URAI Blender Finishing Lane

Run the deterministic finishing pass with a compatible Blender installation:

```bash
blender --background --python tools/blender/urai_glb_finish.py -- input.glb output.glb
```

The pass:

- uses metric scene units;
- applies mesh rotation/scale transforms;
- recalculates face normals;
- removes empty material slots;
- exports GLB;
- emits `output.glb.finish-receipt.json` with mesh/vertex/triangle/material counts.

It intentionally does **not**:

- decimate or remodel identity-sensitive scans;
- fabricate missing textures or geometry;
- decide LOD policy;
- overwrite source identity/provenance;
- approve or promote an asset to canonical/Gold Master.

Substance/artist material finishing remains a controlled human step when needed. The output of this script is still a candidate until UrAi QA and promotion gates pass.
