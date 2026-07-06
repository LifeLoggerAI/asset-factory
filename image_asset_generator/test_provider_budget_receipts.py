from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import paid_request_guard
import provider_renderer


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


class FakeResponse:
    def __init__(self, body: bytes, *, content_type: str = "application/json", request_id: str = "request-test"):
        self._body = body
        self.headers = {
            "content-type": content_type,
            "x-request-id": request_id,
        }

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self) -> bytes:
        return self._body


ENTRY = {
    "name": "receipt-integrity-test",
    "category": "test",
    "prompt": "mechanical provider receipt test",
    "prompt_version": "test-v1",
    "aspect_ratio": "1:1",
    "alpha": False,
    "quality": "high",
}


class ProviderBudgetReceiptTests(unittest.TestCase):
    def common_environment(self, state_path: Path) -> dict[str, str | None]:
        return {
            "ASSET_RENDERER_MODE": "provider",
            "ASSET_FORGE_REQUIRE_PROVIDER": "1",
            "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1",
            "ASSET_FORGE_MAX_PROVIDER_CALLS": "2",
            "ASSET_FORGE_MAX_UNIT_COST_USD": "0.10",
            "ASSET_FORGE_MAX_COST_USD": "0.20",
            "ASSET_FORGE_RUN_ID": "provider-budget-receipt-test",
            "ASSET_FORGE_BUDGET_STATE_PATH": str(state_path),
            "ASSET_RENDERER_MAX_ATTEMPTS": "3",
            "ASSET_RENDERER_TIMEOUT_SEC": "1",
            "ASSET_RENDERER_API_KEY": "configured-test-key",
            "OPENAI_API_KEY": None,
        }

    def test_custom_malformed_successes_consume_budget_and_record_failures(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "custom-budget.json"
            values = {
                **self.common_environment(state_path),
                "ASSET_RENDERER_PROVIDER": "custom",
                "ASSET_RENDERER_ENDPOINT": "https://provider.invalid/render",
            }
            fake = mock.Mock(return_value=FakeResponse(b"{}"))
            with environment(values), mock.patch.object(provider_renderer.urllib.request, "urlopen", fake), mock.patch.object(provider_renderer.time, "sleep"):
                with self.assertRaises(paid_request_guard.PaidRequestLimitReached):
                    provider_renderer.render_with_provider(ENTRY, 64)

            self.assertEqual(fake.call_count, 2, "third retry must be blocked before network access")
            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(state["providerCallsExecuted"], 2)
            self.assertEqual(state["reservedEstimatedCostUsd"], "0.20")
            self.assertEqual([attempt["status"] for attempt in state["attempts"]], ["failed", "failed"])
            self.assertTrue(all("image bytes" in attempt.get("error", "") for attempt in state["attempts"]))

    def test_openai_malformed_200_is_not_recorded_as_success(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            state_path = Path(directory) / "openai-budget.json"
            values = {
                **self.common_environment(state_path),
                "ASSET_RENDERER_PROVIDER": "openai",
                "ASSET_RENDERER_ENDPOINT": "https://api.openai.invalid/v1/images/generations",
                "OPENAI_API_KEY": "configured-test-key",
                "ASSET_FORGE_MAX_PROVIDER_CALLS": "1",
                "ASSET_FORGE_MAX_COST_USD": "0.10",
                "ASSET_RENDERER_MAX_ATTEMPTS": "1",
            }
            fake = mock.Mock(return_value=FakeResponse(b"{}", request_id="openai-request-test"))
            with environment(values), mock.patch.object(provider_renderer.urllib.request, "urlopen", fake), mock.patch.object(provider_renderer.time, "sleep"):
                with self.assertRaises(RuntimeError):
                    provider_renderer.render_with_provider(ENTRY, 64)

            self.assertEqual(fake.call_count, 1)
            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(state["providerCallsExecuted"], 1)
            self.assertEqual(state["attempts"][0]["status"], "failed")
            self.assertNotIn("providerRequestId", state["attempts"][0])
            self.assertIn("image bytes", state["attempts"][0].get("error", ""))


if __name__ == "__main__":
    unittest.main()
