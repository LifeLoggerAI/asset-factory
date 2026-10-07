"""Protected gateway client for the existing image executor. No local spend authority."""
from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from spend_preflight_contract import Rejected, check, unique_object


class PaidRequestGuardError(RuntimeError):
    pass


class PaidRequestUnauthorized(PaidRequestGuardError):
    pass


class PaidRequestLimitReached(PaidRequestGuardError):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise PaidRequestUnauthorized("protected gateway redirects are forbidden")


_active: dict[str, dict[str, Any]] = {}


def _gateway(action: str, **fields: Any) -> dict[str, Any]:
    endpoint = os.environ.get("ASSET_FORGE_SPEND_GATEWAY_URL", "").strip()
    parsed = urllib.parse.urlsplit(endpoint)
    token = os.environ.get("ASSET_FORGE_SPEND_WORKER_TOKEN", "")
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or parsed.query or len(token) < 32:
        raise PaidRequestUnauthorized("authenticated HTTPS spend gateway is required")
    request = urllib.request.Request(endpoint, data=json.dumps({"action": action, **fields}, allow_nan=False).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
    try:
        # No automatic retry: a lost reserve response may already hold funds.
        with urllib.request.build_opener(_NoRedirect).open(request, timeout=15) as response:
            data = response.read(65537)
        if len(data) > 65536:
            raise PaidRequestUnauthorized("oversized gateway response")
        result = json.loads(data, object_pairs_hook=unique_object, parse_constant=lambda _: (_ for _ in ()).throw(Rejected("nonfinite JSON")))
        if not isinstance(result, dict) or result.get("ok") is not True:
            raise PaidRequestUnauthorized("protected gateway rejected request")
        return result
    except (urllib.error.URLError, ValueError, Rejected, OSError) as exc:
        raise PaidRequestUnauthorized("protected gateway rejected or returned ambiguous transport") from exc


def _job_id(request_sha256: str | None = None) -> str:
    direct = os.environ.get("ASSET_FORGE_SPEND_JOB_ID", "").strip()
    if direct:
        return direct
    try:
        mapping = json.loads(os.environ.get("ASSET_FORGE_SPEND_JOB_IDS_JSON", "{}"), object_pairs_hook=unique_object)
        job = mapping.get(request_sha256)
    except (ValueError, AttributeError, Rejected) as exc:
        raise PaidRequestUnauthorized("invalid protected job mapping") from exc
    if not isinstance(job, str) or not job.strip():
        raise PaidRequestUnauthorized("exact protected spend job is required")
    return job


def request_digest(endpoint: str, body: bytes) -> str:
    # Bind exact endpoint + method + submitted bytes, including prompts and model settings.
    return hashlib.sha256(b"POST\n" + endpoint.encode("utf-8") + b"\n" + body).hexdigest()


def require_deadline_support() -> None:
    if not hasattr(signal, "setitimer") or threading.current_thread() is not threading.main_thread():
        raise PaidRequestUnauthorized("bounded image executor requires main-thread interval timer")


def executor_source_sha() -> str:
    expected = os.environ.get("URAI_SOURCE_SHA", "") or os.environ.get("ASSET_FACTORY_EXACT_HEAD", "")
    if not re.fullmatch(r"[0-9a-f]{40}", expected):
        raise PaidRequestUnauthorized("declared exact image executor source is required")
    root = Path(__file__).resolve().parents[1]
    paths = ["image_asset_generator/paid_request_guard.py", "image_asset_generator/provider_renderer.py", "image_asset_generator/cost_guarded_renderer.py", "image_asset_generator/spend_preflight_contract.py"]
    try:
        tracked = subprocess.run(["git", "-C", str(root), "ls-files", "--error-unmatch", "--", *paths], capture_output=True, text=True, check=True, timeout=5).stdout.splitlines()
        if set(tracked) != set(paths):
            raise PaidRequestUnauthorized("all protected image source paths must be tracked by this build")
        head = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True, check=True, timeout=5).stdout.strip()
        dirty = subprocess.run(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all", "--", *paths], capture_output=True, text=True, check=True, timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError) as exc:
        raise PaidRequestUnauthorized("actual clean image build provenance is unavailable") from exc
    if head != expected or dirty:
        raise PaidRequestUnauthorized("image execution source is changed or not the declared exact build")
    return head


def reserve(*, provider: str, model: str | None, asset: str, request_size: str, request_sha256: str | None = None, endpoint: str | None = None) -> dict[str, Any]:
    require_deadline_support()
    if not request_sha256 or not endpoint or not model:
        raise PaidRequestUnauthorized("exact request bytes endpoint and model binding are required")
    source_sha = executor_source_sha()
    job_id = _job_id(request_sha256)
    fields = {"job_id": job_id, "provider": provider, "model": model, "asset": asset, "request_size": request_size, "request_sha256": request_sha256, "endpoint": endpoint, "executor_source_sha": source_sha}
    prepared = _gateway("preflight", **fields)
    if prepared.get("provider_call_authorized") is not False or prepared.get("execution_performed") is not False:
        raise PaidRequestUnauthorized("preflight must remain non-executing")
    envelope = prepared.get("envelope", {})
    try:
        receipt = check(envelope["job"], envelope["account"], envelope["authority"], datetime.now(timezone.utc))
        if envelope["job"].get("executor", {}).get("source_sha") != source_sha:
            raise Rejected("approved image executor source differs from actual clean build")
    except (Rejected, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise PaidRequestUnauthorized("canonical offline preflight rejected request") from exc
    admitted = _gateway("reserve", **fields, job_digest=receipt["job_digest"])
    runtime = admitted.get("max_runtime_seconds")
    if admitted.get("provider_call_authorized") is not True or admitted.get("execution_performed") is not False or admitted.get("executor_source_sha") != source_sha or admitted.get("job_digest") != receipt["job_digest"] or type(runtime) is not int or not 0 < runtime <= 86400 or not isinstance(admitted.get("attempt_id"), str) or not admitted["attempt_id"]:
        raise PaidRequestUnauthorized("invalid protected reservation response")
    reservation = {"attemptId": admitted["attempt_id"], "jobId": job_id, "maxRuntimeSeconds": runtime, "offlineReceipt": receipt}
    _active[reservation["attemptId"]] = reservation
    return reservation


@contextmanager
def runtime_limit(reservation: dict[str, Any]):
    require_deadline_support()
    old_handler = signal.getsignal(signal.SIGALRM)
    old_timer = signal.getitimer(signal.ITIMER_REAL)
    start = time.monotonic()
    limit = reservation["maxRuntimeSeconds"]
    if old_timer[0] > 0:
        limit = min(limit, old_timer[0])
    def timeout(_signal, _frame):
        raise PaidRequestLimitReached("protected image execution deadline exceeded; reconcile before retry")
    signal.signal(signal.SIGALRM, timeout)
    signal.setitimer(signal.ITIMER_REAL, limit)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old_handler)
        if old_timer[0] > 0:
            remaining = max(0.000001, old_timer[0] - (time.monotonic() - start))
            signal.setitimer(signal.ITIMER_REAL, remaining, old_timer[1])


def record(attempt_id: str, *, status: str, request_id: str | None = None, error: str | None = None) -> None:
    reservation = _active.get(attempt_id)
    if not reservation or status not in {"succeeded", "failed"}:
        raise PaidRequestUnauthorized("unknown protected attempt or invalid outcome")
    # Never send provider error bodies, prompts, source media, or caller-supplied costs.
    _gateway("record", job_id=reservation["jobId"], attempt_id=attempt_id, status=status, request_id=request_id)


def snapshot() -> dict[str, Any]:
    job_ids = {r["jobId"] for r in _active.values()}
    if not job_ids:
        job_ids = {_job_id()}
    jobs = [_gateway("snapshot", job_id=job_id)["job"] for job_id in sorted(job_ids)]
    attempts = [a for job in jobs for a in job["attempts"]]
    reconciled = all(a.get("charges_reconciled") is True for a in attempts)
    return {"providerCallsReserved": len(attempts), "providerCallsExecuted": len(attempts) if reconciled else None, "reservedEstimatedCostUsd": str(sum(j["budget"]["max_usd_micros"] for j in jobs) / 1_000_000), "actualCostUsd": sum(a["actual_usd_micros"] for a in attempts) / 1_000_000 if reconciled else None, "chargesReconciled": reconciled, "attempts": attempts, "provider_call_authorized": False, "execution_performed": False}
