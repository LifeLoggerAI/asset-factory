from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import cost_guard
import guarded_renderer


LIMIT_ENV = {
    "ASSET_RENDERER_EXTERNAL_AUTHORIZED": "1",
    "ASSET_RENDERER_MAX_PROVIDER_CALLS": "2",
    "ASSET_RENDERER_MAX_COST_USD": "0.20",
    "ASSET_RENDERER_MAX_UNIT_COST_USD": "0.10",
}


class CostGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        cost_guard.reset_for_tests()

    def test_missing_authorization_blocks_before_request(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(cost_guard.CostGuardError):
                cost_guard.before_external_request(
                    provider="test",
                    asset_name="asset",
                    size="1024",
                    attempt=1,
                )
        self.assertEqual(cost_guard.snapshot()["requestCount"], 0)

    def test_call_limit_counts_every_attempt(self) -> None:
        with mock.patch.dict(os.environ, LIMIT_ENV, clear=True):
            first = cost_guard.before_external_request(
                provider="test",
                asset_name="asset",
                size="1024",
                attempt=1,
            )
            second = cost_guard.before_external_request(
                provider="test",
                asset_name="asset",
                size="1024",
                attempt=2,
            )
            self.assertEqual(first["requestIndex"], 1)
            self.assertEqual(second["requestIndex"], 2)
            with self.assertRaises(cost_guard.CostGuardError):
                cost_guard.before_external_request(
                    provider="test",
                    asset_name="asset",
                    size="1024",
                    attempt=3,
                )

    def test_cost_limit_blocks_even_when_call_limit_allows(self) -> None:
        env = dict(LIMIT_ENV)
        env["ASSET_RENDERER_MAX_PROVIDER_CALLS"] = "10"
        env["ASSET_RENDERER_MAX_COST_USD"] = "0.15"
        with mock.patch.dict(os.environ, env, clear=True):
            cost_guard.before_external_request(
                provider="test",
                asset_name="one",
                size="1024",
                attempt=1,
            )
            with self.assertRaises(cost_guard.CostGuardError):
                cost_guard.before_external_request(
                    provider="test",
                    asset_name="two",
                    size="1024",
                    attempt=1,
                )

    def test_guarded_renderer_forces_one_adapter_attempt(self) -> None:
        env = dict(LIMIT_ENV)
        env.update(
            {
                "ASSET_RENDERER_MODE": "provider",
                "ASSET_RENDERER_PROVIDER": "custom",
                "ASSET_RENDERER_ENDPOINT": "https://renderer.invalid/generate",
                "ASSET_RENDERER_MAX_ATTEMPTS": "9",
            }
        )
        entry = {
            "name": "sample",
            "category": "test",
            "prompt": "sample",
            "sizes": [64],
            "aspect_ratio": "1:1",
            "alpha": False,
        }
        observed = {}

        def fake_render(*args, **kwargs):
            observed["attempts"] = os.environ.get("ASSET_RENDERER_MAX_ATTEMPTS")
            return guarded_renderer.RenderResult(
                image=Image.new("RGB", (64, 64)),
                renderer="provider",
                attempt=1,
                metadata={"provider_request_id": "test-request"},
            )

        with mock.patch.dict(os.environ, env, clear=True):
            with mock.patch.object(guarded_renderer.base, "render_asset", side_effect=fake_render):
                result = guarded_renderer.render_asset(
                    entry,
                    64,
                    lambda _entry, _size: Image.new("RGB", (64, 64)),
                )
            self.assertEqual(observed["attempts"], "1")
            self.assertEqual(os.environ["ASSET_RENDERER_MAX_ATTEMPTS"], "9")
            self.assertEqual(result.metadata["cost_guard"]["requestIndex"], 1)

    def test_auto_mode_uses_offline_when_limits_are_absent(self) -> None:
        env = {
            "ASSET_RENDERER_MODE": "auto",
            "ASSET_RENDERER_PROVIDER": "custom",
            "ASSET_RENDERER_ENDPOINT": "https://renderer.invalid/generate",
        }
        entry = {
            "name": "sample",
            "category": "test",
            "prompt": "sample",
            "aspect_ratio": "1:1",
            "alpha": False,
        }
        with mock.patch.dict(os.environ, env, clear=True):
            result = guarded_renderer.render_asset(
                entry,
                64,
                lambda _entry, _size: Image.new("RGB", (64, 64)),
            )
        self.assertEqual(result.renderer, "offline-cost-guard")
        self.assertTrue(result.metadata["external_renderer_blocked"])
        self.assertEqual(cost_guard.snapshot()["requestCount"], 0)


if __name__ == "__main__":
    unittest.main()
