"""Fail-closed authorization and budget accounting for paid generation requests."""

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

BASE_DIR = Path(__file__).resolve().parent
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


def _default_state_path(run_id: str) -> Path:
    return (
        Path(tempfile.gettempdir())
        / "urai-asset-factory"
        / run_id
        / "paid-request-state.json"
    )


def _policy() -> dict[str, Any]:
    if os.environ.get("ASSET_FORGE_PAID_RUN_AUTHORIZED", "0") != "1":
        raise PaidRequestUnauthorized(
            "ASSET_FORGE_PAID_RUN_AUTHORIZED=1 is required before network access"
        )
    max_calls = _positive_int("ASSET_FORGE_MAX_PROVIDER_CALLS")
    unit_cost = _positive_decimal("ASSET_FORGE_MAX_UNIT_COST_USD")
    max_cost = _positive_decimal("ASSET_FORGE_MAX_COST_USD")
    if unit_cost * Decimal(max_calls) > max_cost:
        raise PaidRequestUnauthorized(
            "Declared provider exposure exceeds the authorized cost ceiling"
        )
    run_id = (
        os.environ.get("ASSET_FORGE_RUN_ID", "").strip()
        or os.environ.get("GITHUB_RUN_ID", "").strip()
        or f"local-{os.getpid()}"
    )
    configured = os.environ.get("ASSET_FORGE_BUDGET_STATE_PATH", "").strip()
    state_path = Path(configured).expanduser() if configured else _default_state_path(run_id)
    return {
        "runId": run_id,
        "maxCalls": max_calls,
        "unitCost": unit_cost,
        "maxCost": max_cost,
        "statePath": state_path.resolve(),
    }


def _lock_path(policy: dict[str, Any]) -> Path:
    state_path: Path = policy["statePath"]
    return state_path.with_name(f"{state_path.name}.lock")


@contextmanager
def _state_lock(policy: dict[str, Any]) -> Iterator[None]:
    """Serialize budget reservations across processes and fail closed on lock timeout."""
    lock_path = _lock_path(policy)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + LOCK_TIMEOUT_SECONDS
    descriptor: int | None = None

    while descriptor is None:
        try:
            descriptor = os.open(
                lock_path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
            os.write(
                descriptor,
                json.dumps(
                    {
                        "pid": os.getpid(),
                        "runId": policy["runId"],
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                    }
                ).encode("utf-8"),
            )
        except FileExistsError:
            try:
                age = time.time() - lock_path.stat().st_mtime
                if age > LOCK_STALE_SECONDS:
                    lock_path.unlink(missing_ok=True)
                    continue
            except FileNotFoundError:
                continue
            if time.monotonic() >= deadline:
                raise PaidRequestLimitReached(
                    "Timed out waiting for the paid-request budget lock before network access"
                )
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


def _validate_state(policy: dict[str, Any], payload: dict[str, Any]) -> None:
    if payload.get("runId") != policy["runId"]:
        raise PaidRequestUnauthorized("Budget state belongs to a different run")

    calls = payload.get("providerCallsExecuted")
    attempts = payload.get("attempts")
    if not isinstance(calls, int) or calls < 0 or not isinstance(attempts, list):
        raise PaidRequestUnauthorized("Budget state is malformed")
    if len(attempts) != calls:
        raise PaidRequestUnauthorized(
            "Budget state attempt count does not match providerCallsExecuted"
        )
    if calls > policy["maxCalls"]:
        raise PaidRequestLimitReached(
            "Budget state already exceeds the authorized provider-call ceiling"
        )

    expected_cost = policy["unitCost"] * Decimal(calls)
    try:
        recorded_cost = Decimal(str(payload.get("reservedEstimatedCostUsd", "")))
    except InvalidOperation as exc:
        raise PaidRequestUnauthorized(
            "Budget state reservedEstimatedCostUsd is malformed"
        ) from exc
    if recorded_cost != expected_cost:
        raise PaidRequestUnauthorized(
            "Budget state cost total does not match the authorized unit-cost ledger"
        )
    if expected_cost > policy["maxCost"]:
        raise PaidRequestLimitReached(
            "Budget state already exceeds the authorized cost ceiling"
        )

    seen_attempt_ids: set[str] = set()
    allowed_statuses = {"reserved", "succeeded", "failed"}
    for number, attempt in enumerate(attempts, start=1):
        if not isinstance(attempt, dict):
            raise PaidRequestUnauthorized("Budget state contains a malformed attempt")
        expected_id = f"{policy['runId']}:{number}"
        if attempt.get("attemptId") != expected_id:
            raise PaidRequestUnauthorized(
                "Budget state attempt IDs are not contiguous for this run"
            )
        if expected_id in seen_attempt_ids:
            raise PaidRequestUnauthorized("Budget state contains duplicate attempt IDs")
        seen_attempt_ids.add(expected_id)
        if attempt.get("callNumber") != number:
            raise PaidRequestUnauthorized(
                "Budget state call numbers are not contiguous"
            )
        if attempt.get("status") not in allowed_statuses:
            raise PaidRequestUnauthorized(
                "Budget state contains an invalid attempt status"
            )
        if str(attempt.get("reservedUnitCostUsd")) != str(policy["unitCost"]):
            raise PaidRequestUnauthorized(
                "Budget state attempt unit cost differs from the authorized policy"
            )
        cumulative = policy["unitCost"] * Decimal(number)
        if str(attempt.get("reservedCumulativeCostUsd")) != str(cumulative):
            raise PaidRequestUnauthorized(
                "Budget state cumulative cost ledger is inconsistent"
            )


def _load(policy: dict[str, Any]) -> dict[str, Any]:
    path: Path = policy["statePath"]
    if not path.exists():
        return _new_state(policy)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PaidRequestUnauthorized("Budget state cannot be read safely") from exc
    if not isinstance(payload, dict):
        raise PaidRequestUnauthorized("Budget state must be a JSON object")
    _validate_state(policy, payload)
    return payload


def _write(policy: dict[str, Any], state: dict[str, Any]) -> None:
    _validate_state(policy, state)
    path: Path = policy["statePath"]
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updatedAt"] = datetime.now(timezone.utc).isoformat()
    temporary_path = path.with_name(
        f"{path.name}.{os.getpid()}.{time.time_ns()}.tmp"
    )
    temporary_path.write_text(
        json.dumps(state, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary_path, 0o600)
    os.replace(temporary_path, path)


def reserve(
    *,
    provider: str,
    model: str | None,
    asset: str,
    request_size: str,
) -> dict[str, Any]:
    """Reserve one paid HTTP attempt before the request is sent."""
    policy = _policy()
    with _state_lock(policy):
        state = _load(policy)
        next_call = int(state.get("providerCallsExecuted", 0)) + 1
        next_cost = policy["unitCost"] * Decimal(next_call)
        if next_call > policy["maxCalls"] or next_cost > policy["maxCost"]:
            raise PaidRequestLimitReached(
                "Provider call or cost ceiling reached before network access"
            )
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


def record(
    attempt_id: str,
    *,
    status: str,
    request_id: str | None = None,
    error: str | None = None,
) -> None:
    if status not in {"succeeded", "failed"}:
        raise PaidRequestUnauthorized("Paid request completion status is invalid")
    policy = _policy()
    with _state_lock(policy):
        state = _load(policy)
        for attempt in state.get("attempts", []):
            if attempt.get("attemptId") == attempt_id:
                if attempt.get("status") != "reserved":
                    raise PaidRequestUnauthorized(
                        "Paid request attempt has already been completed"
                    )
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
    with _state_lock(policy):
        state = _load(policy)
        return json.loads(json.dumps(state))
