"""Atomic authorization and budget ledger for provider-backed asset requests."""

from __future__ import annotations

import json
import os
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterator

LOCK_TIMEOUT_SECONDS = 30.0
LOCK_STALE_SECONDS = 300.0


class PaidRequestGuardError(RuntimeError):
    pass


class PaidRequestUnauthorized(PaidRequestGuardError):
    pass


class PaidRequestLimitReached(PaidRequestGuardError):
    pass


def _positive_int(name: str) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise PaidRequestUnauthorized(f"{name} must be an integer") from exc
    if value < 1:
        raise PaidRequestUnauthorized(f"{name} must be greater than zero")
    return value


def _positive_decimal(name: str) -> Decimal:
    raw = os.environ.get(name, "").strip()
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise PaidRequestUnauthorized(f"{name} must be a decimal") from exc
    if value <= 0:
        raise PaidRequestUnauthorized(f"{name} must be greater than zero")
    return value


def _policy() -> dict[str, Any]:
    if os.environ.get("ASSET_FORGE_PAID_RUN_AUTHORIZED", "0") != "1":
        raise PaidRequestUnauthorized("explicit paid-run authorization is required")
    max_calls = _positive_int("ASSET_FORGE_MAX_PROVIDER_CALLS")
    unit_cost = _positive_decimal("ASSET_FORGE_MAX_UNIT_COST_USD")
    max_cost = _positive_decimal("ASSET_FORGE_MAX_COST_USD")
    if unit_cost * Decimal(max_calls) > max_cost:
        raise PaidRequestUnauthorized("declared exposure exceeds the authorized ceiling")
    run_id = (
        os.environ.get("ASSET_FORGE_RUN_ID", "").strip()
        or os.environ.get("GITHUB_RUN_ID", "").strip()
        or f"local-{os.getpid()}"
    )
    configured = os.environ.get("ASSET_FORGE_BUDGET_STATE_PATH", "").strip()
    state_path = (
        Path(configured).expanduser()
        if configured
        else Path(tempfile.gettempdir())
        / "urai-asset-factory"
        / run_id
        / "paid-request-state.json"
    )
    return {
        "runId": run_id,
        "maxCalls": max_calls,
        "unitCost": unit_cost,
        "maxCost": max_cost,
        "statePath": state_path.resolve(),
    }


@contextmanager
def _state_lock(policy: dict[str, Any]) -> Iterator[None]:
    state_path: Path = policy["statePath"]
    lock_path = state_path.with_name(f"{state_path.name}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
    descriptor: int | None = None
    while descriptor is None:
        try:
            descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.write(descriptor, policy["runId"].encode("utf-8"))
        except FileExistsError:
            try:
                if time.time() - lock_path.stat().st_mtime > LOCK_STALE_SECONDS:
                    lock_path.unlink(missing_ok=True)
                    continue
            except FileNotFoundError:
                continue
            if time.monotonic() >= deadline:
                raise PaidRequestLimitReached("budget ledger lock timeout")
            time.sleep(0.05)
    try:
        yield
    finally:
        if descriptor is not None:
            os.close(descriptor)
        lock_path.unlink(missing_ok=True)


def _new_state(policy: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": "1.1.0",
        "runId": policy["runId"],
        "providerCallsExecuted": 0,
        "reservedEstimatedCostUsd": "0",
        "attempts": [],
    }


def _validate_state(policy: dict[str, Any], state: dict[str, Any]) -> None:
    calls = state.get("providerCallsExecuted")
    attempts = state.get("attempts")
    if state.get("runId") != policy["runId"]:
        raise PaidRequestUnauthorized("budget ledger belongs to another run")
    if not isinstance(calls, int) or calls < 0 or not isinstance(attempts, list):
        raise PaidRequestUnauthorized("budget ledger is malformed")
    if calls != len(attempts):
        raise PaidRequestUnauthorized("attempt count does not match reserved calls")
    if calls > policy["maxCalls"]:
        raise PaidRequestLimitReached("provider-call ceiling exceeded")
    expected_cost = policy["unitCost"] * Decimal(calls)
    try:
        recorded_cost = Decimal(str(state.get("reservedEstimatedCostUsd", "")))
    except InvalidOperation as exc:
        raise PaidRequestUnauthorized("budget total is malformed") from exc
    if recorded_cost != expected_cost:
        raise PaidRequestUnauthorized("budget total does not match the call ledger")
    if expected_cost > policy["maxCost"]:
        raise PaidRequestLimitReached("cost ceiling exceeded")
    for number, attempt in enumerate(attempts, start=1):
        expected_id = f"{policy['runId']}:{number}"
        if not isinstance(attempt, dict) or attempt.get("attemptId") != expected_id:
            raise PaidRequestUnauthorized("attempt identifiers are not contiguous")
        if attempt.get("callNumber") != number:
            raise PaidRequestUnauthorized("call numbers are not contiguous")
        if attempt.get("status") not in {"reserved", "succeeded", "failed"}:
            raise PaidRequestUnauthorized("attempt status is invalid")
        if str(attempt.get("reservedUnitCostUsd")) != str(policy["unitCost"]):
            raise PaidRequestUnauthorized("attempt unit cost differs from policy")
        if str(attempt.get("reservedCumulativeCostUsd")) != str(
            policy["unitCost"] * Decimal(number)
        ):
            raise PaidRequestUnauthorized("attempt cumulative cost is inconsistent")


def _load(policy: dict[str, Any]) -> dict[str, Any]:
    path: Path = policy["statePath"]
    if not path.exists():
        return _new_state(policy)
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PaidRequestUnauthorized("budget ledger cannot be read") from exc
    if not isinstance(state, dict):
        raise PaidRequestUnauthorized("budget ledger must be an object")
    _validate_state(policy, state)
    return state


def _write(policy: dict[str, Any], state: dict[str, Any]) -> None:
    _validate_state(policy, state)
    path: Path = policy["statePath"]
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updatedAt"] = datetime.now(timezone.utc).isoformat()
    temporary = path.with_name(f"{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
    temporary.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def reserve(*, provider: str, model: str | None, asset: str, request_size: str) -> dict[str, Any]:
    policy = _policy()
    with _state_lock(policy):
        state = _load(policy)
        next_call = state["providerCallsExecuted"] + 1
        next_cost = policy["unitCost"] * Decimal(next_call)
        if next_call > policy["maxCalls"] or next_cost > policy["maxCost"]:
            raise PaidRequestLimitReached("authorized provider budget is exhausted")
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
        state["attempts"].append(attempt)
        _write(policy, state)
        return attempt


def record(
    attempt_id: str,
    *,
    status: str,
    request_id: str | None = None,
    error: str | None = None,
) -> None:
    if status not in {"succeeded", "failed"}:
        raise PaidRequestUnauthorized("completion status is invalid")
    policy = _policy()
    with _state_lock(policy):
        state = _load(policy)
        for attempt in state["attempts"]:
            if attempt.get("attemptId") != attempt_id:
                continue
            if attempt.get("status") != "reserved":
                raise PaidRequestUnauthorized("attempt has already been completed")
            attempt["status"] = status
            attempt["completedAt"] = datetime.now(timezone.utc).isoformat()
            if request_id:
                attempt["providerRequestId"] = request_id
            if error:
                attempt["error"] = error[:500]
            _write(policy, state)
            return
    raise PaidRequestUnauthorized("unknown attempt")


def snapshot() -> dict[str, Any]:
    policy = _policy()
    with _state_lock(policy):
        return json.loads(json.dumps(_load(policy)))
