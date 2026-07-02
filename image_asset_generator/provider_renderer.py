"""Provider-backed image renderer for the URAI Asset Factory.

The adapter is intentionally provider-neutral. Configure an HTTPS endpoint that accepts
JSON and returns either base64 image bytes or a temporary image URL. This keeps the
manifest, Jobs worker, Studio, and Spatial handoff stable when providers change.

Environment:
  ASSET_RENDERER_MODE=auto|provider|offline
  ASSET_RENDERER_ENDPOINT=https://...
  ASSET_RENDERER_API_KEY=...
  ASSET_RENDERER_AUTH_HEADER=Authorization
  ASSET_RENDERER_AUTH_SCHEME=Bearer
  ASSET_RENDERER_TIMEOUT_SEC=180
  ASSET_RENDERER_MAX_ATTEMPTS=3
  ASSET_RENDERER_MODEL=<optional provider model>

Accepted response shapes:
  {"image_base64": "..."}
  {"b64_json": "..."}
  {"data": [{"b64_json": "..."}]}
  {"image_url": "https://..."}
  {"url": "https://..."}
  {"data": [{"url": "https://..."}]}
"""

from __future__ import annotations

import base64
import io
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from PIL import Image


@dataclass(frozen=True)
class RenderResult:
    image: Image.Image
    renderer: str
    attempt: int
    metadata: Dict[str, Any]


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def provider_configured() -> bool:
    return bool(os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip())


def renderer_mode() -> str:
    mode = os.environ.get("ASSET_RENDERER_MODE", "auto").strip().lower()
    if mode not in {"auto", "provider", "offline"}:
        raise ValueError(f"Unsupported ASSET_RENDERER_MODE={mode!r}")
    return mode


def _request_headers() -> Dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "urai-asset-factory/1.0",
    }
    api_key = os.environ.get("ASSET_RENDERER_API_KEY", "").strip()
    if api_key:
        header = os.environ.get("ASSET_RENDERER_AUTH_HEADER", "Authorization").strip()
        scheme = os.environ.get("ASSET_RENDERER_AUTH_SCHEME", "Bearer").strip()
        headers[header] = f"{scheme} {api_key}".strip()
    return headers


def _extract_image_bytes(payload: Dict[str, Any], timeout: int) -> bytes:
    candidates = [payload]
    data = payload.get("data")
    if isinstance(data, list):
        candidates.extend(item for item in data if isinstance(item, dict))
    elif isinstance(data, dict):
        candidates.append(data)

    for item in candidates:
        for key in ("image_base64", "b64_json", "base64"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return base64.b64decode(value)

    for item in candidates:
        for key in ("image_url", "url"):
            value = item.get(key)
            if isinstance(value, str) and value.startswith(("https://", "http://")):
                req = urllib.request.Request(value, headers={"User-Agent": "urai-asset-factory/1.0"})
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    return response.read()

    raise ValueError("Renderer response did not contain image bytes or an image URL")


def _normalize_image(raw: bytes, size: int, alpha: bool) -> Image.Image:
    image = Image.open(io.BytesIO(raw))
    image.load()
    image = image.convert("RGBA" if alpha else "RGB")
    if image.size != (size, size):
        image = image.resize((size, size), Image.Resampling.LANCZOS)
    return image


def render_with_provider(entry: Dict[str, Any], size: int, *, feedback: Optional[str] = None) -> RenderResult:
    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip()
    if not endpoint:
        raise RuntimeError("ASSET_RENDERER_ENDPOINT is required for provider rendering")
    if not endpoint.startswith("https://") and os.environ.get("ASSET_RENDERER_ALLOW_HTTP") != "1":
        raise RuntimeError("ASSET_RENDERER_ENDPOINT must use HTTPS unless ASSET_RENDERER_ALLOW_HTTP=1")

    timeout = _env_int("ASSET_RENDERER_TIMEOUT_SEC", 180)
    max_attempts = _env_int("ASSET_RENDERER_MAX_ATTEMPTS", 3)
    model = os.environ.get("ASSET_RENDERER_MODEL", "").strip() or None
    prompt_version = entry.get("prompt_version", "v1")

    request_payload: Dict[str, Any] = {
        "request_id": f"{entry['name']}:{size}:{prompt_version}",
        "name": entry["name"],
        "category": entry["category"],
        "prompt": entry["prompt"],
        "prompt_version": prompt_version,
        "width": size,
        "height": size,
        "size": f"{size}x{size}",
        "alpha": bool(entry.get("alpha")),
        "output_format": "png",
        "quality": entry.get("quality", "high"),
        "tags": entry.get("tags", []),
    }
    if model:
        request_payload["model"] = model
    if feedback:
        request_payload["upgrade_feedback"] = feedback

    body = json.dumps(request_payload).encode("utf-8")
    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            req = urllib.request.Request(endpoint, data=body, headers=_request_headers(), method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as response:
                response_body = response.read()
                content_type = response.headers.get("content-type", "")

            if content_type.startswith("image/"):
                raw = response_body
                metadata: Dict[str, Any] = {"content_type": content_type}
            else:
                payload = json.loads(response_body.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("Renderer response JSON must be an object")
                raw = _extract_image_bytes(payload, timeout)
                metadata = {
                    "provider_request_id": payload.get("id") or payload.get("request_id"),
                    "provider_model": payload.get("model") or model,
                }

            image = _normalize_image(raw, size, bool(entry.get("alpha")))
            return RenderResult(image=image, renderer="provider", attempt=attempt, metadata=metadata)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < max_attempts:
                time.sleep(min(20, 2 ** attempt))

    raise RuntimeError(f"Provider rendering failed after {max_attempts} attempts: {last_error}")


def render_asset(
    entry: Dict[str, Any],
    size: int,
    offline_renderer: Callable[[Dict[str, Any], int], Image.Image],
    *,
    feedback: Optional[str] = None,
) -> RenderResult:
    mode = renderer_mode()
    if mode == "offline":
        return RenderResult(offline_renderer(entry, size), "offline", 1, {})

    if provider_configured():
        try:
            return render_with_provider(entry, size, feedback=feedback)
        except Exception:
            if mode == "provider":
                raise

    if mode == "provider":
        raise RuntimeError("Provider mode requested but no provider endpoint is configured")
    return RenderResult(offline_renderer(entry, size), "offline-fallback", 1, {})


def write_render_metadata(output_path: Path, entry: Dict[str, Any], result: RenderResult) -> None:
    metadata_path = output_path.with_suffix(output_path.suffix + ".render.json")
    metadata_path.write_text(
        json.dumps(
            {
                "name": entry["name"],
                "category": entry["category"],
                "prompt_version": entry.get("prompt_version", "v1"),
                "renderer": result.renderer,
                "attempt": result.attempt,
                "metadata": result.metadata,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
