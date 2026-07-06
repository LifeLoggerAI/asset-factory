"""Run the asset production cycle with retry-aware paid-provider controls."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import create_firebase_seed
import create_preview
import export_assets
import export_spatial_handoff
import paid_request_guard
import render_v1_round
import score_v1_assets
import validate_assets
import validate_manifest

BASE_DIR = Path(__file__).resolve().parent
RECEIPT_PATH = BASE_DIR / "forge_receipt.json"


def env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def required_positive_int(name: str) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise ValueError(f"{name} is required before a paid provider run")
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value < 1:
        raise ValueError(f"{name} must be greater than zero")
    return value


def required_positive_decimal(name: str) -> Decimal:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise ValueError(f"{name} is required before a paid provider run")
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError(f"{name} must be a decimal number") from exc
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def provider_calls_possible() -> bool:
    mode = os.environ.get("ASSET_RENDERER_MODE", "auto").strip().lower()
    if mode == "offline":
        return False
    if mode not in {"auto", "provider"}:
        raise ValueError(f"Unsupported ASSET_RENDERER_MODE={mode!r}")

    provider = (
        os.environ.get("ASSET_RENDERER_PROVIDER", "custom").strip().lower()
        or "custom"
    )
    if provider == "openai":
        configured = bool(
            os.environ.get("OPENAI_API_KEY", "").strip()
            or os.environ.get("ASSET_RENDERER_API_KEY", "").strip()
        )
    else:
        configured = bool(os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip())

    return mode == "provider" or (mode == "auto" and configured)


def build_cost_policy(max_rounds: int) -> dict[str, Any]:
    if not provider_calls_possible():
        return {
            "paidRun": False,
            "providerCallsExecuted": 0,
            "maxQualityRounds": max_rounds,
        }

    if os.environ.get("ASSET_FORGE_PAID_RUN_AUTHORIZED", "0") != "1":
        raise ValueError(
            "ASSET_FORGE_PAID_RUN_AUTHORIZED=1 is required before provider calls"
        )

    max_provider_calls = required_positive_int("ASSET_FORGE_MAX_PROVIDER_CALLS")
    max_unit_cost = required_positive_decimal("ASSET_FORGE_MAX_UNIT_COST_USD")
    max_cost = required_positive_decimal("ASSET_FORGE_MAX_COST_USD")
    max_attempts = env_int("ASSET_RENDERER_MAX_ATTEMPTS", 3)
    declared_exposure = max_unit_cost * Decimal(max_provider_calls)

    if declared_exposure > max_cost:
        raise ValueError(
            "Declared provider exposure exceeds ASSET_FORGE_MAX_COST_USD: "
            f"{declared_exposure} > {max_cost}"
        )

    return {
        "paidRun": True,
        "authorized": True,
        "providerCallsExecuted": 0,
        "maxProviderCalls": max_provider_calls,
        "maxAttemptsPerOutput": max_attempts,
        "maxQualityRounds": max_rounds,
        "declaredMaxUnitCostUsd": str(max_unit_cost),
        "declaredMaxCostExposureUsd": str(declared_exposure),
        "authorizedMaxCostUsd": str(max_cost),
    }


def paid_request_evidence(cost_policy: dict[str, Any]) -> dict[str, Any]:
    if not cost_policy.get("paidRun"):
        return {
            "paidRun": False,
            "ledgerAvailable": True,
            "providerCallsExecuted": 0,
            "reservedEstimatedCostUsd": "0",
            "attempts": [],
        }
    try:
        snapshot = paid_request_guard.snapshot()
    except paid_request_guard.PaidRequestGuardError as exc:
        return {
            "paidRun": True,
            "ledgerAvailable": False,
            "error": str(exc),
        }
    return {
        "paidRun": True,
        "ledgerAvailable": True,
        **snapshot,
    }


def sync_actual_cost_policy(cost_policy: dict[str, Any]) -> dict[str, Any]:
    evidence = paid_request_evidence(cost_policy)
    if evidence.get("ledgerAvailable"):
        cost_policy["providerCallsExecuted"] = int(
            evidence.get("providerCallsExecuted", 0)
        )
        cost_policy["reservedEstimatedCostUsd"] = str(
            evidence.get("reservedEstimatedCostUsd", "0")
        )
    return evidence


def require_completed_paid_ledger(cost_policy: dict[str, Any]) -> dict[str, Any]:
    evidence = sync_actual_cost_policy(cost_policy)
    if not cost_policy.get("paidRun"):
        return evidence
    if not evidence.get("ledgerAvailable"):
        raise RuntimeError(
            "Paid provider run cannot be receipted because the request ledger is unavailable"
        )
    incomplete = [
        attempt.get("attemptId")
        for attempt in evidence.get("attempts", [])
        if attempt.get("status") == "reserved"
    ]
    if incomplete:
        raise RuntimeError(
            "Paid provider run has incomplete request attempts: "
            + ", ".join(str(value) for value in incomplete)
        )
    return evidence


def write_blocked_receipt(
    *,
    status: str,
    error_code: str,
    error: str,
    rounds: list[dict[str, Any]],
    cost_policy: dict[str, Any],
    blocked_round: int | None = None,
) -> None:
    evidence = sync_actual_cost_policy(cost_policy)
    receipt = {
        "schemaVersion": "1.4.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "blockedRound": blocked_round,
        "errorCode": error_code,
        "error": error,
        "rounds": rounds,
        "costPolicy": cost_policy,
        "paidRequestLedger": evidence,
    }
    RECEIPT_PATH.write_text(
        json.dumps(receipt, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    max_rounds = env_int("ASSET_FORGE_MAX_ROUNDS", 3)
    require_provider = os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER", "1") == "1"
    os.environ["ASSET_QUALITY_REQUIRE_PROVIDER"] = "1" if require_provider else "0"

    try:
        cost_policy = build_cost_policy(max_rounds)
    except ValueError as exc:
        blocked_policy = {
            "paidRun": provider_calls_possible(),
            "providerCallsExecuted": 0,
            "maxQualityRounds": max_rounds,
        }
        write_blocked_receipt(
            status="blocked-authorization",
            error_code="paid_provider_gate_rejected",
            error=str(exc),
            rounds=[],
            cost_policy=blocked_policy,
        )
        print(f"::error title=Asset forge paid-provider gate rejected::{exc}")
        print(f"FORGE_RECEIPT={RECEIPT_PATH}")
        return 7

    manifest_errors = validate_manifest.validate_manifest()
    if manifest_errors:
        for error in manifest_errors:
            print(f"MANIFEST_ERROR {error}")
        return 1

    rounds: list[dict[str, Any]] = []
    passed = False
    final_quality_exit = 4
    conservative_provider_calls = 0
    configured_output_limit = os.environ.get(
        "ASSET_FORGE_LIMIT_OUTPUTS", ""
    ).strip()

    for round_number in range(1, max_rounds + 1):
        if cost_policy.get("paidRun"):
            max_provider_calls = int(cost_policy["maxProviderCalls"])
            max_attempts = int(cost_policy["maxAttemptsPerOutput"])
            remaining_calls = max_provider_calls - conservative_provider_calls
            remaining_outputs = remaining_calls // max_attempts
            if remaining_outputs < 1:
                cost_policy[
                    "conservativeProviderCallCeilingUsed"
                ] = conservative_provider_calls
                write_blocked_receipt(
                    status="blocked-cost-ceiling",
                    error_code="provider_call_ceiling_reached",
                    error=(
                        "The conservative provider-call ceiling was exhausted "
                        "before another quality round."
                    ),
                    rounds=rounds,
                    cost_policy=cost_policy,
                    blocked_round=round_number,
                )
                print(
                    "::error title=Asset forge stopped at cost ceiling::"
                    "No further provider calls are authorized."
                )
                print(f"FORGE_RECEIPT={RECEIPT_PATH}")
                return 8

            if configured_output_limit:
                requested_limit = required_positive_int("ASSET_FORGE_LIMIT_OUTPUTS")
                remaining_outputs = min(remaining_outputs, requested_limit)
            os.environ["ASSET_FORGE_LIMIT_OUTPUTS"] = str(remaining_outputs)

        print(f"=== ASSET ROUND {round_number}/{max_rounds} ===")
        try:
            generation = render_v1_round.render_round(round_number)
        except RuntimeError as exc:
            message = str(exc)
            if (
                "billing_hard_limit_reached" in message
                or "Billing hard limit has been reached" in message
            ):
                status = "blocked-billing"
                error_code = "billing_hard_limit_reached"
                exit_code = 6
                title = "Asset forge blocked by API billing"
            else:
                status = "blocked-provider-error"
                error_code = "provider_render_failed"
                exit_code = 9
                title = "Asset forge provider request failed"
            write_blocked_receipt(
                status=status,
                error_code=error_code,
                error=message,
                rounds=rounds,
                cost_policy=cost_policy,
                blocked_round=round_number,
            )
            print(f"::error title={title}::{message}")
            print(f"FORGE_RECEIPT={RECEIPT_PATH}")
            return exit_code

        if cost_policy.get("paidRun"):
            conservative_provider_calls += int(
                generation.get("outputRequests", 0)
            ) * int(cost_policy["maxAttemptsPerOutput"])
            cost_policy[
                "conservativeProviderCallCeilingUsed"
            ] = conservative_provider_calls
            sync_actual_cost_policy(cost_policy)

        validation_errors = validate_assets.validate()
        quality_exit = score_v1_assets.main()
        rounds.append(
            {
                "round": round_number,
                "generation": generation,
                "validationErrors": validation_errors,
                "qualityExit": quality_exit,
            }
        )
        final_quality_exit = quality_exit
        if not validation_errors and quality_exit == 0:
            passed = True
            break
        print("The next round will render entries listed in upgrade_feedback.json.")

    try:
        request_evidence = require_completed_paid_ledger(cost_policy)
    except RuntimeError as exc:
        write_blocked_receipt(
            status="blocked-incomplete-provider-ledger",
            error_code="provider_request_ledger_incomplete",
            error=str(exc),
            rounds=rounds,
            cost_policy=cost_policy,
        )
        print(f"::error title=Asset forge request receipt incomplete::{exc}")
        print(f"FORGE_RECEIPT={RECEIPT_PATH}")
        return 10

    if not passed:
        receipt = {
            "schemaVersion": "1.4.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "needs-upgrade",
            "rounds": rounds,
            "costPolicy": cost_policy,
            "paidRequestLedger": request_evidence,
            "qualityReport": "quality_report.json",
            "upgradeFeedback": "upgrade_feedback.json",
        }
        RECEIPT_PATH.write_text(
            json.dumps(receipt, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Asset cycle needs another art pass after {max_rounds} round(s).")
        print(f"FORGE_RECEIPT={RECEIPT_PATH}")
        return final_quality_exit or 4

    create_preview.main()
    create_firebase_seed.main()
    asset_pack = export_assets.export()
    export_spatial_handoff.main()

    handoff_manifest = (
        BASE_DIR
        / "spatial_handoff"
        / "assets"
        / "urai"
        / "final"
        / "manifests"
        / "asset-factory-spatial-handoff.json"
    )
    handoff = json.loads(handoff_manifest.read_text(encoding="utf-8"))
    if handoff.get("missing"):
        write_blocked_receipt(
            status="blocked-incomplete-handoff",
            error_code="spatial_handoff_missing_assets",
            error=f"Spatial handoff has {handoff['missing']} missing asset(s).",
            rounds=rounds,
            cost_policy=cost_policy,
        )
        print(f"Spatial handoff has {handoff['missing']} missing asset(s).")
        print(f"FORGE_RECEIPT={RECEIPT_PATH}")
        return 5

    receipt = {
        "schemaVersion": "1.4.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "passed",
        "rounds": rounds,
        "costPolicy": cost_policy,
        "paidRequestLedger": request_evidence,
        "assetPack": str(asset_pack.relative_to(BASE_DIR)),
        "spatialHandoff": str(handoff_manifest.relative_to(BASE_DIR)),
        "ready": handoff.get("ready"),
        "missing": handoff.get("missing"),
        "qualityReport": "quality_report.json",
    }
    RECEIPT_PATH.write_text(
        json.dumps(receipt, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Asset cycle passed.")
    print(f"FORGE_RECEIPT={RECEIPT_PATH}")
    print(f"SPATIAL_HANDOFF={BASE_DIR / 'spatial_handoff'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
