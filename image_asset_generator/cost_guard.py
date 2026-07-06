"""Process-local request and declared-cost limits for external renderers."""

from __future__ import annotations

import json
import os
from decimal import Decimal, InvalidOperation
from typing import Any

_request_count = 0


class CostGuardError(RuntimeError):
    """Raised before an external request would exceed configured limits."""


def reset_for_tests() -> None:
    global _request_count
    _request_count = 0


def _positive_int(name: str) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise CostGuardError(f"{name} is required for external rendering")
    try:
        value = int(raw)
    except ValueError as exc:
        raise CostGuardError(f"{name} must be an integer") from exc
    if value < 1:
        raise CostGuardError(f"{name} must be greater than zero")
    return value


def _positive_decimal(name: str) -> Decimal:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise CostGuardError(f"{name} is required for external rendering")
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise CostGuardError(f"{name} must be a decimal number") from exc
    if value <= 0:
        raise CostGuardError(f"{name} must be greater than zero")
    return value


def validate_configuration() -> dict[str, Any]:
    if os.environ.get("ASSET_RENDERER_EXTERNAL_AUTHORIZED") != "1":
        raise CostGuardError(
            "External rendering is blocked until ASSET_RENDERER_EXTERNAL_AUTHORIZED=1"
        )

    max_calls = _positive_int("ASSET_RENDERER_MAX_PROVIDER_CALLS")
    max_cost = _positive_decimal("ASSET_RENDERER_MAX_COST_USD")
    max_unit_cost = _positive_decimal("ASSET_RENDERER_MAX_UNIT_COST_USD")

    return {
        "maxProviderCalls": max_calls,
        "maxCostUsd": max_cost,
        "maxUnitCostUsd": max_unit_cost,
    }


def before_external_request(
    *,
    provider: str,
    asset_name: str,
    size: str,
    attempt: int,
) -> dict[str, Any]:
    global _request_count

    limits = validate_configuration()
    next_count = _request_count + 1
    if next_count > limits["maxProviderCalls"]:
        raise CostGuardError(
            f"External request {next_count} exceeds "
            f"ASSET_RENDERER_MAX_PROVIDER_CALLS={limits['maxProviderCalls']}"
        )

    exposure = Decimal(next_count) * limits["maxUnitCostUsd"]
    if exposure > limits["maxCostUsd"]:
        raise CostGuardError(
            f"Declared cost exposure {exposure} exceeds "
            f"ASSET_RENDERER_MAX_COST_USD={limits['maxCostUsd']}"
        )

    _request_count = next_count
    event = {
        "provider": provider,
        "asset": asset_name,
        "size": size,
        "attempt": attempt,
        "requestIndex": next_count,
        "maxProviderCalls": limits["maxProviderCalls"],
        "declaredMaxUnitCostUsd": str(limits["maxUnitCostUsd"]),
        "declaredCostExposureUsd": str(exposure),
        "maxCostUsd": str(limits["maxCostUsd"]),
    }
    print("ASSET_RENDERER_COST_GUARD " + json.dumps(event, sort_keys=True))
    return event


def snapshot() -> dict[str, Any]:
    max_calls = os.environ.get("ASSET_RENDERER_MAX_PROVIDER_CALLS")
    max_cost = os.environ.get("ASSET_RENDERER_MAX_COST_USD")
    max_unit_cost = os.environ.get("ASSET_RENDERER_MAX_UNIT_COST_USD")
    exposure = None
    if max_unit_cost:
        try:
            exposure = str(Decimal(max_unit_cost) * _request_count)
        except InvalidOperation:
            exposure = None
    return {
        "requestCount": _request_count,
        "maxProviderCalls": int(max_calls) if max_calls and max_calls.isdigit() else None,
        "maxCostUsd": max_cost or None,
        "maxUnitCostUsd": max_unit_cost or None,
        "declaredCostExposureUsd": exposure,
    }
