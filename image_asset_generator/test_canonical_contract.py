from pathlib import Path
from tempfile import TemporaryDirectory

from canonical_contract import snapshot
import versioned_forge_driver

EXPECTED = {
    "v1": (53, "assets/urai/"),
    "v2": (80, "assets/urai/v2/"),
    "v3": (14, "assets/urai/v3/"),
    "v4": (39, "assets/urai/xr/"),
    "v5": (27, "assets/urai/v5/"),
}

for version, (count, prefix) in EXPECTED.items():
    receipt = snapshot(version)
    assert receipt["expectedOutputs"] == count, receipt
    assert receipt["actualOutputs"] == count, receipt
    assert receipt["assetPrefix"].rstrip("/") + "/" == prefix, receipt
    assert receipt["targetRepo"] == "LifeLoggerAI/urai-spatial", receipt

with TemporaryDirectory() as temporary_directory:
    temporary_root = Path(temporary_directory)
    active_manifest = temporary_root / "manifest.json"
    version_manifest = temporary_root / "v2.manifest.json"
    active_manifest.write_text('[{"name":"v2_saved","status":"ready"}]\n', encoding="utf-8")
    version_manifest.write_text('[{"name":"v2_saved","status":"pending"}]\n', encoding="utf-8")

    original_active_manifest = versioned_forge_driver.ACTIVE_MANIFEST_PATH
    try:
        versioned_forge_driver.ACTIVE_MANIFEST_PATH = active_manifest
        versioned_forge_driver.persist_active_manifest(version_manifest)
    finally:
        versioned_forge_driver.ACTIVE_MANIFEST_PATH = original_active_manifest

    assert version_manifest.read_bytes() == active_manifest.read_bytes()

print("PASS canonical V1-V5 asset contract and versioned manifest persistence")
