"""Version-selecting entry point for the URAI V1–V5 production wheel.

The selected canonical manifest is generated from the release-version contract,
staged into the proven forge core for one isolated run, and restored afterward.
Version-specific receipts, quality reports, feedback, and handoff manifests are
preserved so V1/V2/V3 cannot overwrite or masquerade as one another.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict

import build_v2_manifest
import build_version_manifests

BASE_DIR = Path(__file__).resolve().parent
CATALOG_PATH = BASE_DIR / "version_catalog.json"
ACTIVE_MANIFEST_PATH = BASE_DIR / "manifest.json"


def load_catalog() -> Dict[str, Any]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    versions = payload.get("versions")
    if not isinstance(versions, dict) or not versions:
        raise ValueError("version_catalog.json must contain a non-empty versions object")
    return payload


def resolve_version(name: str) -> tuple[Dict[str, Any], Path]:
    catalog = load_catalog()
    versions = catalog["versions"]
    if name not in versions:
        raise ValueError(f"Unknown URAI version {name!r}; expected one of {', '.join(sorted(versions))}")
    config = versions[name]
    manifest_path = (BASE_DIR / config["manifest"]).resolve()
    if BASE_DIR not in manifest_path.parents and manifest_path != BASE_DIR:
        raise ValueError("Version manifest must stay inside image_asset_generator")
    if not manifest_path.exists():
        raise FileNotFoundError(f"Version manifest does not exist: {manifest_path}")
    return config, manifest_path


def load_entries(path: Path) -> list[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise ValueError(f"{path.name} must be a non-empty asset list")
    return payload


def canonical_paths(version: str, entries: list[Dict[str, Any]]) -> Dict[str, str] | None:
    if version == "v1":
        return None
    result: Dict[str, str] = {}
    expected_prefix = "assets/urai/xr/" if version == "v3" else f"assets/urai/{version}/"
    for entry in entries:
        name = entry.get("name")
        canonical = entry.get("canonical_path")
        if not isinstance(name, str) or not name:
            raise ValueError("Every versioned asset requires a non-empty name")
        if not isinstance(canonical, str) or not canonical.startswith(expected_prefix):
            raise ValueError(f"{name} requires canonical_path under {expected_prefix}")
        result[name] = canonical
    return result


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def preserve_version_outputs(version: str) -> None:
    for source_name, target_name in (
        ("quality_report.json", f"quality_report_{version}.json"),
        ("upgrade_feedback.json", f"upgrade_feedback_{version}.json"),
        ("forge_receipt.json", f"forge_receipt_{version}.json"),
    ):
        source = BASE_DIR / source_name
        if source.exists():
            shutil.copy2(source, BASE_DIR / target_name)


def write_version_receipt(version: str, config: Dict[str, Any], manifest_path: Path, exit_code: int) -> None:
    receipt_path = BASE_DIR / "forge_receipt.json"
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    else:
        receipt = {}
    receipt.update({
        "version": version,
        "versionLabel": config["label"],
        "proofProfile": config["proofProfile"],
        "targetRepo": config["targetRepo"],
        "requiresSpatialWiring": bool(config.get("requiresSpatialWiring")),
        "forgeExitCode": exit_code,
        "manifest": str(manifest_path.relative_to(BASE_DIR)),
        "manifestSha256": sha256(manifest_path),
        "expectedOutputs": int(config.get("expectedOutputs", 0)),
    })
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    (BASE_DIR / f"forge_receipt_{version}.json").write_text(
        json.dumps(receipt, indent=2) + "\n",
        encoding="utf-8",
    )


def print_catalog() -> None:
    """List declared versions without building unrelated manifests."""
    catalog = load_catalog()
    for name, config in catalog["versions"].items():
        label = config.get("label", "Unknown")
        status = config.get("status", "unknown")
        count = config.get("expectedOutputs", "?")
        print(f"{name}: {label} [{status}] assets={count}")


def build_selected_manifest(version: str) -> None:
    """Build V2 in isolation; preserve legacy all-version behavior elsewhere."""
    if version == "v2":
        build_v2_manifest.build()
        return
    build_version_manifests.build_all()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the URAI versioned asset forge")
    parser.add_argument(
        "--version",
        default=os.environ.get("URAI_VERSION", "v1"),
        choices=("v1", "v2", "v3", "v4", "v5"),
    )
    parser.add_argument("--list", action="store_true", help="Print the version catalog and exit")
    args = parser.parse_args()

    if args.list:
        print_catalog()
        return 0

    version = args.version
    build_selected_manifest(version)
    config, selected_manifest = resolve_version(version)
    entries = load_entries(selected_manifest)
    expected = int(config.get("expectedOutputs", 0))
    if expected and len(entries) != expected:
        raise ValueError(
            f"{version} catalog expects {expected} assets but {selected_manifest.name} has {len(entries)}"
        )

    active_before = ACTIVE_MANIFEST_PATH.read_bytes()
    selected_bytes = selected_manifest.read_bytes()
    os.environ["URAI_VERSION"] = version

    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").lower()
    if "api.openai.com" in endpoint:
        os.environ.setdefault("ASSET_RENDERER_PROVIDER", "openai")

    print(f"URAI_VERSION={version}")
    print(f"VERSION_LABEL={config['label']}")
    print(f"VERSION_MANIFEST={selected_manifest}")
    print(f"VERSION_MANIFEST_SHA256={sha256(selected_manifest)}")
    print(f"VERSION_ASSET_COUNT={len(entries)}")

    try:
        ACTIVE_MANIFEST_PATH.write_bytes(selected_bytes)

        import export_spatial_handoff

        paths = canonical_paths(version, entries)
        if paths is not None:
            export_spatial_handoff.CANONICAL_PATHS = paths

        from forge_v1_cost_aware import main as run_core_forge

        exit_code = int(run_core_forge())
        write_version_receipt(version, config, selected_manifest, exit_code)
        preserve_version_outputs(version)
        print(f"VERSION_FORGE_EXIT={exit_code}")
        return exit_code
    finally:
        ACTIVE_MANIFEST_PATH.write_bytes(active_before)


if __name__ == "__main__":
    raise SystemExit(main())
