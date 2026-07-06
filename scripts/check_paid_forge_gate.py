#!/usr/bin/env python3
"""Verify paid-request authorization and ceilings without provider calls."""

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

import cost_guarded_renderer  # noqa: E402
import paid_request_guard  # noqa: E402


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


def expect(label: str, error_type, callback) -> None:
    try:
        callback()
    except error_type:
        return
    raise AssertionError(f"{label}: expected {error_type.__name__}")


def main() -> int:
    cleared = {
        "OPENAI_API_KEY": None,
        "ASSET_RENDERER_API_KEY": None,
        "ASSET_RENDERER_ENDPOINT": None,
        "ASSET_FORGE_PAID_RUN_AUTHORIZED": None,
        "ASSET_FORGE_MAX_PROVIDER_CALLS": None,
        "ASSET_FORGE_MAX_UNIT_COST_USD": None,
        "ASSET_FORGE_MAX_COST_USD": None,
        "ASSET_FORGE_RUN_ID": None,
        "ASSET_FORGE_BUDGET_STATE_PATH": None,
        "ASSET_FORGE_REQUIRE_PROVIDER": None,
        "ASSET_QUALITY_REQUIRE_PROVIDER": None,
    }

    with environment(cleared):
        expect(
            "authorization required",
            paid_request_guard.PaidRequestUnauthorized,
            lambda: paid_request_guard.reserve(
                provider="custom",
                model="test",
                asset="test",
                request_size="64x64",
            ),
        )

    with tempfile.TemporaryDirectory() as directory:
        state_path = Path(directory) / "budget.json"
        authorized = {
            **cleared,
            "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1",
            "ASSET_FORGE_MAX_PROVIDER_CALLS": "1",
            "ASSET_FORGE_MAX_UNIT_COST_USD": "0.10",
            "ASSET_FORGE_MAX_COST_USD": "0.10",
            "ASSET_FORGE_RUN_ID": "zero-call-test",
            "ASSET_FORGE_BUDGET_STATE_PATH": str(state_path),
        }
        with environment(authorized):
            first = paid_request_guard.reserve(
                provider="custom",
                model="test",
                asset="test",
                request_size="64x64",
            )
            assert first["callNumber"] == 1
            assert paid_request_guard.snapshot()["providerCallsExecuted"] == 1
            expect(
                "second call blocked",
                paid_request_guard.PaidRequestLimitReached,
                lambda: paid_request_guard.reserve(
                    provider="custom",
                    model="test",
                    asset="second",
                    request_size="64x64",
                ),
            )
            paid_request_guard.record(
                first["attemptId"],
                status="succeeded",
                request_id="test-request-id",
            )
            assert (
                paid_request_guard.snapshot()["attempts"][0]["providerRequestId"]
                == "test-request-id"
            )

            tampered = json.loads(state_path.read_text(encoding="utf-8"))
            tampered["providerCallsExecuted"] = 0
            state_path.write_text(json.dumps(tampered), encoding="utf-8")
            expect(
                "tampered state rejected",
                paid_request_guard.PaidRequestUnauthorized,
                paid_request_guard.snapshot,
            )

    entry = {
        "name": "boundary-test",
        "category": "test",
        "prompt": "mechanical test",
        "aspect_ratio": "1:1",
        "alpha": False,
    }
    with environment(
        {
            **cleared,
            "ASSET_RENDERER_MODE": "auto",
            "ASSET_RENDERER_PROVIDER": "custom",
            "ASSET_RENDERER_ENDPOINT": "https://example.invalid/render",
            "ASSET_RENDERER_API_KEY": "configured-placeholder",
        }
    ):
        expect(
            "configured provider cannot bypass authorization through fallback",
            paid_request_guard.PaidRequestUnauthorized,
            lambda: cost_guarded_renderer.render_asset(
                entry,
                64,
                lambda _entry, size: Image.new("RGB", (size, size)),
            ),
        )

    with environment({**cleared, "ASSET_RENDERER_MODE": "offline"}):
        result = cost_guarded_renderer.render_asset(
            entry,
            64,
            lambda _entry, size: Image.new("RGB", (size, size)),
        )
        assert result.renderer == "offline"

    print("paid forge gate checks passed; providerCallsExecuted=0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
