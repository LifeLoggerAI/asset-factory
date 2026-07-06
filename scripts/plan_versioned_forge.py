#!/usr/bin/env python3
"""Print a zero-provider-call cost exposure plan for one canonical asset version."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "image_asset_generator"
sys.path.insert(0, str(GENERATOR))

import canonical_release_manifests  # noqa: E402


def positive_int(value: str, name: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if parsed < 1:
        raise ValueError(f"{name} must be greater than zero")
    return parsed


def positive_decimal(value: str, name: str) -> Decimal:
    try:
        parsed = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError(f"{name} must be a decimal number") from exc
    if parsed <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return parsed


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_catalog() -> dict[str, Any]:
    payload = json.loads(
        (GENERATOR / "canonical_version_catalog.json").read_text(encoding="utf-8")
    )
    versions = payload.get("versions")
    if not isinstance(versions, dict):
        raise ValueError("Catalog is missing a valid 'versions' object")
    return payload


def required_text(mapping: dict[str, Any], key: str, context: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{context}: missing required '{key}'")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create a no-call provider exposure plan before a paid asset forge"
    )
    parser.add_argument("--version", required=True, choices=("v1", "v2", "v3", "v4", "v5"))
    parser.add_argument("--limit-entries", type=int)
    parser.add_argument("--limit-outputs", type=int)
    parser.add_argument(
        "--max-rounds",
        default=os.environ.get("ASSET_FORGE_MAX_ROUNDS", "1"),
    )
    parser.add_argument(
        "--max-unit-cost-usd",
        default=os.environ.get("ASSET_FORGE_MAX_UNIT_COST_USD"),
    )
    parser.add_argument("--output")
    args = parser.parse_args()

    max_rounds = positive_int(str(args.max_rounds), "max rounds")
    if args.limit_entries is not None and args.limit_entries < 1:
        raise ValueError("--limit-entries must be greater than zero")
    if args.limit_outputs is not None and args.limit_outputs < 1:
        raise ValueError("--limit-outputs must be greater than zero")

    manifest_path = canonical_release_manifests.build(args.version)
    entries = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"Generated manifest is empty or invalid: {manifest_path}")

    selected_entries = entries[: args.limit_entries] if args.limit_entries else entries

    outputs: list[dict[str, Any]] = []
    for index, raw_entry in enumerate(selected_entries):
        if not isinstance(raw_entry, dict):
            raise ValueError(f"Manifest entry {index} must be an object")
        name = required_text(raw_entry, "name", f"manifest entry {index}")
        path_template = required_text(
            raw_entry, "path_template", f"manifest asset {name}"
        )
        sizes = raw_entry.get("sizes")
        if not isinstance(sizes, list) or not sizes:
            raise ValueError(f"manifest asset {name}: missing required sizes")

        for size in sizes:
            parsed_size = positive_int(str(size), f"size for {name}")
            outputs.append(
                {
                    "name": name,
                    "size": parsed_size,
                    "pathTemplate": path_template,
                    "canonicalPath": raw_entry.get("canonical_path"),
                }
            )

    if args.limit_outputs:
        outputs = outputs[: args.limit_outputs]

    max_provider_calls = len(outputs) * max_rounds
    unit_cost = (
        positive_decimal(args.max_unit_cost_usd, "max unit cost")
        if args.max_unit_cost_usd
        else None
    )
    exposure = Decimal(max_provider_calls) * unit_cost if unit_cost else None

    catalog = load_catalog()
    versions = catalog.get("versions")
    if not isinstance(versions, dict):
        raise ValueError("Catalog is missing a valid 'versions' object")
    config = versions.get(args.version)
    if not isinstance(config, dict):
        raise ValueError(
            f"Version '{args.version}' configuration not found or invalid in catalog"
        )

    plan = {
        "schemaVersion": "1.0.0",
        "mode": "dry-run-no-provider-calls",
        "providerCallsExecuted": 0,
        "version": args.version,
        "versionLabel": required_text(config, "label", f"{args.version} catalog"),
        "proofProfile": required_text(
            config, "proofProfile", f"{args.version} catalog"
        ),
        "manifest": str(manifest_path.relative_to(GENERATOR)),
        "manifestSha256": sha256(manifest_path),
        "catalogExpectedOutputs": positive_int(
            str(config.get("expectedOutputs", "")), "catalog expected outputs"
        ),
        "manifestEntries": len(entries),
        "selectedEntries": len(selected_entries),
        "selectedOutputs": len(outputs),
        "maxQualityRounds": max_rounds,
        "rendererAttemptsPerOutput": 1,
        "maxProviderCalls": max_provider_calls,
        "declaredMaxUnitCostUsd": str(unit_cost) if unit_cost else None,
        "declaredMaxCostExposureUsd": str(exposure) if exposure else None,
        "requiredAuthorization": {
            "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1",
            "ASSET_FORGE_MAX_PROVIDER_CALLS": max_provider_calls,
            "ASSET_FORGE_MAX_COST_USD": str(exposure) if exposure else "set-before-run",
            "ASSET_FORGE_MAX_UNIT_COST_USD": str(unit_cost) if unit_cost else "set-before-run",
            "ASSET_RENDERER_MAX_ATTEMPTS": "1",
        },
        "limits": {
            "entries": args.limit_entries,
            "outputs": args.limit_outputs,
        },
        "outputs": outputs,
    }

    rendered = json.dumps(plan, indent=2) + "\n"
    if args.output:
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rendered, encoding="utf-8")
        print(f"FORGE_PLAN={target}")
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
