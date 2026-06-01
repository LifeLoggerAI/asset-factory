"""
Create Firebase-ready metadata seed records from generated image assets.

The output is a JSON file that can be uploaded/imported by deployment tooling.
It does not perform any network writes. Each generated image variant becomes one
seed record with stable identifiers, local path, proposed Firebase Storage path,
asset metadata, and SHA-256 hash.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
SEED_PATH = BASE_DIR / "firebase_seed.json"
DEFAULT_STORAGE_PREFIX = "urai/image-assets"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest() -> List[Dict[str, Any]]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def make_seed() -> Dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    records: List[Dict[str, Any]] = []

    for entry in load_manifest():
        storage_prefix = str(entry.get("firebase_storage_prefix") or DEFAULT_STORAGE_PREFIX).strip("/")
        template = str(entry.get("path_template"))
        for size in entry.get("sizes", []):
            output_path = template.format(size=int(size))
            local_path = BASE_DIR / output_path
            storage_path = f"{storage_prefix}/{output_path}"
            record: Dict[str, Any] = {
                "id": f"{entry.get('name')}_{int(size)}",
                "assetName": entry.get("name"),
                "category": entry.get("category"),
                "prompt": entry.get("prompt"),
                "size": int(size),
                "alpha": bool(entry.get("alpha")),
                "status": entry.get("status"),
                "localPath": output_path,
                "storagePath": storage_path,
                "contentType": "image/png",
                "generatedAt": generated_at,
                "tags": entry.get("tags", []),
                "renderer": entry.get("renderer", "local-proof"),
                "promptVersion": entry.get("prompt_version", "v1"),
            }
            if local_path.exists():
                record["bytes"] = local_path.stat().st_size
                record["sha256"] = sha256_file(local_path)
            records.append(record)

    return {
        "generatedAt": generated_at,
        "collection": "imageAssets",
        "storagePrefix": DEFAULT_STORAGE_PREFIX,
        "recordCount": len(records),
        "records": records,
    }


def main() -> None:
    seed = make_seed()
    SEED_PATH.write_text(json.dumps(seed, indent=2) + "\n", encoding="utf-8")
    print(f"Firebase seed written to {SEED_PATH}")


if __name__ == "__main__":
    main()
