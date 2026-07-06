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
    return json.loads(
        (GENERATOR / "canonical_version_catalog.json").read_text(encoding="utf-8")
    )


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
    selected_entries = entries[: args.limit_entries] if args.limit_entries else entries

    outputs: list[dict[str, Any]] = []
    for entry in selected_entries:
        for size in entry.get("sizes", []):
            outputs.append(
                {
                    "name": entry["name"],
                    "size": int(size),
                    "pathTemplate": entry["path_template"],
                    "canonicalPath": entry.get("canonical_path"),
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
    config = catalog["versions"][args.version]
    plan = {
        "schemaVersion": "1.0.0",
        "mode": "dry-run-no-provider-calls",
        "providerCallsExecuted": 0,
        "version": args.version,
        "versionLabel": config["label"],
        "proofProfile": config["proofProfile"],
        "manifest": str(manifest_path.relative_to(GENERATOR)),
        "manifestSha256": sha256(manifest_path),
        "catalogExpectedOutputs": int(config["expectedOutputs"]),
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
