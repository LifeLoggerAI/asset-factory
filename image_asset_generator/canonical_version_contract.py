"""Single executable authority for URAI Asset Factory V1-V5 release meaning.

This module performs no provider calls. It builds deterministic manifest inputs,
validates them against ``canonical_version_catalog.json``, computes hashes, and
produces a worst-case provider-call/cost exposure plan for an operator to review
before a paid forge is allowed to start.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
from contextlib import redirect_stdout
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import canonical_release_manifests

BASE_DIR = Path(__file__).resolve().parent
CATALOG_PATH = BASE_DIR / "canonical_version_catalog.json"
EXPECTED_MATRIX = {
    "v1": (53, "URAI V1 — Genesis Public Route World", "assets/urai"),
    "v2": (80, "URAI V2 — Living System States", "assets/urai/v2"),
    "v3": (14, "URAI V3 — Relationship, Shadow and Pattern World", "assets/urai/v3"),
    "v4": (39, "URAI V4 — WebXR, AR and VR Pathway", "assets/urai/xr"),
    "v5": (27, "URAI V5 — Mirror of Becoming and Autonomous Legacy", "assets/urai/v5"),
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, received {raw!r}") from exc
    if value < 1:
        raise ValueError(f"{name} must be at least 1")
    return value


def _optional_money(name: str) -> Decimal | None:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return None
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError(f"{name} must be a decimal amount, received {raw!r}") from exc
    if value < 0:
        raise ValueError(f"{name} cannot be negative")
    return value


def load_catalog() -> dict[str, Any]:
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    versions = payload.get("versions")
    if not isinstance(versions, dict):
        raise ValueError("canonical_version_catalog.json requires a versions object")
    if set(versions) != set(EXPECTED_MATRIX):
        raise ValueError(
            f"Canonical catalog versions must be {sorted(EXPECTED_MATRIX)}, found {sorted(versions)}"
        )

    for version, (count, label, prefix) in EXPECTED_MATRIX.items():
        config = versions[version]
        observed = (
            int(config.get("expectedOutputs", 0)),
            str(config.get("label", "")),
            str(config.get("assetPrefix", "")).rstrip("/"),
        )
        expected = (count, label, prefix)
        if observed != expected:
            raise ValueError(f"{version} canonical contract mismatch: expected {expected!r}, found {observed!r}")
    return payload


def resolve_version(version: str) -> dict[str, Any]:
    catalog = load_catalog()
    try:
        return dict(catalog["versions"][version])
    except KeyError as exc:
        raise ValueError(f"Unknown URAI version {version!r}; expected one of {', '.join(EXPECTED_MATRIX)}") from exc


def _load_entries(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or not value:
        raise ValueError(f"{path} must contain a non-empty asset list")
    return value


def _entry_path(entry: dict[str, Any]) -> str:
    candidate = entry.get("canonical_path") or entry.get("path_template")
    if not isinstance(candidate, str) or not candidate:
        raise ValueError(f"Asset {entry.get('name', '<unnamed>')} has no canonical_path or path_template")
    return candidate


def _build_manifest_quietly(version: str) -> Path:
    # Older deterministic builders print their intermediate summary. Suppress that
    # output so contract/dry-run commands always emit one machine-readable object.
    with redirect_stdout(io.StringIO()):
        return canonical_release_manifests.build(version).resolve()


def build_and_validate(version: str) -> dict[str, Any]:
    config = resolve_version(version)
    manifest_path = _build_manifest_quietly(version)
    if BASE_DIR not in manifest_path.parents:
        raise ValueError(f"Manifest escaped Asset Factory root: {manifest_path}")

    entries = _load_entries(manifest_path)
    expected = int(config["expectedOutputs"])
    if len(entries) != expected:
        raise ValueError(f"{version} expects {expected} outputs, generated {len(entries)}")

    names = [entry.get("name") for entry in entries]
    paths = [_entry_path(entry) for entry in entries]
    if any(not isinstance(name, str) or not name for name in names):
        raise ValueError(f"{version} contains an empty asset name")
    if len(names) != len(set(names)):
        raise ValueError(f"{version} contains duplicate asset names")
    if len(paths) != len(set(paths)):
        raise ValueError(f"{version} contains duplicate asset paths")

    prefix = str(config["assetPrefix"]).rstrip("/") + "/"
    invalid = [path for path in paths if not path.startswith(prefix)]
    if invalid:
        raise ValueError(f"{version} paths must remain under {prefix}; first invalid path: {invalid[0]}")

    return {
        "version": version,
        "label": config["label"],
        "expectedOutputs": expected,
        "actualOutputs": len(entries),
        "assetPrefix": str(config["assetPrefix"]).rstrip("/"),
        "targetRepo": config["targetRepo"],
        "proofProfile": config["proofProfile"],
        "manifest": str(manifest_path.relative_to(BASE_DIR)),
        "manifestPath": manifest_path,
        "manifestSha256": _sha256(manifest_path),
        "entries": entries,
    }


def cost_exposure(version: str) -> dict[str, Any]:
    contract = build_and_validate(version)
    rounds = _positive_int("ASSET_FORGE_MAX_ROUNDS", 3)
    attempts = _positive_int("ASSET_FORGE_MAX_ATTEMPTS", 3)
    maximum_calls = contract["expectedOutputs"] * rounds * attempts
    unit_cost = _optional_money("ASSET_PROVIDER_UNIT_COST_USD")
    ceiling = _optional_money("ASSET_FORGE_MAX_BATCH_USD")
    maximum_cost = unit_cost * maximum_calls if unit_cost is not None else None

    return {
        "schemaVersion": "urai-asset-cost-exposure-1",
        "providerCallsExecuted": 0,
        "version": version,
        "versionLabel": contract["label"],
        "manifest": contract["manifest"],
        "manifestSha256": contract["manifestSha256"],
        "expectedOutputs": contract["expectedOutputs"],
        "maxRounds": rounds,
        "maxAttemptsPerAssetPerRound": attempts,
        "maximumProviderCalls": maximum_calls,
        "unitCostUsd": str(unit_cost) if unit_cost is not None else None,
        "maximumExposureUsd": str(maximum_cost) if maximum_cost is not None else None,
        "configuredBatchCeilingUsd": str(ceiling) if ceiling is not None else None,
        "paidRunAllowed": bool(
            unit_cost is not None
            and ceiling is not None
            and maximum_cost is not None
            and maximum_cost <= ceiling
        ),
    }


def assert_provider_budget(version: str) -> dict[str, Any]:
    plan = cost_exposure(version)
    if plan["unitCostUsd"] is None:
        raise RuntimeError("Provider mode is blocked: ASSET_PROVIDER_UNIT_COST_USD is required.")
    if plan["configuredBatchCeilingUsd"] is None:
        raise RuntimeError("Provider mode is blocked: ASSET_FORGE_MAX_BATCH_USD is required.")
    if not plan["paidRunAllowed"]:
        raise RuntimeError(
            "Provider mode is blocked: worst-case exposure "
            f"${plan['maximumExposureUsd']} exceeds the configured ceiling "
            f"${plan['configuredBatchCeilingUsd']}."
        )
    return plan


def contract_matrix() -> dict[str, Any]:
    versions: dict[str, Any] = {}
    for version in EXPECTED_MATRIX:
        contract = build_and_validate(version)
        versions[version] = {key: value for key, value in contract.items() if key not in {"entries", "manifestPath"}}
    return {
        "schemaVersion": "urai-canonical-version-contract-1",
        "providerCallsExecuted": 0,
        "versions": versions,
    }


def main() -> int:
    print(json.dumps(contract_matrix(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
