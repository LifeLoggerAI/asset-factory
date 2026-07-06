#!/usr/bin/env python3
"""Verify paid-forge authorization and cost policy without making provider calls."""

from __future__ import annotations

import os
import sys
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "image_asset_generator"
sys.path.insert(0, str(GENERATOR))

import forge_v1_cost_aware as forge  # noqa: E402


@contextmanager
def environment(values: dict[str, str | None]):
    previous = {key: os.environ.get(key) for key in values}
    try:
        for key, value in values.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def expect_value_error(label: str, callback) -> None:
    try:
        callback()
    except ValueError:
        return
    raise AssertionError(f"{label}: expected ValueError")


def main() -> int:
    common = {
        "OPENAI_API_KEY": None,
        "ASSET_RENDERER_API_KEY": None,
        "ASSET_RENDERER_ENDPOINT": None,
        "ASSET_FORGE_PAID_RUN_AUTHORIZED": None,
        "ASSET_FORGE_MAX_PROVIDER_CALLS": None,
        "ASSET_FORGE_MAX_UNIT_COST_USD": None,
        "ASSET_FORGE_MAX_COST_USD": None,
        "ASSET_RENDERER_MAX_ATTEMPTS": None,
    }

    with environment({**common, "ASSET_RENDERER_MODE": "offline"}):
        policy = forge.build_cost_policy(2)
        assert policy["paidRun"] is False
        assert policy["providerCallsExecuted"] == 0

    with environment(
        {
            **common,
            "ASSET_RENDERER_MODE": "provider",
            "ASSET_RENDERER_PROVIDER": "openai",
        }
    ):
        expect_value_error("authorization required", lambda: forge.build_cost_policy(1))

    with environment(
        {
            **common,
            "ASSET_RENDERER_MODE": "provider",
            "ASSET_RENDERER_PROVIDER": "openai",
            "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1",
            "ASSET_FORGE_MAX_PROVIDER_CALLS": "4",
            "ASSET_FORGE_MAX_UNIT_COST_USD": "0.25",
            "ASSET_FORGE_MAX_COST_USD": "1.00",
            "ASSET_RENDERER_MAX_ATTEMPTS": "1",
        }
    ):
        policy = forge.build_cost_policy(1)
        assert policy["paidRun"] is True
        assert policy["maxProviderCalls"] == 4
        assert policy["maxAttemptsPerOutput"] == 1
        assert policy["declaredMaxCostExposureUsd"] == "1.00"
        assert policy["providerCallsExecuted"] == 0

    with environment(
        {
            **common,
            "ASSET_RENDERER_MODE": "provider",
            "ASSET_RENDERER_PROVIDER": "openai",
            "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1",
            "ASSET_FORGE_MAX_PROVIDER_CALLS": "5",
            "ASSET_FORGE_MAX_UNIT_COST_USD": "0.25",
            "ASSET_FORGE_MAX_COST_USD": "1.00",
        }
    ):
        expect_value_error("cost ceiling enforced", lambda: forge.build_cost_policy(1))

    print("paid forge gate checks passed; providerCallsExecuted=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
