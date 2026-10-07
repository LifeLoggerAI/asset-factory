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
import http.client
import ipaddress
import os
import socket
import ssl
import time
import urllib.error
import urllib.request
import urllib.parse
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


def _public_artifact_address(value: str) -> bool:
    address = ipaddress.ip_address(value)
    return address.is_global and not (address.is_multicast or address.is_reserved or address.is_unspecified) and getattr(address, "ipv4_mapped", None) is None and getattr(address, "sixtofour", None) is None and getattr(address, "teredo", None) is None


def _retrieve_artifact(value: str, timeout: int, reservation: Dict[str, Any] | None) -> bytes:
    if not reservation:
        raise paid_request_guard.PaidRequestUnauthorized("artifact read requires active protected admission")
    parsed = urllib.parse.urlsplit(value)
    hosts = reservation["envelope"]["job"]["executor"].get("artifact_hosts")
    if parsed.scheme != "https" or parsed.port not in {None, 443} or parsed.username or parsed.password or parsed.fragment or not isinstance(hosts, list) or parsed.hostname not in hosts:
        raise paid_request_guard.PaidRequestUnauthorized("artifact origin differs from admitted HTTPS hosts")
    paid_request_guard.check_admission(reservation)
    addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    paid_request_guard.check_admission(reservation)
    if not addresses or any(not _public_artifact_address(row[4][0]) for row in addresses):
        raise paid_request_guard.PaidRequestUnauthorized("artifact DNS contains a nonpublic address")
    family, socktype, protocol, _, address = addresses[0]
    connection = http.client.HTTPSConnection(parsed.hostname, timeout=min(timeout, paid_request_guard.remaining_seconds(reservation)), context=ssl.create_default_context())
    def connect_numeric(_, socket_timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
        paid_request_guard.check_admission(reservation)
        sock = socket.socket(family, socktype, protocol)
        try:
            sock.settimeout(socket_timeout)
            sock.connect(address)  # Numeric sockaddr; never resolves the host again.
            return sock
        except Exception:
            sock.close()
            raise
    # HTTPSConnection preserves the original TLS SNI/certificate and Host header.
    connection._create_connection = connect_numeric
    try:
        paid_request_guard.check_admission(reservation)
        connection.request("GET", urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, "")), headers={"User-Agent": "urai-protected-artifact/1"})
        response = connection.getresponse()
        paid_request_guard.check_admission(reservation)
        if response.status != 200:
            raise paid_request_guard.PaidRequestUnauthorized("artifact must return HTTP 200 without redirects")
        declared = response.getheader("Content-Length")
        if declared is not None and (not declared.isdigit() or int(declared) > 67108864):
            raise ValueError("bounded artifact declared size exceeds 64 MiB")
        raw = response.read(67108865)
        paid_request_guard.check_admission(reservation)
        if not raw or len(raw) > 67108864:
            raise ValueError("bounded artifact response is empty or exceeds 64 MiB")
        return raw
    finally:
        connection.close()


def _extract_image_bytes(payload: Dict[str, Any], timeout: int, reservation: Dict[str, Any] | None = None) -> bytes:
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
            if isinstance(value, str) and value.startswith("https://"):
                return _retrieve_artifact(value, timeout, reservation)

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


class ProviderExecutionFailed(RuntimeError):
    def __init__(self, reservation):
        super().__init__("Provider execution failed or is uncertain; trusted charge reconciliation is required")
        self.reservation = reservation


def _execute_once(endpoint, body, headers, provider, model, entry, width, height, timeout, consume):
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise paid_request_guard.PaidRequestUnauthorized("paid provider endpoint must use HTTPS")
    # Materialize one Request before admission; environment changes cannot replace its credentials.
    credential_names = {"authorization", "xi-api-key", "x-api-key", "x-goog-api-key"}
    if provider == "custom":
        credential_names.add(os.environ.get("ASSET_RENDERER_AUTH_HEADER", "Authorization").strip().lower())
    fingerprint = paid_request_guard.request_header_bindings(headers, credential_names)
    request = urllib.request.Request(endpoint, data=bytes(body), headers={name:value.strip() for name,value in headers.items()}, method="POST")
    if paid_request_guard.request_header_bindings(dict(request.header_items()), credential_names) != fingerprint:
        raise paid_request_guard.PaidRequestUnauthorized("effective provider headers changed during request construction")
    source_input = {"entry": entry, "target_width": width, "target_height": height, "request_sha256": paid_request_guard.request_digest(endpoint, request.data)}
    source_digest = paid_request_guard.source_input_digest(source_input)
    reservation = paid_request_guard.reserve(
        provider=provider, model=model, asset=str(entry["name"]),
        request_size=f"{width}x{height}", endpoint=endpoint,
        request_sha256=paid_request_guard.request_digest(endpoint, request.data),
        source_input_sha256=source_digest,
        semantic_input_sha256=paid_request_guard.source_input_digest(json.loads(request.data, object_pairs_hook=paid_request_guard.unique_object)), **fingerprint,
    )
    try:
        with paid_request_guard.runtime_limit(reservation):
            if paid_request_guard.source_input_digest(source_input) != source_digest or paid_request_guard.request_header_bindings(dict(request.header_items()), credential_names) != fingerprint:
                raise paid_request_guard.PaidRequestUnauthorized("admitted image input or credentials changed before dispatch")
            # Exactly one submission. Redirects and network failures cannot resubmit it.
            opener = urllib.request.build_opener(paid_request_guard._NoRedirect)
            paid_request_guard.check_admission(reservation)
            with opener.open(request, timeout=min(timeout, paid_request_guard.remaining_seconds(reservation))) as response:
                response_body = response.read(67108865)
                paid_request_guard.check_admission(reservation)
                if len(response_body) > 67108864:
                    raise ValueError("bounded provider response exceeded 64 MiB")
                result = consume(response_body, response.headers, reservation)
                paid_request_guard.check_admission(reservation)
                if paid_request_guard.source_input_digest(source_input) != source_digest:
                    raise paid_request_guard.PaidRequestUnauthorized("admitted image input changed during output")
        request_id = result.metadata.get("provider_request_id")
        paid_request_guard.record(reservation["attemptId"], status="succeeded", request_id=str(request_id) if request_id else None)
        paid_request_guard.check_admission(reservation)
        metadata = {**result.metadata, "budget_attempt_id": reservation["attemptId"], "charges_reconciled": False}
        return RenderResult(result.image, result.renderer, 1, metadata)
    except Exception as exc:
        try:
            paid_request_guard.record(reservation["attemptId"], status="failed")
        except paid_request_guard.PaidRequestGuardError:
            pass  # The durable RESERVED/RECONCILIATION_REQUIRED row remains held.
        raise ProviderExecutionFailed(reservation) from exc


def _render_openai(entry: Dict[str, Any], size: int, feedback: Optional[str]) -> RenderResult:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip() or os.environ.get("ASSET_RENDERER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for the OpenAI image provider")
    width, height = target_dimensions(entry, size)
    alpha = bool(entry.get("alpha"))
    model = (os.environ.get("ASSET_RENDERER_ALPHA_MODEL", "").strip() if alpha else "") or os.environ.get("ASSET_RENDERER_MODEL", "").strip() or ("gpt-image-1.5" if alpha else "gpt-image-2")
    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip() or "https://api.openai.com/v1/images/generations"
    prompt = entry["prompt"] + (f"\n\nUpgrade requirements: {feedback}" if feedback else "")
    request_payload = {"model": model, "prompt": prompt, "n": 1, "size": _openai_request_size(width, height), "quality": entry.get("quality", "high"), "output_format": "png", "background": "transparent" if alpha else "opaque"}
    body = json.dumps(request_payload).encode("utf-8")
    timeout = _env_int("ASSET_RENDERER_TIMEOUT_SEC", 240)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "urai-asset-factory/1.1"}
    def consume(response_body, response_headers, reservation):
        payload = json.loads(response_body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("OpenAI image response must be a JSON object")
        raw = _extract_image_bytes(payload, timeout, reservation)
        image = _normalize_image(raw, width, height, alpha)
        return RenderResult(image, "provider", 1, {"provider": "openai", "provider_request_id": response_headers.get("x-request-id"), "provider_model": model, "provider_size": request_payload["size"], "target_width": width, "target_height": height})
    return _execute_once(endpoint, body, headers, "openai", model, entry, width, height, timeout, consume)


def _render_custom(entry: Dict[str, Any], size: int, feedback: Optional[str]) -> RenderResult:
    endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").strip()
    width, height = target_dimensions(entry, size)
    timeout = _env_int("ASSET_RENDERER_TIMEOUT_SEC", 180)
    model = os.environ.get("ASSET_RENDERER_MODEL", "").strip()
    prompt_version = entry.get("prompt_version", "v1")
    request_payload = {"request_id": f"{entry['name']}:{width}x{height}:{prompt_version}", "name": entry["name"], "category": entry["category"], "prompt": entry["prompt"], "prompt_version": prompt_version, "width": width, "height": height, "size": f"{width}x{height}", "aspect_ratio": entry.get("aspect_ratio", "1:1"), "alpha": bool(entry.get("alpha")), "output_format": "png", "quality": entry.get("quality", "high"), "tags": entry.get("tags", []), "model": model}
    if feedback:
        request_payload["upgrade_feedback"] = feedback
    body = json.dumps(request_payload).encode("utf-8")
    def consume(response_body, response_headers, reservation):
        content_type = response_headers.get("content-type", "")
        if content_type.startswith("image/"):
            raw = response_body
            metadata = {"provider": "custom", "content_type": content_type, "provider_request_id": response_headers.get("x-request-id"), "provider_model": model}
        else:
            payload = json.loads(response_body.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Renderer response JSON must be an object")
            raw = _extract_image_bytes(payload, timeout, reservation)
            metadata = {"provider": "custom", "provider_request_id": payload.get("id") or payload.get("request_id"), "provider_model": payload.get("model") or model}
        image = _normalize_image(raw, width, height, bool(entry.get("alpha")))
        metadata.update({"target_width": width, "target_height": height})
        return RenderResult(image, "provider", 1, metadata)
    return _execute_once(endpoint, body, _request_headers(), "custom", model, entry, width, height, timeout, consume)


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

    if mode == "offline":
        image = _normalize_image(offline_renderer(entry, max(width, height)), width, height, bool(entry.get("alpha")))
        return RenderResult(image, "offline", 1, {"target_width": width, "target_height": height})

    if provider_configured():
        try:
            return render_with_provider(entry, size, feedback=feedback)
        except paid_request_guard.PaidRequestGuardError:
            raise
        except Exception:
            if mode == "provider":
                raise

    if mode == "provider":
        raise RuntimeError(f"Provider mode requested but {provider_name()} is not configured")

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

