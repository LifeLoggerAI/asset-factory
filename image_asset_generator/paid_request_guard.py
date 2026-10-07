"""Protected gateway client for the existing image executor. No local spend authority."""
from __future__ import annotations

import hashlib
import copy
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

from spend_preflight_contract import Rejected, check, instant, unique_object


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
    issuer = urllib.parse.urlsplit(os.environ.get("ASSET_FORGE_SPEND_GATEWAY_ORIGIN", "").strip())
    token = os.environ.get("ASSET_FORGE_SPEND_WORKER_TOKEN", "")
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or parsed.query or len(token) < 32:
        raise PaidRequestUnauthorized("authenticated HTTPS spend gateway is required")
    if issuer.scheme != "https" or not issuer.hostname or issuer.username or issuer.password or issuer.fragment or issuer.query or issuer.path not in {"", "/"} or (parsed.scheme, parsed.netloc) != (issuer.scheme, issuer.netloc) or parsed.path != "/api/worker/production-spend":
        raise PaidRequestUnauthorized("spend gateway differs from protected issuer origin")
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


def source_input_digest(value: Any) -> str:
    try:
        raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (ValueError, TypeError) as exc:
        raise PaidRequestUnauthorized("source input cannot be bound exactly") from exc
    return hashlib.sha256(raw).hexdigest()


def request_header_bindings(headers: dict[str, str], credential_names: set[str]) -> dict[str, str]:
    normalized: dict[str, str] = {}
    for name, value in headers.items():
        key = name.lower()
        if not re.fullmatch(r"[!#$%&'*+.^_`|~0-9a-z-]+", key) or key in normalized or not isinstance(value, str) or "\r" in value or "\n" in value:
            raise PaidRequestUnauthorized("ambiguous provider headers")
        normalized[key] = value.strip()
    credential_names = {name.lower() for name in credential_names}
    if credential_names & {"content-type", "accept", "user-agent", "host", "content-length", "connection"}:
        raise PaidRequestUnauthorized("credential header conflicts with request semantics")
    credentials = {key: value for key, value in normalized.items() if key in credential_names}
    if not credentials or not all(credentials.values()) or ("authorization" in credentials and not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*\s+\S+", credentials["authorization"])):
        raise PaidRequestUnauthorized("actual provider account credential is required")
    semantics = {key: value for key, value in normalized.items() if key not in credential_names and key not in {"content-length", "host", "connection"}}
    content_type = normalized.get("content-type", "")
    if not content_type:
        raise PaidRequestUnauthorized("provider content type is required")
    return {"credential_sha256": source_input_digest(credentials), "semantic_headers_sha256": source_input_digest(semantics), "content_type": content_type}


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


def _checked_envelope(envelope: dict[str, Any], fields: dict[str, Any]) -> dict[str, Any]:
    source_sha, provider, model = fields["executor_source_sha"], fields["provider"], fields["model"]
    credential_sha256, source_input_sha256, request_sha256 = fields["credential_sha256"], fields["source_input_sha256"], fields["request_sha256"]
    try:
        receipt = check(envelope["job"], envelope["account"], envelope["authority"], datetime.now(timezone.utc))
        job, account, controls, price = envelope["job"], envelope["account"], envelope["protected_controls"], envelope["protected_pricing"]
        executor = job["executor"]
        hosts = executor.get("artifact_hosts")
        if not isinstance(hosts, list) or not 0 < len(hosts) <= 10 or len(set(hosts)) != len(hosts) or any(not isinstance(host, str) or not re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}", host) for host in hosts) or controls.get("artifact_hosts") != hosts:
            raise Rejected("exact approved artifact hosts or protected controls missing")
        if executor.get("source_sha") != source_sha or account.get("account_id") != job["account_id"] or account.get("provider") != provider or account.get("credential_sha256") != credential_sha256 or account.get("credential_binding_verified") is not True or not isinstance(account.get("credential_binding_receipt"), str) or not account["credential_binding_receipt"]:
            raise Rejected("approved image executor or authentic account mapping changed")
        for name in ["credential_sha256", "semantic_headers_sha256", "source_input_sha256", "semantic_input_sha256", "content_type"]:
            if executor.get(name) != fields[name] or controls.get(name) != fields[name] or price.get(name) != fields[name]:
                raise Rejected("actual image credential headers or input differ from approval")
        if controls.get("provider") != provider or controls.get("account_id") != job["account_id"] or source_input_sha256 not in job["input_sha256"] or request_sha256 not in job["input_sha256"]:
            raise Rejected("image account or input fixity changed")
        if job.get("job_id") != fields["job_id"] or job.get("provider") != provider or job.get("model_version") != model or any(executor.get(name) != fields[name] for name in ["endpoint", "request_sha256", "request_size", "asset"]):
            raise Rejected("actual image request identity differs from approval")
        now = datetime.now(timezone.utc)
        if controls.get("trusted_readback") is not True or controls.get("enforcement_source_sha") != source_sha or controls.get("hard_stop_supported") is not True or controls.get("cost_cap_enforced") is not True or controls.get("auto_top_up") is not False or not isinstance(controls.get("proof_receipt"), str) or not controls["proof_receipt"].strip() or not instant(controls.get("observed_at")) <= now < instant(controls.get("expires_at")):
            raise Rejected("actual image hard controls changed or stale")
        if any(controls.get(name) != job["budget"][name] for name in ["max_runtime_seconds", "max_usd_micros", "max_credits"]) or controls.get("endpoint") != fields["endpoint"] or controls.get("request_sha256") != request_sha256:
            raise Rejected("actual image control caps or request changed")
        if price.get("provider") != provider or price.get("account_id") != job["account_id"] or price.get("model_version") != model or price.get("request_sha256") != request_sha256 or price.get("trusted_readback") is not True or not isinstance(price.get("receipt"), str) or not price["receipt"].strip() or not instant(price.get("observed_at")) <= now < instant(price.get("expires_at")) or price.get("rates") != job["budget"]["rates"]:
            raise Rejected("actual-bound protected image pricing changed or stale")
        fields["account_id"] = job["account_id"]
    except (Rejected, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise PaidRequestUnauthorized("canonical offline preflight rejected request") from exc
    return receipt


def _admission_expiry(envelope: dict[str, Any], now: datetime) -> float:
    job = envelope["job"]
    check(job, envelope["account"], envelope["authority"], now)
    proofs = [(job["approval"], "issued_at"), (envelope["authority"], "observed_at"), (envelope["account"], "observed_at"), (envelope["protected_controls"], "observed_at"), (envelope["protected_pricing"], "observed_at"), (job["budget"]["rates"], "verified_at")]
    expiries = []
    for proof, observed in proofs:
        if not instant(proof.get(observed)) <= now < instant(proof.get("expires_at")):
            raise Rejected("protected image admission proof expired or future")
        expiries.append(instant(proof["expires_at"]).timestamp())
    return min(expiries)


def remaining_seconds(reservation: dict[str, Any]) -> float:
    remaining = min(reservation["deadlineMonotonic"] - time.monotonic(), reservation["admissionExpiresAt"] - datetime.now(timezone.utc).timestamp())
    if remaining <= 0:
        raise PaidRequestLimitReached("protected image execution deadline exceeded; reconcile before retry")
    return remaining


def check_admission(reservation: dict[str, Any]) -> None:
    remaining_seconds(reservation)
    if executor_source_sha() != reservation["sourceSha"]:
        raise PaidRequestUnauthorized("image source changed after reservation")
    try:
        receipt = _checked_envelope(reservation["envelope"], reservation["bindingFields"])
        if receipt["job_digest"] != reservation["offlineReceipt"]["job_digest"]:
            raise Rejected("image approval changed after reservation")
        _admission_expiry(reservation["envelope"], datetime.now(timezone.utc))
    except (Rejected, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise PaidRequestUnauthorized("image admission proof expired or changed") from exc
    remaining_seconds(reservation)


def reserve(*, provider: str, model: str | None, asset: str, request_size: str, request_sha256: str | None = None, endpoint: str | None = None, credential_sha256: str | None = None, semantic_headers_sha256: str | None = None, source_input_sha256: str | None = None, semantic_input_sha256: str | None = None, content_type: str | None = None) -> dict[str, Any]:
    require_deadline_support()
    if not request_sha256 or not endpoint or not model:
        raise PaidRequestUnauthorized("exact request bytes endpoint and model binding are required")
    if not all(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) for value in [credential_sha256, semantic_headers_sha256, source_input_sha256, semantic_input_sha256]) or not isinstance(content_type, str) or not content_type:
        raise PaidRequestUnauthorized("actual credential headers and source input binding are required")
    source_sha = executor_source_sha()
    job_id = _job_id(request_sha256)
    fields = {"job_id": job_id, "provider": provider, "model": model, "asset": asset, "request_size": request_size, "request_sha256": request_sha256, "endpoint": endpoint, "executor_source_sha": source_sha, "credential_sha256": credential_sha256, "semantic_headers_sha256": semantic_headers_sha256, "source_input_sha256": source_input_sha256, "semantic_input_sha256": semantic_input_sha256, "content_type": content_type}
    prepared = _gateway("preflight", **fields)
    if prepared.get("provider_call_authorized") is not False or prepared.get("execution_performed") is not False:
        raise PaidRequestUnauthorized("preflight must remain non-executing")
    envelope = copy.deepcopy(prepared.get("envelope", {}))
    receipt = _checked_envelope(envelope, fields)
    job = envelope["job"]
    try:
        now = datetime.now(timezone.utc)
        preflight_expiry = instant(prepared.get("admission_expires_at")).timestamp()
        if preflight_expiry > _admission_expiry(envelope, now) or preflight_expiry <= now.timestamp():
            raise Rejected("protected preflight admission expiry invalid")
    except (Rejected, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise PaidRequestUnauthorized("canonical offline preflight rejected request") from exc
    if executor_source_sha() != source_sha:
        raise PaidRequestUnauthorized("image source changed after preflight")
    admission_started = time.monotonic()
    runtime = job["budget"]["max_runtime_seconds"]
    if type(runtime) is not int or not 0 < runtime <= 86400:
        raise PaidRequestUnauthorized("approved image runtime missing")
    deadline = admission_started + min(runtime, preflight_expiry - datetime.now(timezone.utc).timestamp())
    admitted = _gateway("reserve", **fields, job_digest=receipt["job_digest"])
    runtime = admitted.get("max_runtime_seconds")
    if admitted.get("provider_call_authorized") is not True or admitted.get("execution_performed") is not False or admitted.get("executor_source_sha") != source_sha or admitted.get("job_digest") != receipt["job_digest"] or type(runtime) is not int or not 0 < runtime <= 86400 or not isinstance(admitted.get("attempt_id"), str) or not admitted["attempt_id"]:
        raise PaidRequestUnauthorized("invalid protected reservation response")
    if any(admitted.get(name) != fields[name] for name in ["account_id", "credential_sha256", "semantic_headers_sha256", "source_input_sha256", "semantic_input_sha256", "content_type"]):
        raise PaidRequestUnauthorized("reserved account credential headers or input changed")
    try:
        reserved_at = instant(admitted.get("reserved_at")).timestamp()
        admission_expiry = instant(admitted.get("admission_expires_at")).timestamp()
        now = datetime.now(timezone.utc).timestamp()
        if runtime != job["budget"]["max_runtime_seconds"] or not reserved_at <= now or not reserved_at < admission_expiry <= min(preflight_expiry, reserved_at + runtime):
            raise Rejected("reservation admission window invalid")
    except (Rejected, ValueError, TypeError) as exc:
        raise PaidRequestUnauthorized("invalid protected image reservation deadline") from exc
    reservation = {"attemptId": admitted["attempt_id"], "jobId": job_id, "maxRuntimeSeconds": runtime, "offlineReceipt": receipt, "bindingFields": fields, "deadlineMonotonic": min(deadline, time.monotonic() + admission_expiry - now), "admissionExpiresAt": admission_expiry, "sourceSha": source_sha, "envelope": copy.deepcopy(envelope)}
    _active[reservation["attemptId"]] = reservation
    check_admission(reservation)
    return reservation


@contextmanager
def runtime_limit(reservation: dict[str, Any], *, final_check=None):
    require_deadline_support()
    check_admission(reservation)
    old_handler = signal.getsignal(signal.SIGALRM)
    old_timer = signal.getitimer(signal.ITIMER_REAL)
    start = time.monotonic()
    limit = remaining_seconds(reservation)
    if old_timer[0] > 0:
        limit = min(limit, old_timer[0])
    def timeout(_signal, _frame):
        raise PaidRequestLimitReached("protected image execution deadline exceeded; reconcile before retry")
    signal.signal(signal.SIGALRM, timeout)
    signal.setitimer(signal.ITIMER_REAL, limit)
    try:
        yield
        check_admission(reservation)
        if final_check is not None:
            final_check()
        remaining_seconds(reservation)
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
    observed = _gateway("record", **reservation["bindingFields"], attempt_id=attempt_id, status=status, request_id=request_id)
    if observed.get("provider_call_authorized") is not False or observed.get("execution_performed") is not False or observed.get("reconciliation_required") is not True:
        raise PaidRequestUnauthorized("outcome observation cannot authorize execution or settle charges")


def snapshot() -> dict[str, Any]:
    bindings = {r["jobId"]: r["bindingFields"] for r in _active.values()}
    if not bindings:
        raise PaidRequestUnauthorized("a locally admitted exact request is required for outcome readback")
    jobs = [_gateway("snapshot", **fields)["job"] for _job, fields in sorted(bindings.items())]
    attempts = [a for job in jobs for a in job["attempts"]]
    reconciled = all(a.get("charges_reconciled") is True for a in attempts)
    return {"providerCallsReserved": len(attempts), "providerCallsExecuted": len(attempts) if reconciled else None, "reservedEstimatedCostUsd": str(sum(j["budget"]["max_usd_micros"] for j in jobs) / 1_000_000), "actualCostUsd": sum(a["actual_usd_micros"] for a in attempts) / 1_000_000 if reconciled else None, "chargesReconciled": reconciled, "attempts": attempts, "provider_call_authorized": False, "execution_performed": False}

