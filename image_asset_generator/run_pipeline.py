"""
Run the full URAI image asset generator loop in one command.

Pipeline:
1. Validate manifest registry contract.
2. Generate missing local proof assets.
3. Validate declared outputs.
4. Build preview HTML.
5. Create Firebase metadata seed.
6. Classify production-visual eligibility.
7. Write validation_report.json and production_visual_gate.json.
8. Export a self-describing asset pack ZIP containing the fresh proof metadata.

A successful default run proves mechanical packaging/integrity only. Set
ASSET_PIPELINE_REQUIRE_PRODUCTION_VISUALS=1 in a production/promotion lane to
fail closed unless every retained visual is provider-backed, semantically
distinct, and explicitly approved/committed/shipped.
"""

from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
import os
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
GATE_PATH = BASE_DIR / "production_visual_gate.json"
FIREBASE_SEED_PATH = BASE_DIR / "firebase_seed.json"
APPROVED_STATUSES = {"approved", "committed", "shipped"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest() -> List[Dict[str, Any]]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def read_render_metadata(file_path: Path) -> Dict[str, Any]:
    metadata_path = file_path.with_suffix(file_path.suffix + ".render.json")
    if not metadata_path.exists():
        return {}
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def collect_asset_records(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for entry in entries:
        template = entry.get("path_template", "")
        for size in entry.get("sizes", []):
            relative_path = template.format(size=int(size))
            file_path = BASE_DIR / relative_path
            render_metadata = read_render_metadata(file_path)
            record: Dict[str, Any] = {
                "name": entry.get("name"),
                "category": entry.get("category"),
                "size": int(size),
                "path": relative_path,
                "exists": file_path.exists(),
                "renderer": render_metadata.get("renderer") or entry.get("renderer") or "unknown",
                "render_attempt": render_metadata.get("attempt"),
                "render_metadata_path": (
                    str(file_path.with_suffix(file_path.suffix + ".render.json").relative_to(BASE_DIR))
                    if render_metadata
                    else None
                ),
            }
            if file_path.exists():
                record["bytes"] = file_path.stat().st_size
                record["sha256"] = sha256_file(file_path)
            records.append(record)
    return records


def semantic_duplicate_hash_groups(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for asset in assets:
        sha256 = asset.get("sha256")
        if sha256:
            groups[str(sha256)].append(asset)

    duplicates: List[Dict[str, Any]] = []
    for sha256, members in sorted(groups.items()):
        semantic_names = {str(member.get("name")) for member in members}
        if len(semantic_names) <= 1:
            continue
        duplicates.append(
            {
                "sha256": sha256,
                "assets": [
                    {
                        "name": member.get("name"),
                        "category": member.get("category"),
                        "size": member.get("size"),
                        "path": member.get("path"),
                    }
                    for member in members
                ],
            }
        )
    return duplicates


def build_production_visual_gate(
    entries: List[Dict[str, Any]],
    assets: List[Dict[str, Any]],
    mechanical_errors: List[str],
) -> Dict[str, Any]:
    renderer_counts = Counter(
        str(asset.get("renderer") or "unknown")
        for asset in assets
        if asset.get("exists")
    )
    non_provider_assets = [
        {
            "name": asset.get("name"),
            "path": asset.get("path"),
            "renderer": asset.get("renderer") or "unknown",
        }
        for asset in assets
        if asset.get("exists") and asset.get("renderer") != "provider"
    ]
    missing_render_metadata = [
        str(asset.get("path"))
        for asset in assets
        if asset.get("exists") and not asset.get("render_metadata_path")
    ]
    duplicate_groups = semantic_duplicate_hash_groups(assets)
    unapproved_assets = [
        {
            "name": entry.get("name"),
            "status": entry.get("status"),
        }
        for entry in entries
        if entry.get("status") not in APPROVED_STATUSES
    ]

    reasons: List[str] = []
    if mechanical_errors:
        reasons.append(f"{len(mechanical_errors)} mechanical validation error(s)")
    if non_provider_assets:
        reasons.append(f"{len(non_provider_assets)} retained visual(s) are not provider-backed")
    if missing_render_metadata:
        reasons.append(f"{len(missing_render_metadata)} retained visual(s) lack render provenance metadata")
    if duplicate_groups:
        reasons.append(f"{len(duplicate_groups)} semantic duplicate-hash group(s) detected")
    if unapproved_assets:
        reasons.append(f"{len(unapproved_assets)} manifest asset(s) lack explicit visual approval")

    status = "eligible" if not reasons else "blocked"
    return {
        "status": status,
        "production_visual_authority": status == "eligible",
        "promotion_allowed": status == "eligible",
        "reasons": reasons,
        "renderer_counts": dict(sorted(renderer_counts.items())),
        "non_provider_assets": non_provider_assets,
        "missing_render_metadata": missing_render_metadata,
        "semantic_duplicate_hash_groups": duplicate_groups,
        "unapproved_assets": unapproved_assets,
    }


def write_report(errors: List[str], zip_path: Path) -> Dict[str, Any]:
    entries = load_manifest()
    assets = collect_asset_records(entries)
    gate = build_production_visual_gate(entries, assets, errors)
    generated_at = datetime.now(timezone.utc).isoformat()
    exact_head = os.environ.get("ASSET_FACTORY_EXACT_HEAD") or None
    report: Dict[str, Any] = {
        "generated_at": generated_at,
        "exact_head": exact_head,
        "pipeline": "urai-image-asset-generator",
        "status": "passed" if not errors else "failed",
        "status_scope": "mechanical_integrity_only",
        "proof_classification": {
            "scope": "mechanical-diagnostic",
            "production_visual_authority": gate["production_visual_authority"],
            "meaning": (
                "A passed pipeline status proves manifest/output/package integrity only. "
                "Production visual authority is controlled separately by production_visual_gate."
            ),
        },
        "manifest": str(MANIFEST_PATH.relative_to(BASE_DIR)),
        "preview": "preview.html",
        "firebase_seed": "firebase_seed.json" if FIREBASE_SEED_PATH.exists() else None,
        "production_visual_gate_file": GATE_PATH.name,
        "export": str(zip_path.relative_to(BASE_DIR)),
        "asset_count": len(assets),
        "errors": errors,
        "assets": assets,
        "production_visual_gate": gate,
    }
    if FIREBASE_SEED_PATH.exists():
        report["firebase_seed_sha256"] = sha256_file(FIREBASE_SEED_PATH)

    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    gate_payload = {
        "evaluated_at": generated_at,
        "exact_head": exact_head,
        "gate": "production-visual",
        **gate,
    }
    GATE_PATH.write_text(json.dumps(gate_payload, indent=2) + "\n", encoding="utf-8")
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

    zip_path = BASE_DIR / "asset_pack.zip"
    report = write_report(asset_errors, zip_path)
    export_assets.export(zip_path)

    if asset_errors:
        print(f"Image asset pipeline failed with {len(asset_errors)} validation error(s).")
        for error in asset_errors:
            print(f"- {error}")
        raise SystemExit(1)

    gate = report["production_visual_gate"]
    print(
        "Image asset mechanical proof passed: "
        f"{report['asset_count']} asset file(s), report={REPORT_PATH.name}, export={zip_path.name}"
    )
    print(
        "Production visual gate: "
        f"{str(gate['status']).upper()} "
        f"(production_visual_authority={gate['production_visual_authority']})"
    )
    for reason in gate["reasons"]:
        print(f"- {reason}")

    if os.environ.get("ASSET_PIPELINE_REQUIRE_PRODUCTION_VISUALS") == "1" and gate["status"] != "eligible":
        print("Production visual gate is required and remains blocked.")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
