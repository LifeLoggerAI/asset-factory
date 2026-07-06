import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
gen = root / "image_asset_generator"
sys.path.insert(0, str(gen))

import canonical_release_manifests
import forge_versioned
import forge_versioned_legacy

expected = {
    "v1": (53, "assets/urai/"),
    "v2": (80, "assets/urai/v2/"),
    "v3": (14, "assets/urai/v3/"),
    "v4": (39, "assets/urai/xr/"),
    "v5": (27, "assets/urai/v5/"),
}

canonical_catalog_path = gen / "canonical_version_catalog.json"
compatibility_catalog_path = gen / "version_catalog.json"
canonical_catalog = json.loads(canonical_catalog_path.read_text(encoding="utf-8"))
compatibility_catalog = json.loads(compatibility_catalog_path.read_text(encoding="utf-8"))
assert compatibility_catalog == canonical_catalog, "compatibility catalog drifted from canonical catalog"
assert forge_versioned_legacy.CATALOG_PATH == canonical_catalog_path

for version, (count, prefix) in expected.items():
    config = canonical_catalog["versions"][version]
    assert config["expectedOutputs"] == count
    manifest = canonical_release_manifests.build(version)
    wrapper_manifest = forge_versioned.build_manifest(version)
    legacy_manifest = forge_versioned_legacy.build_selected_manifest(version)
    assert manifest == wrapper_manifest == legacy_manifest

    payload = manifest.read_bytes()
    entries = json.loads(payload)
    assert len(entries) == count
    names = [entry["name"] for entry in entries]
    paths = [entry["canonical_path"] for entry in entries]
    assert len(names) == len(set(names))
    assert len(paths) == len(set(paths))
    assert all(path.startswith(prefix) for path in paths)

    expected_manifest = (gen / config["manifest"]).resolve()
    assert manifest.resolve() == expected_manifest
    print(
        json.dumps(
            {
                "version": version,
                "label": config["label"],
                "count": count,
                "prefix": prefix,
                "manifest": str(manifest.relative_to(gen)),
                "sha256": hashlib.sha256(payload).hexdigest(),
            },
            sort_keys=True,
        )
    )

print("canonical version contract passed")
