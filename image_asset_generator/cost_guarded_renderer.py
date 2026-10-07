"""Cost-guarded adapter for provider-backed rendering."""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

from PIL import Image

import paid_request_guard
import provider_renderer

RenderResult = provider_renderer.RenderResult
write_render_metadata = provider_renderer.write_render_metadata


def render_asset(
    entry: Dict[str, Any],
    size: int,
    offline_renderer: Callable[[Dict[str, Any], int], Image.Image],
    *,
    feedback: Optional[str] = None,
) -> RenderResult:
    mode = provider_renderer.renderer_mode()
    provider_required = (
        os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER") == "1"
        or os.environ.get("ASSET_QUALITY_REQUIRE_PROVIDER") == "1"
    )
    provider_configured = provider_renderer.provider_configured()
    if provider_required and (mode == "offline" or not provider_configured):
        raise RuntimeError("Required provider is not configured for a provider-backed run")
    if mode == "offline" or not provider_configured:
        return provider_renderer.render_asset(
            entry, size, offline_renderer, feedback=feedback
        )

    try:
        return provider_renderer.render_with_provider(entry, size, feedback=feedback)
    except paid_request_guard.PaidRequestGuardError:
        raise
    except provider_renderer.ProviderExecutionFailed:
        if mode == "provider" or provider_required:
            raise
        # An offline fallback cannot call render_asset again: that would resubmit.
        width, height = provider_renderer.target_dimensions(entry, size)
        image = provider_renderer._normalize_image(offline_renderer(entry, max(width, height)), width, height, bool(entry.get("alpha")))
        return RenderResult(image, "offline-fallback", 1, {"target_width": width, "target_height": height, "charges_reconciled": False})
