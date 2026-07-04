import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
gen = root / "image_asset_generator"
sys.path.insert(0, str(gen))

import canonical_release_manifests

expected = {
    "v1": (53, "assets/urai/"),
    "v2": (80, "assets/urai/v2/"),
    "v3": (14, "assets/urai/v3/"),
    "v4": (39, "assets/urai/xr/"),
    "v5": (27, "assets/urai/v5/"),
}

catalog = json.loads((gen / "canonical_version_catalog.json").read_text())
for version, (count, prefix) in expected.items():
    assert catalog["versions"][version]["expectedOutputs"] == count
    manifest = canonical_release_manifests.build(version)
    entries = json.loads(manifest.read_text())
    assert len(entries) == count
    paths = [entry["canonical_path"] for entry in entries]
    assert len(paths) == len(set(paths))
    if version != "v1":
        assert all(path.startswith(prefix) for path in paths)

print("canonical version contract passed")
