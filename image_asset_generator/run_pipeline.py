"""
Run the full URAI image asset generator loop in one command.

Pipeline:
1. Validate manifest registry contract.
2. Generate missing local proof assets.
3. Validate declared outputs.
4. Build preview HTML.
5. Create Firebase metadata seed.
6. Export asset pack ZIP.
7. Write validation_report.json with asset hashes and status.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import create_firebase_seed
import create_preview
import export_assets
import generate_assets
import validate_assets
import validate_manifest

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
REPORT_PATH = BASE_DIR / "validation_report.json"
FIREBASE_SEED_PATH = BASE_DIR / "firebase_seed.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest() -> List[Dict[str, Any]]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def collect_asset_records(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for entry in entries:
        template = entry.get("path_template", "")
        for size in entry.get("sizes", []):
            relative_path = template.format(size=int(size))
            file_path = BASE_DIR / relative_path
            record: Dict[str, Any] = {
                "name": entry.get("name"),
                "category": entry.get("category"),
                "size": int(size),
                "path": relative_path,
                "exists": file_path.exists(),
            }
            if file_path.exists():
                record["bytes"] = file_path.stat().st_size
                record["sha256"] = sha256_file(file_path)
            records.append(record)
    return records


def write_report(errors: List[str], zip_path: Path) -> Dict[str, Any]:
    entries = load_manifest()
    assets = collect_asset_records(entries)
    report: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pipeline": "urai-image-asset-generator",
        "status": "passed" if not errors else "failed",
        "manifest": str(MANIFEST_PATH.relative_to(BASE_DIR)),
        "preview": "preview.html",
        "firebase_seed": "firebase_seed.json" if FIREBASE_SEED_PATH.exists() else None,
        "export": str(zip_path.relative_to(BASE_DIR)),
        "asset_count": len(assets),
        "errors": errors,
        "assets": assets,
    }
    if FIREBASE_SEED_PATH.exists():
        report["firebase_seed_sha256"] = sha256_file(FIREBASE_SEED_PATH)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def fail(errors: List[str], stage: str) -> None:
    zip_path = BASE_DIR / "asset_pack.zip"
    if not zip_path.exists():
        zip_path.write_bytes(b"")
    write_report(errors, zip_path)
    print(f"Image asset pipeline failed during {stage} with {len(errors)} error(s).")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)


def main() -> None:
    manifest_errors = validate_manifest.validate_manifest()
    if manifest_errors:
        fail(manifest_errors, "manifest validation")

    generate_assets.main()
    asset_errors = validate_assets.validate()
    create_preview.main()
    create_firebase_seed.main()
    zip_path = export_assets.export()
    report = write_report(asset_errors, zip_path)

    if asset_errors:
        print(f"Image asset pipeline failed with {len(asset_errors)} validation error(s).")
        for error in asset_errors:
            print(f"- {error}")
        raise SystemExit(1)

    print(
        "Image asset pipeline passed: "
        f"{report['asset_count']} asset file(s), report={REPORT_PATH.name}, export={zip_path.name}"
    )


if __name__ == "__main__":
    main()
