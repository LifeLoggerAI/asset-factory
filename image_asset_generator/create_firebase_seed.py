"""
Create Firebase-ready metadata seed records from generated image assets.

The output is a no-network metadata export. Provider labels, manifest statuses
and an in-process dictionary can describe mechanical candidates, but cannot
grant production import or promotion. The current pipeline has no authenticated
independent exact-asset acceptance/final-charge/release admission input.
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


def read_render_metadata(local_path: Path) -> Dict[str, Any]:
    metadata_path = local_path.with_suffix(local_path.suffix + ".render.json")
    if not metadata_path.exists():
        return {}
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def gate_describes_candidate(production_visual_gate: Dict[str, Any] | None) -> bool:
    if not isinstance(production_visual_gate, dict):
        return False
    return (
        production_visual_gate.get("authority_scope") == "mechanical-candidate-only"
        and production_visual_gate.get("candidate_status") == "eligible"
        and production_visual_gate.get("candidate_eligible") is True
    )


def make_seed(
    production_visual_gate: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    records: List[Dict[str, Any]] = []
    candidate_gate_eligible = gate_describes_candidate(production_visual_gate)

    for entry in load_manifest():
        storage_prefix = str(entry.get("firebase_storage_prefix") or DEFAULT_STORAGE_PREFIX).strip("/")
        template = str(entry.get("path_template"))
        status = str(entry.get("status", "unknown"))
        approved = status in APPROVED_STATUSES

        for size in entry.get("sizes", []):
            output_path = template.format(size=int(size))
            local_path = BASE_DIR / output_path
            storage_path = f"{storage_prefix}/{output_path}"
            render_metadata = read_render_metadata(local_path)
            renderer = str(render_metadata.get("renderer") or entry.get("renderer") or "unknown")
            provenance_known = bool(render_metadata)
            candidate_eligible = (
                candidate_gate_eligible
                and local_path.is_file()
                and renderer == "provider"
                and provenance_known
                and approved
            )

            record: Dict[str, Any] = {
                "id": f"{entry.get('name')}_{int(size)}",
                "assetName": entry.get("name"),
                "category": entry.get("category"),
                "prompt": entry.get("prompt"),
                "size": int(size),
                "alpha": bool(entry.get("alpha")),
                "status": status,
                "localPath": output_path,
                "storagePath": storage_path,
                "contentType": "image/png",
                "generatedAt": generated_at,
                "tags": entry.get("tags", []),
                "renderer": renderer,
                "renderProvenanceKnown": provenance_known,
                "promptVersion": entry.get("prompt_version", "v1"),
                "productionCandidateEligible": candidate_eligible,
                "productionEligible": False,
                "visualAuthority": "mechanical-candidate" if candidate_eligible else "diagnostic-only",
            }
            if local_path.exists():
                record["bytes"] = local_path.stat().st_size
                record["sha256"] = sha256_file(local_path)
            records.append(record)

    all_candidates_eligible = bool(records) and all(
        bool(record.get("productionCandidateEligible")) for record in records
    )
    return {
        "generatedAt": generated_at,
        "collection": "imageAssets",
        "storagePrefix": DEFAULT_STORAGE_PREFIX,
        "recordCount": len(records),
        "productionGateStatus": (
            production_visual_gate.get("status")
            if isinstance(production_visual_gate, dict)
            else "not-evaluated"
        ),
        "authorityScope": "mechanical-candidate-only",
        "productionAdmissionStatus": "not-verified",
        "productionGateEligible": False,
        "productionCandidateEligible": all_candidates_eligible,
        "productionEligible": False,
        "usagePolicy": "diagnostic-only-do-not-promote",
        "records": records,
    }


def main(
    production_visual_gate: Dict[str, Any] | None = None,
) -> None:
    seed = make_seed(production_visual_gate)
    SEED_PATH.write_text(json.dumps(seed, indent=2) + "\n", encoding="utf-8")
    print(f"Firebase seed written to {SEED_PATH}")


if __name__ == "__main__":
    main()
