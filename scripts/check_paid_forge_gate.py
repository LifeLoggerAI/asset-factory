#!/usr/bin/env python3
"""Verify paid-forge authorization and cost policy without making provider calls."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "image_asset_generator"
sys.path.insert(0, str(GENERATOR))

import forge_v1_cost_aware as forge  # noqa: E402
import paid_request_guard  # noqa: E402
import provider_renderer  # noqa: E402


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


def expect_exception(label: str, error_type, callback) -> None:
    try:
        callback()
    except error_type:
        return
    raise AssertionError(f"{label}: expected {error_type.__name__}")


def is_inside_repository(target: Path) -> bool:
    try:
        target.resolve().relative_to(ROOT.resolve())
        return True
    except ValueError:
        return False


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
        "ASSET_FORGE_RUN_ID": None,
        "ASSET_FORGE_BUDGET_STATE_PATH": None,
        "ASSET_FORGE_REQUIRE_PROVIDER": None,
        "ASSET_QUALITY_REQUIRE_PROVIDER": None,
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
        expect_exception(
            "authorization required",
            ValueError,
            lambda: forge.build_cost_policy(1),
        )

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
        expect_exception(
            "cost ceiling enforced",
            ValueError,
            lambda: forge.build_cost_policy(1),
        )

    with environment(
        {
            **common,
            "ASSET_RENDERER_MODE": "provider",
            "ASSET_RENDERER_PROVIDER": "custom",
            "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1",
            "ASSET_FORGE_MAX_PROVIDER_CALLS": "1",
            "ASSET_FORGE_MAX_UNIT_COST_USD": "0.10",
            "ASSET_FORGE_MAX_COST_USD": "0.10",
            "ASSET_FORGE_RUN_ID": "default-state-location-check",
        }
    ):
        default_state_path = paid_request_guard._policy()["statePath"]
        assert not is_inside_repository(default_state_path), (
            "default paid budget state must remain outside the repository: "
            f"{default_state_path}"
        )

    with tempfile.TemporaryDirectory() as directory:
        state_file = Path(directory) / "budget.json"
        state_path = str(state_file)
        boundary = {
            **common,
            "ASSET_RENDERER_MODE": "auto",
            "ASSET_RENDERER_PROVIDER": "custom",
            "ASSET_RENDERER_ENDPOINT": "https://example.invalid/render",
            "ASSET_RENDERER_API_KEY": "configured-placeholder",
            "ASSET_FORGE_RUN_ID": "zero-network-boundary-test",
            "ASSET_FORGE_BUDGET_STATE_PATH": state_path,
        }

        with environment(boundary):
            expect_exception(
                "request boundary authorization",
                paid_request_guard.PaidRequestUnauthorized,
                lambda: paid_request_guard.reserve(
                    provider="custom",
                    model="test",
                    asset="test-asset",
                    request_size="64x64",
                ),
            )

            entry = {
                "name": "test-asset",
                "category": "test",
                "prompt": "mechanical test",
                "aspect_ratio": "1:1",
                "alpha": False,
            }
            expect_exception(
                "auto mode must not hide a paid gate behind offline fallback",
                paid_request_guard.PaidRequestUnauthorized,
                lambda: provider_renderer.render_asset(
                    entry,
                    64,
                    lambda _entry, size: Image.new("RGB", (size, size)),
                ),
            )
            assert not state_file.exists(), (
                "unauthorized attempts must not create paid state"
            )

        with environment(
            {
                **boundary,
                "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1",
                "ASSET_FORGE_MAX_PROVIDER_CALLS": "1",
                "ASSET_FORGE_MAX_UNIT_COST_USD": "0.10",
                "ASSET_FORGE_MAX_COST_USD": "0.10",
            }
        ):
            first = paid_request_guard.reserve(
                provider="custom",
                model="test",
                asset="test-asset",
                request_size="64x64",
            )
            assert first["callNumber"] == 1
            snapshot = paid_request_guard.snapshot()
            assert snapshot["providerCallsExecuted"] == 1
            assert snapshot["reservedEstimatedCostUsd"] == "0.10"
            assert snapshot["attempts"][0]["status"] == "reserved"

            expect_exception(
                "second request blocked before network",
                paid_request_guard.PaidRequestLimitReached,
                lambda: paid_request_guard.reserve(
                    provider="custom",
                    model="test",
                    asset="test-asset-2",
                    request_size="64x64",
                ),
            )
            assert paid_request_guard.snapshot()["providerCallsExecuted"] == 1

            paid_request_guard.record(
                first["attemptId"],
                status="succeeded",
                request_id="provider-request-test-1",
            )
            completed = paid_request_guard.snapshot()
            assert completed["attempts"][0]["status"] == "succeeded"
            assert (
                completed["attempts"][0]["providerRequestId"]
                == "provider-request-test-1"
            )
            expect_exception(
                "completed request cannot be recorded twice",
                paid_request_guard.PaidRequestUnauthorized,
                lambda: paid_request_guard.record(
                    first["attemptId"],
                    status="failed",
                    error="duplicate completion",
                ),
            )

            tampered = json.loads(state_file.read_text(encoding="utf-8"))
            tampered["providerCallsExecuted"] = 0
            state_file.write_text(
                json.dumps(tampered, indent=2) + "\n",
                encoding="utf-8",
            )
            expect_exception(
                "tampered budget state fails closed",
                paid_request_guard.PaidRequestUnauthorized,
                paid_request_guard.snapshot,
            )

    print(
        "paid forge request-boundary checks passed; "
        "providerCallsExecuted=0 during unauthorized tests"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
