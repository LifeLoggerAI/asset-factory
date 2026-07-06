from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any

import canonical_release_manifests

BASE_DIR = Path(__file__).resolve().parent
CATALOG_PATH = BASE_DIR / "canonical_version_catalog.json"
ACTIVE_MANIFEST_PATH = BASE_DIR / "manifest.json"


def load_catalog() -> dict[str, Any]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if payload.get("schemaVersion") != "1.0.0" or not isinstance(payload.get("versions"), dict):
        raise ValueError("Invalid canonical version catalog")
    return payload


def resolve_version(name: str) -> tuple[dict[str, Any], Path]:
    versions = load_catalog()["versions"]
    if name not in versions:
        raise ValueError(f"Unknown URAI version {name!r}")
    config = versions[name]
    manifest = canonical_release_manifests.build(name).resolve()
    if BASE_DIR not in manifest.parents:
        raise ValueError("Version manifest must stay inside image_asset_generator")
    return config, manifest


def load_entries(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise ValueError(f"{path.name} must be a non-empty asset list")
    return payload


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_paths(version: str, config: dict[str, Any], entries: list[dict[str, Any]]) -> dict[str, str] | None:
    if version == "v1":
        return None
    prefix = str(config["assetPrefix"]).rstrip("/") + "/"
    paths: dict[str, str] = {}
    for entry in entries:
        name = entry.get("name")
        path = entry.get("canonical_path")
        if not isinstance(name, str) or not name:
            raise ValueError("Every versioned asset requires a non-empty name")
        if not isinstance(path, str) or not path.startswith(prefix):
            raise ValueError(f"{name} must stay under {prefix}")
        paths[name] = path
    return paths


def preserve_outputs(version: str) -> None:
    for source_name, target_name in (
        ("quality_report.json", f"quality_report_{version}.json"),
        ("upgrade_feedback.json", f"upgrade_feedback_{version}.json"),
        ("forge_receipt.json", f"forge_receipt_{version}.json"),
    ):
        source = BASE_DIR / source_name
        if source.exists():
            shutil.copy2(source, BASE_DIR / target_name)


def write_version_receipt(version: str, config: dict[str, Any], manifest: Path, exit_code: int) -> None:
    receipt_path = BASE_DIR / "forge_receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.exists() else {}
    receipt.update({
        "version": version,
        "versionLabel": config["label"],
        "proofProfile": config["proofProfile"],
        "targetRepo": config["targetRepo"],
        "requiresSpatialWiring": bool(config.get("requiresSpatialWiring")),
        "forgeExitCode": exit_code,
        "manifest": str(manifest.relative_to(BASE_DIR)),
        "manifestSha256": sha256(manifest),
        "expectedOutputs": int(config["expectedOutputs"]),
    })
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    (BASE_DIR / f"forge_receipt_{version}.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


def print_catalog() -> None:
    for name, config in load_catalog()["versions"].items():
        print(f"{name}: {config['label']} assets={config['expectedOutputs']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the canonical URAI versioned asset forge")
    parser.add_argument("--version", default=os.environ.get("URAI_VERSION", "v1"), choices=("v1", "v2", "v3", "v4", "v5"))
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()
    if args.list:
        print_catalog()
        return 0

    version = args.version
    config, manifest = resolve_version(version)
    entries = load_entries(manifest)
    if len(entries) != int(config["expectedOutputs"]):
        raise ValueError(f"{version} canonical count mismatch")

    active_before = ACTIVE_MANIFEST_PATH.read_bytes()
    os.environ["URAI_VERSION"] = version
    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").lower()
    if "api.openai.com" in endpoint:
        os.environ.setdefault("ASSET_RENDERER_PROVIDER", "openai")

    print(f"URAI_VERSION={version}")
    print(f"VERSION_LABEL={config['label']}")
    print(f"VERSION_MANIFEST={manifest}")
    print(f"VERSION_MANIFEST_SHA256={sha256(manifest)}")
    print(f"VERSION_ASSET_COUNT={len(entries)}")

    try:
        ACTIVE_MANIFEST_PATH.write_bytes(manifest.read_bytes())
        import export_spatial_handoff
        paths = canonical_paths(version, config, entries)
        if paths is not None:
            export_spatial_handoff.CANONICAL_PATHS = paths
        from forge_v1_cost_aware import main as run_core_forge
        exit_code = int(run_core_forge())
        write_version_receipt(version, config, manifest, exit_code)
        preserve_outputs(version)
        print(f"VERSION_FORGE_EXIT={exit_code}")
        return exit_code
    finally:
        ACTIVE_MANIFEST_PATH.write_bytes(active_before)


if __name__ == "__main__":
    raise SystemExit(main())
