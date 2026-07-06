from __future__ import annotations

from functools import lru_cache
import os
from decimal import Decimal, InvalidOperation

_used_calls = 0


@lru_cache(maxsize=None)
def _positive_int(name: str) -> int:
    try:
        value = int(os.environ.get(name, ""))
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a positive integer") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


@lru_cache(maxsize=None)
def _positive_decimal(name: str) -> Decimal:
    try:
        value = Decimal(os.environ.get(name, ""))
    except (InvalidOperation, ValueError) as exc:
        raise RuntimeError(f"{name} must be a positive decimal") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


def validate_paid_run() -> None:
    if os.environ.get("ASSET_FORGE_PAYMENT_APPROVED") != "1":
        raise RuntimeError("Paid provider execution requires explicit approval")
    if _positive_int("ASSET_RENDERER_MAX_ATTEMPTS") != 1:
        raise RuntimeError("ASSET_RENDERER_MAX_ATTEMPTS must equal 1")
    max_calls = _positive_int("ASSET_FORGE_MAX_PROVIDER_CALLS")
    per_call = _positive_decimal("ASSET_RENDERER_ESTIMATED_USD_PER_CALL")
    max_total = _positive_decimal("ASSET_FORGE_MAX_ESTIMATED_USD")
    if per_call * max_calls > max_total:
        raise RuntimeError("Configured provider-call exposure exceeds the run estimate cap")


def reserve_provider_call() -> None:
    global _used_calls
    validate_paid_run()
    max_calls = _positive_int("ASSET_FORGE_MAX_PROVIDER_CALLS")
    per_call = _positive_decimal("ASSET_RENDERER_ESTIMATED_USD_PER_CALL")
    max_total = _positive_decimal("ASSET_FORGE_MAX_ESTIMATED_USD")
    next_calls = _used_calls + 1
    if next_calls > max_calls or per_call * next_calls > max_total:
        raise RuntimeError("Provider run cap reached before the next request")
    _used_calls = next_calls


def used_calls() -> int:
    return _used_calls
