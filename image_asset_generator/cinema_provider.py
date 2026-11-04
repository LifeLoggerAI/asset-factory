"""Actual one-time cinema leaves share canonical reservations, never JSON spend authority."""
from __future__ import annotations

import copy
import json
import re
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import paid_request_guard as guard

API = "https://api.openai.com/v1"
SOURCE_PATHS = [
    "image_asset_generator/cinema_provider.py",
    "scripts/generate_before_rest_world_cinematic_motion.py",
    "scripts/generate_before_rest_world_full_master_t1.py",
    "scripts/generate_built_from_survival_hero_cinema.py",
    "scripts/resume_built_from_survival_hero_cinema.py",
    "scripts/run_protected_cinema.py",
    "film_foundry/finite_time/generate-openai-production.py",
    ".github/workflows/one-time-finite-time-openai-physics-validation.yml",
    ".github/workflows/one-time-finite-time-openai-physics-validation-v2.yml",
    ".github/workflows/one-time-finite-time-openai-representative-validation.yml",
    ".github/workflows/one-time-finite-time-openai-representative-retry-v2.yml",
    ".github/workflows/one-time-finite-time-openai-nonprivate-story-wave.yml",
    ".github/workflows/one-time-finite-time-openai-semantic-canary.yml",
    ".github/workflows/one-time-finite-time-openai-semantic-continuation.yml",
    ".github/workflows/one-time-before-rest-world-cinematic-motion.yml",
    ".github/workflows/one-time-before-rest-world-full-master-t1.yml",
    ".github/workflows/one-time-built-from-survival-hero-cinema.yml",
]
_sources: dict[str, Any] | None = None
_videos: dict[str, dict[str, Any]] = {}
MAX_OUTPUT_BYTES = 256 * 1024 * 1024


def bind_sources(manifest: dict[str, Any], authorization_marker: dict[str, Any]) -> None:
    global _sources
    # The old marker is source context only. It cannot reserve funds or authorize dispatch.
    _sources = copy.deepcopy({"manifest": manifest, "authorization_marker": authorization_marker})
    guard.source_input_digest(_sources)


def executor_source_sha() -> str:
    source = guard.executor_source_sha()
    root = Path(__file__).resolve().parents[1]
    try:
        tracked = subprocess.run(["git", "-C", str(root), "ls-files", "--error-unmatch", "--", *SOURCE_PATHS], capture_output=True, text=True, check=True, timeout=5).stdout.splitlines()
        dirty = subprocess.run(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all", "--", *SOURCE_PATHS], capture_output=True, text=True, check=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError) as exc:
        raise guard.PaidRequestUnauthorized("actual clean cinema source unavailable") from exc
    if set(tracked) != set(SOURCE_PATHS) or dirty:
        raise guard.PaidRequestUnauthorized("cinema source is dirty or untracked")
    return source


def _check(state: dict[str, Any]) -> None:
    guard.check_admission(state["reservation"])
    if executor_source_sha() != state["source_sha"] or guard.source_input_digest(_sources) != state["sources_digest"]:
        raise guard.PaidRequestUnauthorized("cinema source or bound program input changed")
    guard.check_admission(state["reservation"])


def _read(request: urllib.request.Request, state: dict[str, Any], maximum: int) -> bytes:
    _check(state)
    with guard.runtime_limit(state["reservation"]):
        with urllib.request.build_opener(guard._NoRedirect).open(request, timeout=min(120, guard.remaining_seconds(state["reservation"]))) as response:
            length = response.headers.get("Content-Length")
            if length is not None and (not length.isdigit() or int(length) > maximum):
                raise guard.PaidRequestUnauthorized("cinema output exceeds its bound")
            chunks, total = [], 0
            while True:
                chunk = response.read(min(65_536, maximum + 1 - total))
                _check(state)
                if not chunk:
                    break
                total += len(chunk)
                if total > maximum:
                    raise guard.PaidRequestUnauthorized("cinema output exceeds its bound")
                chunks.append(chunk)
            data = b"".join(chunks)
    _check(state)
    return data


def _submit(api_key: str, model: str, operation: str, body: bytes, content_type: str, fields: dict[str, str]) -> tuple[bytes, dict[str, Any]]:
    if _sources is None:
        raise guard.PaidRequestUnauthorized("cinema program inputs must be bound before admission")
    source = executor_source_sha()
    sources_digest = guard.source_input_digest(_sources)
    source_input = {"operation": operation, "fields": fields, "program": copy.deepcopy(_sources)}
    input_digest = guard.source_input_digest(source_input)
    endpoint = f"{API}/{operation}"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": content_type}
    bindings = guard.request_header_bindings(headers, {"authorization"})
    request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    reservation = guard.reserve(provider="openai", model=model, asset=f"cinema/{operation}/{input_digest}", request_size=str(len(body)), endpoint=endpoint, request_sha256=guard.request_digest(endpoint, body), source_input_sha256=input_digest, semantic_input_sha256=guard.semantic_input_digest(fields), **bindings)
    state = {"reservation": reservation, "source_sha": source, "sources_digest": sources_digest, "credential": api_key}
    try:
        data = _read(request, state, 65_536 if operation == "videos" else MAX_OUTPUT_BYTES)
        return data, state
    except Exception:
        try:
            guard.record(reservation["attemptId"], status="failed")
        except Exception:
            pass
        raise


def _observe(state: dict[str, Any], request_id: str | None = None) -> None:
    guard.record(state["reservation"]["attemptId"], status="succeeded", request_id=request_id)
    _check(state)


def _json(data: bytes) -> Any:
    return json.loads(data, object_pairs_hook=guard.unique_object, parse_constant=lambda _: (_ for _ in ()).throw(guard.PaidRequestUnauthorized("nonfinite cinema response")))


def _receipt(state: dict[str, Any]) -> dict[str, Any]:
    return {"budget_attempt_id": state["reservation"]["attemptId"], "budget_job_id": state["reservation"]["jobId"], "charges_reconciled": False}


def create_video(api_key: str, model: str, size: str, seconds: str, prompt: str) -> dict[str, Any]:
    fields = {"model": model, "size": size, "seconds": seconds, "prompt": prompt}
    boundary = "urai-cinema-" + guard.source_input_digest(fields)
    parts = []
    for name, value in sorted(fields.items()):
        if not isinstance(value, str) or boundary in value:
            raise guard.PaidRequestUnauthorized("invalid immutable cinema multipart input")
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n')
    body = ("".join(parts) + f"--{boundary}--\r\n").encode("utf-8")
    data, state = _submit(api_key, model, "videos", body, f"multipart/form-data; boundary={boundary}", fields)
    result = _json(data)
    video_id = result.get("id") if isinstance(result, dict) else None
    if not isinstance(video_id, str) or not re.fullmatch(r"video_[A-Za-z0-9_]+", video_id) or video_id in _videos:
        raise guard.PaidRequestUnauthorized("ambiguous admitted cinema task; charge hold retained")
    _observe(state, video_id)
    _videos[video_id] = state
    return {**result, **_receipt(state)}


def has_video(video_id: str) -> bool:
    return video_id in _videos


def _video_state(api_key: str, video_id: str) -> dict[str, Any]:
    state = _videos.get(video_id)
    if state is None or api_key != state["credential"]:
        raise guard.PaidRequestUnauthorized("cinema read lacks its exact admitted account/task")
    return state


def wait_video(api_key: str, video_id: str, timeout_seconds: int = 3600) -> dict[str, Any]:
    state = _video_state(api_key, video_id)
    start = time.monotonic()
    while True:
        request = urllib.request.Request(f"{API}/videos/{urllib.parse.quote(video_id, safe='')}", headers={"Authorization": f"Bearer {api_key}"}, method="GET")
        data = _json(_read(request, state, 65_536))
        if not isinstance(data, dict) or data.get("id") != video_id:
            raise guard.PaidRequestUnauthorized("cinema status changed its admitted task")
        if data.get("status") == "completed":
            _check(state)
            return {**data, **_receipt(state)}
        if data.get("status") in {"failed", "cancelled"}:
            raise RuntimeError("admitted cinema task failed; no generation retry")
        if time.monotonic() - start >= timeout_seconds:
            raise guard.PaidRequestLimitReached("cinema status deadline expired; hold retained")
        with guard.runtime_limit(state["reservation"]):
            time.sleep(min(20, guard.remaining_seconds(state["reservation"])))
        _check(state)


def _persist(output: Path, data: bytes, state: dict[str, Any]) -> None:
    _check(state)
    temporary = output.with_name(output.name + ".pending")
    replaced = False
    try:
        temporary.write_bytes(data)
        _check(state)
        temporary.replace(output)
        replaced = True
        _check(state)
    except Exception:
        temporary.unlink(missing_ok=True)
        if replaced:
            output.unlink(missing_ok=True)
        raise


def download_video(api_key: str, video_id: str, output: Path) -> None:
    state = _video_state(api_key, video_id)
    request = urllib.request.Request(f"{API}/videos/{urllib.parse.quote(video_id, safe='')}/content", headers={"Authorization": f"Bearer {api_key}"}, method="GET")
    _persist(output, _read(request, state, MAX_OUTPUT_BYTES), state)


def create_speech(api_key: str, model: str, voice: str, text: str, output: Path, instructions: str) -> dict[str, Any]:
    fields = {"model": model, "voice": voice, "input": text, "response_format": "wav", "instructions": instructions}
    body = json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    data, state = _submit(api_key, model, "audio/speech", body, "application/json", fields)
    _observe(state)
    _persist(output, data, state)
    return {"model": model, "voice": voice, "characters": len(text), **_receipt(state)}
