"""Fail-closed authorization and budget accounting for paid generation requests."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent


class PaidRequestGuardError(RuntimeError):
    pass


class PaidRequestUnauthorized(PaidRequestGuardError):
    pass


class PaidRequestLimitReached(PaidRequestGuardError):
    pass


def _positive_int(name: str) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise PaidRequestUnauthorized(f"{name} is required")
    try:
        value = int(raw)
    except ValueError as exc:
        raise PaidRequestUnauthorized(f"{name} must be an integer") from exc
    if value < 1:
        raise PaidRequestUnauthorized(f"{name} must be greater than zero")
    return value


def _positive_decimal(name: str) -> Decimal:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise PaidRequestUnauthorized(f"{name} is required")
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise PaidRequestUnauthorized(f"{name} must be a decimal") from exc
    if value <= 0:
        raise PaidRequestUnauthorized(f"{name} must be greater than zero")
    return value


def _policy() -> dict[str, Any]:
    if os.environ.get("ASSET_FORGE_PAID_RUN_AUTHORIZED", "0") != "1":
        raise PaidRequestUnauthorized(
            "ASSET_FORGE_PAID_RUN_AUTHORIZED=1 is required before network access"
        )
    max_calls = _positive_int("ASSET_FORGE_MAX_PROVIDER_CALLS")
    unit_cost = _positive_decimal("ASSET_FORGE_MAX_UNIT_COST_USD")
    max_cost = _positive_decimal("ASSET_FORGE_MAX_COST_USD")
    if unit_cost * Decimal(max_calls) > max_cost:
        raise PaidRequestUnauthorized("Declared provider exposure exceeds the authorized cost ceiling")
    run_id = (
        os.environ.get("ASSET_FORGE_RUN_ID", "").strip()
        or os.environ.get("GITHUB_RUN_ID", "").strip()
        or f"local-{os.getpid()}"
    )
    configured = os.environ.get("ASSET_FORGE_BUDGET_STATE_PATH", "").strip()
    state_path = Path(configured) if configured else BASE_DIR / f"paid_request_state_{run_id}.json"
    return {
        "runId": run_id,
        "maxCalls": max_calls,
        "unitCost": unit_cost,
        "maxCost": max_cost,
        "statePath": state_path,
    }


def _load(policy: dict[str, Any]) -> dict[str, Any]:
    path: Path = policy["statePath"]
    if not path.exists():
        return {
            "schemaVersion": "1.0.0",
            "runId": policy["runId"],
            "providerCallsExecuted": 0,
            "reservedEstimatedCostUsd": "0",
            "attempts": [],
        }
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("runId") != policy["runId"]:
        raise PaidRequestUnauthorized("Budget state belongs to a different run")
    return payload


def _write(policy: dict[str, Any], state: dict[str, Any]) -> None:
    path: Path = policy["statePath"]
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updatedAt"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def reserve(*, provider: str, model: str | None, asset: str, request_size: str) -> dict[str, Any]:
    """Reserve one paid HTTP attempt before the request is sent."""
    policy = _policy()
    state = _load(policy)
    next_call = int(state.get("providerCallsExecuted", 0)) + 1
    next_cost = policy["unitCost"] * Decimal(next_call)
    if next_call > policy["maxCalls"] or next_cost > policy["maxCost"]:
        raise PaidRequestLimitReached("Provider call or cost ceiling reached before network access")
    attempt = {
        "attemptId": f"{policy['runId']}:{next_call}",
        "reservedAt": datetime.now(timezone.utc).isoformat(),
        "status": "reserved",
        "provider": provider,
        "model": model,
        "asset": asset,
        "requestSize": request_size,
        "callNumber": next_call,
        "reservedUnitCostUsd": str(policy["unitCost"]),
        "reservedCumulativeCostUsd": str(next_cost),
    }
    state["providerCallsExecuted"] = next_call
    state["reservedEstimatedCostUsd"] = str(next_cost)
    state.setdefault("attempts", []).append(attempt)
    _write(policy, state)
    return attempt


def record(attempt_id: str, *, status: str, request_id: str | None = None, error: str | None = None) -> None:
    policy = _policy()
    state = _load(policy)
    for attempt in state.get("attempts", []):
        if attempt.get("attemptId") == attempt_id:
            attempt["status"] = status
            attempt["completedAt"] = datetime.now(timezone.utc).isoformat()
            if request_id:
                attempt["providerRequestId"] = request_id
            if error:
                attempt["error"] = error[:500]
            _write(policy, state)
            return
    raise PaidRequestUnauthorized("Unknown paid request attempt")


def snapshot() -> dict[str, Any]:
    policy = _policy()
    return _load(policy)
