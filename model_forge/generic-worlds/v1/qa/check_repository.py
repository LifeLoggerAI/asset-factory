"""Check preserved receipt consistency without pretending archived bytes are in Git."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    staging = json.loads((ROOT / "evidence/staging-summary.json").read_text())
    assert staging["runtimeIntegrated"] is False and staging["assetComplete"] is False
    assert staging["truthClassification"] == "GENERIC" and staging["status"] == "NEEDS_REWORK"
    assert staging["archive"]["sha256"] == "468bd4fe6c59b9cdae6cb02cdb8d8237d4ce8110324061954297572880f1a8f8"
    for path, expected in staging["sourceSha256"].items():
        assert sha(ROOT / path) == expected, f"Receipt drift: {path}"
    print(json.dumps({"passed": True, "scope": "repository source hash consistency only",
                      "worlds": 15, "kits": 12, "referencedGlbs": 96,
                      "binaryBytesVerifiedByThisRun": False, "runtimeIntegrated": False}))


if __name__ == "__main__":
    main()
