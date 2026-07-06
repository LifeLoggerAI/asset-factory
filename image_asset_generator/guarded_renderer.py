"""Guarded entry point for every Asset Factory renderer invocation.

The wrapper forces the underlying adapter to one network attempt. Outer quality
rounds remain possible, but each round must pass the shared process-local cost guard.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional

from PIL import Image

import cost_guard
import provider_renderer as base

RenderResult = base.RenderResult


def render_asset(
    entry: Dict[str, Any],
    size: int,
    offline_renderer: Callable[[Dict[str, Any], int], Image.Image],
    *,
    feedback: Optional[str] = None,
) -> RenderResult:
    mode = base.renderer_mode()
    configured = base.provider_configured()

    if mode == "offline" or not configured:
        return base.render_asset(entry, size, offline_renderer, feedback=feedback)

    try:
        guard_event = cost_guard.before_external_request(
            provider=base.provider_name(),
            asset_name=str(entry.get("name", "unknown")),
            size=str(size),
            attempt=1,
        )
    except cost_guard.CostGuardError:
        if mode == "provider":
            raise
        width, height = base.target_dimensions(entry, size)
        image = base._normalize_image(
            offline_renderer(entry, max(width, height)),
            width,
            height,
            bool(entry.get("alpha")),
        )
        return RenderResult(
            image=image,
            renderer="offline-cost-guard",
            attempt=1,
            metadata={
                "target_width": width,
                "target_height": height,
                "external_renderer_blocked": True,
            },
        )

    previous_attempts = os.environ.get("ASSET_RENDERER_MAX_ATTEMPTS")
    os.environ["ASSET_RENDERER_MAX_ATTEMPTS"] = "1"
    try:
        result = base.render_asset(entry, size, offline_renderer, feedback=feedback)
    finally:
        if previous_attempts is None:
            os.environ.pop("ASSET_RENDERER_MAX_ATTEMPTS", None)
        else:
            os.environ["ASSET_RENDERER_MAX_ATTEMPTS"] = previous_attempts

    metadata = dict(result.metadata)
    metadata["cost_guard"] = guard_event
    return RenderResult(
        image=result.image,
        renderer=result.renderer,
        attempt=result.attempt,
        metadata=metadata,
    )


def write_render_metadata(output_path, entry, result: RenderResult) -> None:
    base.write_render_metadata(output_path, entry, result)
