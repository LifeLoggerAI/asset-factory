"""Compatibility entry point for the canonical URAI V1-V5 production wheel.

Despite the historical filename, this module no longer owns release meaning. Every
supported invocation resolves versions, manifests, paths, hashes, and provider-cost
limits through ``canonical_version_contract``. No conflicting legacy catalog or
builder can be selected by calling this file directly.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict

import canonical_version_contract

BASE_DIR = Path(__file__).resolve().parent
CATALOG_PATH = canonical_version_contract.CATALOG_PATH
ACTIVE_MANIFEST_PATH = BASE_DIR / "manifest.json"


def load_catalog() -> Dict[str, Any]:
    return canonical_version_contract.load_catalog()


def resolve_version(name: str) -> tuple[Dict[str, Any], Path]:
    config = canonical_version_contract.resolve_version(name)
    manifest_path = canonical_version_contract.build_and_validate(name)["manifestPath"]
    return config, manifest_path


def load_entries(path: Path) -> list[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise ValueError(f"{path.name} must be a non-empty asset list")
    return payload


def canonical_paths(version: str, entries: list[Dict[str, Any]]) -> Dict[str, str] | None:
    config = canonical_version_contract.resolve_version(version)
    prefix = str(config["assetPrefix"]).rstrip("/") + "/"
    if prefix == "assets/urai/":
        return None

    result: Dict[str, str] = {}
    for entry in entries:
        name = entry.get("name")
        canonical = entry.get("canonical_path")
        if not isinstance(name, str) or not name:
            raise ValueError("Every versioned asset requires a non-empty name")
        if not isinstance(canonical, str) or not canonical.startswith(prefix):
            raise ValueError(f"{name} requires canonical_path under {prefix}")
        result[name] = canonical
    return result


def sha256(path: Path) -> str:
    import hashlib

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


def write_version_receipt(
    version: str,
    config: Dict[str, Any],
    manifest_path: Path,
    exit_code: int,
    cost_plan: Dict[str, Any],
) -> None:
    receipt_path = BASE_DIR / "forge_receipt.json"
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    else:
        receipt = {}
    receipt.update(
        {
            "version": version,
            "versionLabel": config["label"],
            "proofProfile": config["proofProfile"],
            "targetRepo": config["targetRepo"],
            "requiresSpatialWiring": bool(config.get("requiresSpatialWiring")),
            "forgeExitCode": exit_code,
            "manifest": str(manifest_path.relative_to(BASE_DIR)),
            "manifestSha256": sha256(manifest_path),
            "expectedOutputs": int(config.get("expectedOutputs", 0)),
            "providerCostExposure": cost_plan,
        }
    )
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    (BASE_DIR / f"forge_receipt_{version}.json").write_text(
        json.dumps(receipt, indent=2) + "\n",
        encoding="utf-8",
    )


def print_catalog() -> None:
    catalog = load_catalog()
    for name, config in catalog["versions"].items():
        label = config.get("label", "Unknown")
        count = config.get("expectedOutputs", "?")
        print(f"{name}: {label} assets={count}")


def build_selected_manifest(version: str) -> Path:
    return canonical_version_contract.build_and_validate(version)["manifestPath"]


def _provider_requested() -> bool:
    mode = os.environ.get("ASSET_RENDERER_MODE", "").strip().lower()
    required = os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER", "1") == "1"
    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").lower()
    return required or mode == "provider" or "api.openai.com" in endpoint


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the canonical URAI versioned asset forge")
    parser.add_argument(
        "--version",
        default=os.environ.get("URAI_VERSION", "v1"),
        choices=tuple(canonical_version_contract.EXPECTED_MATRIX),
    )
    parser.add_argument("--list", action="store_true", help="Print the canonical version catalog and exit")
    parser.add_argument(
        "--dry-run-contract",
        action="store_true",
        help="Build/validate the manifest and print zero-call cost exposure without invoking a provider",
    )
    args = parser.parse_args()

    if args.list:
        print_catalog()
        return 0

    version = args.version
    contract = canonical_version_contract.build_and_validate(version)
    cost_plan = canonical_version_contract.cost_exposure(version)

    if args.dry_run_contract:
        output = {
            key: value
            for key, value in contract.items()
            if key not in {"entries", "manifestPath"}
        }
        output["costExposure"] = cost_plan
        print(json.dumps(output, indent=2))
        return 0

    if _provider_requested():
        cost_plan = canonical_version_contract.assert_provider_budget(version)

    config = canonical_version_contract.resolve_version(version)
    selected_manifest = contract["manifestPath"]
    entries = contract["entries"]
    active_before = ACTIVE_MANIFEST_PATH.read_bytes()
    selected_bytes = selected_manifest.read_bytes()
    os.environ["URAI_VERSION"] = version

    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").lower()
    if "api.openai.com" in endpoint:
        os.environ.setdefault("ASSET_RENDERER_PROVIDER", "openai")

    print(f"URAI_VERSION={version}")
    print(f"VERSION_LABEL={config['label']}")
    print(f"VERSION_MANIFEST={selected_manifest}")
    print(f"VERSION_MANIFEST_SHA256={contract['manifestSha256']}")
    print(f"VERSION_ASSET_COUNT={len(entries)}")
    print(f"MAXIMUM_PROVIDER_CALLS={cost_plan['maximumProviderCalls']}")
    print(f"MAXIMUM_EXPOSURE_USD={cost_plan['maximumExposureUsd']}")
    print(f"BATCH_CEILING_USD={cost_plan['configuredBatchCeilingUsd']}")

    try:
        ACTIVE_MANIFEST_PATH.write_bytes(selected_bytes)

        import export_spatial_handoff

        paths = canonical_paths(version, entries)
        if paths is not None:
            export_spatial_handoff.CANONICAL_PATHS = paths

        from forge_v1_cost_aware import main as run_core_forge

        exit_code = int(run_core_forge())
        write_version_receipt(version, config, selected_manifest, exit_code, cost_plan)
        preserve_version_outputs(version)
        print(f"VERSION_FORGE_EXIT={exit_code}")
        return exit_code
    finally:
        ACTIVE_MANIFEST_PATH.write_bytes(active_before)


if __name__ == "__main__":
    raise SystemExit(main())
