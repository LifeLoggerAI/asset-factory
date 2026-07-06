"""Provider-backed image renderer for the URAI Asset Factory.

Supported providers:
- ``openai``: direct OpenAI Image API integration using ``OPENAI_API_KEY``.
- ``custom``: provider-neutral HTTPS JSON endpoint.
- ``offline`` mode remains available only for CI and local mechanical proof.

Desktop and mobile entries declare ``aspect_ratio``; ``sizes`` represents the longest
final edge. Provider output is safely cropped and resized into the canonical target.
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
from typing import Any, Callable, Dict, Optional, Tuple

from PIL import Image, ImageOps

import paid_request_guard


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


def provider_name() -> str:
    return os.environ.get("ASSET_RENDERER_PROVIDER", "custom").strip().lower() or "custom"


def provider_configured() -> bool:
    provider = provider_name()
    if provider == "openai":
        return bool(os.environ.get("OPENAI_API_KEY", "").strip() or os.environ.get("ASSET_RENDERER_API_KEY", "").strip())
    return bool(os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip())


def renderer_mode() -> str:
    mode = os.environ.get("ASSET_RENDERER_MODE", "auto").strip().lower()
    if mode not in {"auto", "provider", "offline"}:
        raise ValueError(f"Unsupported ASSET_RENDERER_MODE={mode!r}")
    return mode


def target_dimensions(entry: Dict[str, Any], size: int) -> Tuple[int, int]:
    ratio_value = str(entry.get("aspect_ratio", "1:1")).strip()
    try:
        left, right = ratio_value.split(":", 1)
        ratio = float(left) / float(right)
        if ratio <= 0:
            raise ValueError
    except (ValueError, ZeroDivisionError):
        ratio = 1.0

    if ratio >= 1:
        width = size
        height = max(1, round(size / ratio))
    else:
        height = size
        width = max(1, round(size * ratio))
    return width, height


def _request_headers() -> Dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json,image/*",
        "User-Agent": "urai-asset-factory/1.1",
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
                req = urllib.request.Request(value, headers={"User-Agent": "urai-asset-factory/1.1"})
                with urllib.request.urlopen(req, timeout=timeout) as response:
                    return response.read()

    raise ValueError("Renderer response did not contain image bytes or an image URL")


def _normalize_image(raw: bytes | Image.Image, width: int, height: int, alpha: bool) -> Image.Image:
    if isinstance(raw, Image.Image):
        image = raw.copy()
    else:
        image = Image.open(io.BytesIO(raw))
        image.load()
    image = image.convert("RGBA" if alpha else "RGB")
    if image.size != (width, height):
        image = ImageOps.fit(image, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    return image


def _openai_request_size(width: int, height: int) -> str:
    ratio = width / max(1, height)
    if ratio > 1.2:
        return "1536x1024"
    if ratio < 0.83:
        return "1024x1536"
    return "1024x1024"


def _render_openai(entry: Dict[str, Any], size: int, feedback: Optional[str]) -> RenderResult:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip() or os.environ.get("ASSET_RENDERER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for the OpenAI image provider")

    width, height = target_dimensions(entry, size)
    alpha = bool(entry.get("alpha"))
    model = (
        os.environ.get("ASSET_RENDERER_ALPHA_MODEL", "").strip() if alpha else ""
    ) or os.environ.get("ASSET_RENDERER_MODEL", "").strip() or ("gpt-image-1.5" if alpha else "gpt-image-2")
    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip() or "https://api.openai.com/v1/images/generations"
    timeout = _env_int("ASSET_RENDERER_TIMEOUT_SEC", 240)
    max_attempts = _env_int("ASSET_RENDERER_MAX_ATTEMPTS", 3)

    prompt = entry["prompt"]
    if feedback:
        prompt = f"{prompt}\n\nUpgrade requirements: {feedback}"

    request_payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": _openai_request_size(width, height),
        "quality": entry.get("quality", "high"),
        "output_format": "png",
        "background": "transparent" if alpha else "opaque",
    }
    body = json.dumps(request_payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "urai-asset-factory/1.1",
    }

    last_error: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        budget_attempt = paid_request_guard.reserve(
            provider="openai",
            model=model,
            asset=str(entry.get("name", "unknown")),
            request_size=str(request_payload["size"]),
        )
        budget_attempt_id = str(budget_attempt["attemptId"])
        try:
            req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as response:
                response_body = response.read()
                request_id = response.headers.get("x-request-id")
            payload = json.loads(response_body.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("OpenAI image response must be a JSON object")
            raw = _extract_image_bytes(payload, timeout)
            image = _normalize_image(raw, width, height, alpha)
            paid_request_guard.record(
                budget_attempt_id,
                status="succeeded",
                request_id=request_id,
            )
            return RenderResult(
                image=image,
                renderer="provider",
                attempt=attempt,
                metadata={
                    "provider": "openai",
                    "provider_request_id": request_id,
                    "provider_model": model,
                    "provider_size": request_payload["size"],
                    "target_width": width,
                    "target_height": height,
                    "budget_attempt_id": budget_attempt_id,
                },
            )
        except paid_request_guard.PaidRequestGuardError:
            raise
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:1200]
            last_error = RuntimeError(f"OpenAI HTTP {exc.code}: {detail}")
            paid_request_guard.record(
                budget_attempt_id,
                status="failed",
                error=str(last_error),
            )
            if exc.code not in {408, 409, 429} and exc.code < 500:
                break
        except Exception as exc:
            last_error = exc
            paid_request_guard.record(
                budget_attempt_id,
                status="failed",
                error=str(exc),
            )
        if attempt < max_attempts:
            time.sleep(min(30, 2 ** attempt))

    raise RuntimeError(f"OpenAI rendering failed after {max_attempts} attempt(s): {last_error}")


def _render_custom(entry: Dict[str, Any], size: int, feedback: Optional[str]) -> RenderResult:
    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip()
    if not endpoint:
        raise RuntimeError("ASSET_RENDERER_ENDPOINT is required for custom provider rendering")
    if not endpoint.startswith("https://") and os.environ.get("ASSET_RENDERER_ALLOW_HTTP") != "1":
        raise RuntimeError("ASSET_RENDERER_ENDPOINT must use HTTPS unless ASSET_RENDERER_ALLOW_HTTP=1")

    width, height = target_dimensions(entry, size)
    timeout = _env_int("ASSET_RENDERER_TIMEOUT_SEC", 180)
    max_attempts = _env_int("ASSET_RENDERER_MAX_ATTEMPTS", 3)
    model = os.environ.get("ASSET_RENDERER_MODEL", "").strip() or None
    prompt_version = entry.get("prompt_version", "v1")
    request_payload: Dict[str, Any] = {
        "request_id": f"{entry['name']}:{width}x{height}:{prompt_version}",
        "name": entry["name"],
        "category": entry["category"],
        "prompt": entry["prompt"],
        "prompt_version": prompt_version,
        "width": width,
        "height": height,
        "size": f"{width}x{height}",
        "aspect_ratio": entry.get("aspect_ratio", "1:1"),
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
        budget_attempt = paid_request_guard.reserve(
            provider="custom",
            model=model,
            asset=str(entry.get("name", "unknown")),
            request_size=str(request_payload["size"]),
        )
        budget_attempt_id = str(budget_attempt["attemptId"])
        try:
            req = urllib.request.Request(endpoint, data=body, headers=_request_headers(), method="POST")
            with urllib.request.urlopen(req, timeout=timeout) as response:
                response_body = response.read()
                content_type = response.headers.get("content-type", "")
                response_request_id = response.headers.get("x-request-id")

            if content_type.startswith("image/"):
                raw = response_body
                metadata: Dict[str, Any] = {
                    "content_type": content_type,
                    "provider_request_id": response_request_id,
                }
            else:
                payload = json.loads(response_body.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("Renderer response JSON must be an object")
                raw = _extract_image_bytes(payload, timeout)
                response_request_id = str(payload.get("id") or payload.get("request_id") or response_request_id or "") or None
                metadata = {
                    "provider": "custom",
                    "provider_request_id": response_request_id,
                    "provider_model": payload.get("model") or model,
                }

            image = _normalize_image(raw, width, height, bool(entry.get("alpha")))
            paid_request_guard.record(
                budget_attempt_id,
                status="succeeded",
                request_id=response_request_id,
            )
            metadata.update(
                {
                    "target_width": width,
                    "target_height": height,
                    "budget_attempt_id": budget_attempt_id,
                }
            )
            return RenderResult(image=image, renderer="provider", attempt=attempt, metadata=metadata)
        except paid_request_guard.PaidRequestGuardError:
            raise
        except Exception as exc:
            last_error = exc
            paid_request_guard.record(
                budget_attempt_id,
                status="failed",
                error=str(exc),
            )
            if attempt < max_attempts:
                time.sleep(min(20, 2 ** attempt))

    raise RuntimeError(f"Custom provider rendering failed after {max_attempts} attempts: {last_error}")


def render_with_provider(entry: Dict[str, Any], size: int, *, feedback: Optional[str] = None) -> RenderResult:
    provider = provider_name()
    if provider == "openai":
        return _render_openai(entry, size, feedback)
    if provider == "custom":
        return _render_custom(entry, size, feedback)
    raise RuntimeError(f"Unsupported ASSET_RENDERER_PROVIDER={provider!r}")


def render_asset(
    entry: Dict[str, Any],
    size: int,
    offline_renderer: Callable[[Dict[str, Any], int], Image.Image],
    *,
    feedback: Optional[str] = None,
) -> RenderResult:
    mode = renderer_mode()
    width, height = target_dimensions(entry, size)
    require_provider = (
        os.environ.get("ASSET_FORGE_REQUIRE_PROVIDER", "0") == "1"
        or os.environ.get("ASSET_QUALITY_REQUIRE_PROVIDER", "0") == "1"
    )

    if mode == "offline":
        image = _normalize_image(offline_renderer(entry, max(width, height)), width, height, bool(entry.get("alpha")))
        return RenderResult(image, "offline", 1, {"target_width": width, "target_height": height})

    if provider_configured():
        try:
            return render_with_provider(entry, size, feedback=feedback)
        except paid_request_guard.PaidRequestGuardError:
            raise
        except Exception:
            if mode == "provider" or require_provider:
                raise

    if mode == "provider" or require_provider:
        raise RuntimeError(f"Provider rendering is required but {provider_name()} is not configured or failed")

    image = _normalize_image(offline_renderer(entry, max(width, height)), width, height, bool(entry.get("alpha")))
    return RenderResult(image, "offline-fallback", 1, {"target_width": width, "target_height": height})


def write_render_metadata(output_path: Path, entry: Dict[str, Any], result: RenderResult) -> None:
    metadata_path = output_path.with_suffix(output_path.suffix + ".render.json")
    metadata_path.write_text(
        json.dumps(
            {
                "name": entry["name"],
                "category": entry["category"],
                "prompt_version": entry.get("prompt_version", "v1"),
                "aspect_ratio": entry.get("aspect_ratio", "1:1"),
                "renderer": result.renderer,
                "attempt": result.attempt,
                "metadata": result.metadata,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
