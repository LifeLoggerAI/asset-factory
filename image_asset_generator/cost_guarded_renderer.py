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
    if mode == "offline" or not provider_renderer.provider_configured():
        if provider_required and mode != "offline":
            raise RuntimeError("Required provider is not configured")
        return provider_renderer.render_asset(
            entry, size, offline_renderer, feedback=feedback
        )

    width, height = provider_renderer.target_dimensions(entry, size)
    reservation = paid_request_guard.reserve(
        provider=provider_renderer.provider_name(),
        model=os.environ.get("ASSET_RENDERER_MODEL") or None,
        asset=str(entry.get("name", "unknown")),
        request_size=f"{width}x{height}",
    )
    reservation_id = str(reservation["attemptId"])
    previous_attempts = os.environ.get("ASSET_RENDERER_MAX_ATTEMPTS")
    os.environ["ASSET_RENDERER_MAX_ATTEMPTS"] = "1"
    try:
        result = provider_renderer.render_with_provider(
            entry, size, feedback=feedback
        )
        request_id = result.metadata.get("provider_request_id")
        paid_request_guard.record(
            reservation_id,
            status="succeeded",
            request_id=str(request_id) if request_id else None,
        )
        metadata = dict(result.metadata)
        metadata["budget_attempt_id"] = reservation_id
        return RenderResult(
            result.image, result.renderer, result.attempt, metadata
        )
    except Exception as exc:
        paid_request_guard.record(
            reservation_id, status="failed", error=str(exc)
        )
        if mode == "provider" or provider_required:
            raise
        return provider_renderer.render_asset(
            entry, size, offline_renderer, feedback=feedback
        )
    finally:
        if previous_attempts is None:
            os.environ.pop("ASSET_RENDERER_MAX_ATTEMPTS", None)
        else:
            os.environ["ASSET_RENDERER_MAX_ATTEMPTS"] = previous_attempts
