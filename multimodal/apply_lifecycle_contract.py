from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "full-multimodal-asset-manifest.json"
VERSION = "1.2.0"

DEFAULTS = {
    "attributionRequirements": [],
    "sensitiveDataClassification": "none",
    "ownershipStatus": "pending",
    "licenseExpiration": None,
    "retentionPolicy": "pending",
    "deletionPolicy": "pending",
    "exportabilityStatus": "pending",
    "revocationStatus": "pending",
    "replacementStatus": "not-started",
    "rollbackSha": None,
}


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    data["schemaVersion"] = VERSION
    normalized_missing = 0
    for asset in data["assets"]:
        asset["specificationVersion"] = VERSION
        asset["manifestVersion"] = VERSION
        if asset.get("currentStatus") == "missing":
            asset["currentStatus"] = "required"
            normalized_missing += 1
        for key, value in DEFAULTS.items():
            asset.setdefault(key, value)
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"assets": len(data["assets"]), "schemaVersion": VERSION, "normalizedMissing": normalized_missing}, indent=2))


if __name__ == "__main__":
    main()
