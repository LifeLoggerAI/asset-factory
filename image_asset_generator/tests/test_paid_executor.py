"""Actual image leaf behavior with synthetic transports; never calls a provider."""
import base64
import copy
import io
import json
import os
import signal
import subprocess
import tempfile
import sys
import threading
import time
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cost_guarded_renderer as guarded
import paid_request_guard as guard
import provider_renderer as renderer
from spend_preflight_contract import digest
from PIL import Image

ENTRY = {"name": "synthetic-image", "category": "fixture", "prompt": "Synthetic geometry only", "aspect_ratio": "1:1", "alpha": False}
REAL_SOURCE_SHA = guard.executor_source_sha
ENV = {"URAI_SOURCE_SHA": "a" * 40, "ASSET_RENDERER_MODE": "provider", "ASSET_RENDERER_PROVIDER": "custom", "ASSET_RENDERER_MODEL": "synthetic-model", "ASSET_RENDERER_API_KEY": "SYNTHETIC-PROVIDER-KEY", "ASSET_RENDERER_ENDPOINT": "https://example.invalid/render", "ASSET_FORGE_SPEND_JOB_ID": "synthetic-pilot", "ASSET_FORGE_SPEND_GATEWAY_URL": "https://example.invalid/api/worker/production-spend", "ASSET_FORGE_SPEND_WORKER_TOKEN": "SYNTHETIC-NOT-AUTHORIZATION-0123456789"}
ENV["ASSET_FORGE_SPEND_GATEWAY_ORIGIN"] = "https://example.invalid"


class SyntheticClock(datetime):
    current = datetime.now(timezone.utc)
    @classmethod
    def now(cls, tz=None):
        return cls.current if tz is not None else cls.current.replace(tzinfo=None)


def envelope(fields):
    now = guard.datetime.now(timezone.utc)
    before = (now - timedelta(minutes=1)).isoformat(); after = (now + timedelta(minutes=5)).isoformat()
    binding = {"repository": "synthetic/fixture", "sha": "a" * 40}
    rates = {"usd_micros_per_unit": 1000000, "credits_per_unit": 10, "receipt": "SYNTHETIC-PRICE", "verified_at": before, "expires_at": after}
    job = {"schema_version": 1, "job_id": fields["job_id"], "provider": fields["provider"], "account_id": "synthetic-api", "operation": "render", "model_version": fields["model"], "owner_lane": "fixture", "consumer": "fixture", "truth_class": "GENERIC", "rights_reviewed": True, "authority": binding, "input_sha256": ["b" * 64], "reuse_review": {"input_sha256": ["b" * 64], "decision": "MISSING_COMPONENT", "receipt": "SYNTHETIC-REUSE"}, "acceptance": {"stage": "SPECIFIED", "criteria": "synthetic", "verification": "synthetic"}, "expected_outputs": ["image", "receipt"], "budget": {"currency": "USD", "max_usd_micros": 2500000, "max_credits": 20, "units": 1, "max_retries": 1, "max_runtime_seconds": 2, "hard_stop_supported": True, "auto_top_up": False, "storage_egress_overhead_usd_micros": 100000, "rates": rates}, "attempts": [], "executor": {"source_sha": fields["executor_source_sha"], "request_sha256": fields["request_sha256"], "endpoint": fields["endpoint"]}}
    job["executor"].update({key: fields[key] for key in ["credential_sha256", "semantic_headers_sha256", "source_input_sha256", "content_type", "asset", "request_size"]})
    job["input_sha256"] = [fields["source_input_sha256"], fields["request_sha256"]]; job["reuse_review"]["input_sha256"] = job["input_sha256"]
    job["approval"] = {"status": "APPROVED", "kind": "EXPLICIT_BOUNDED_SPEND", "receipt": "SYNTHETIC-NOT-AUTHORIZATION", "approver": "synthetic", "issued_at": before, "expires_at": after, "job_digest": digest(job), "max_usd_micros": 2500000, "max_credits": 20}
    account = {"provider": job["provider"], "account_id": job["account_id"], "balance_type": "API", "trusted_readback": True, "available_usd_micros": 3000000, "available_credits": 30, "observed_at": before, "expires_at": after, "reservations": [{"job_id": job["job_id"], "usd_micros": 2500000, "credits": 20}]}
    account.update({"credential_sha256":fields["credential_sha256"], "credential_binding_verified":True, "credential_binding_receipt":"SYNTHETIC-ACCOUNT-READBACK"})
    authority = {"binding": binding, "trusted_readback": True, "observed_at": before, "expires_at": after}
    controls = {key: fields[key] for key in ["credential_sha256", "semantic_headers_sha256", "source_input_sha256", "content_type", "provider"]}
    controls.update({"account_id": job["account_id"], "endpoint":fields["endpoint"], "request_sha256":fields["request_sha256"], "trusted_readback":True, "enforcement_source_sha":fields["executor_source_sha"], "hard_stop_supported":True, "cost_cap_enforced":True, "auto_top_up":False, "proof_receipt":"SYNTHETIC-CONTROLS", "observed_at":before, "expires_at":after, **{key:job["budget"][key] for key in ["max_runtime_seconds","max_usd_micros","max_credits"]}})
    controls.update(observed_at=before, expires_at=after)
    price = {**controls, "model_version":fields["model"], "request_sha256":fields["request_sha256"], "trusted_readback":True, "receipt":"SYNTHETIC-PRICE-PROOF", "observed_at":before, "expires_at":after, "rates":rates}
    return {"job": job, "account": account, "authority": authority, "protected_controls":controls, "protected_pricing":price}


class SyntheticGateway:
    def __init__(self): self.calls = []; self.env = None; self.reserved = False
    def __call__(self, action, **fields):
        self.calls.append((action, copy.deepcopy(fields)))
        if action == "preflight":
            if self.reserved: raise guard.PaidRequestUnauthorized("SYNTHETIC pending task cannot retry")
            self.env = envelope(fields)
            return {"ok": True, "envelope": self.env, "admission_expires_at": self.env["job"]["approval"]["expires_at"], "provider_call_authorized": False, "execution_performed": False}
        if action == "reserve":
            self.reserved = True
            now = guard.datetime.now(timezone.utc)
            expiry = min(now+timedelta(seconds=2), *[guard.instant(row["expires_at"]) for row in [self.env["job"]["approval"], self.env["authority"], self.env["account"], self.env["protected_controls"], self.env["protected_pricing"], self.env["job"]["budget"]["rates"]]])
            return {"ok": True, "attempt_id": "SYNTHETIC-ATTEMPT", "job_digest": fields["job_digest"], "executor_source_sha": fields["executor_source_sha"], "reserved_at": now.isoformat(), "admission_expires_at": expiry.isoformat(), "max_runtime_seconds": 2, "provider_call_authorized": True, "execution_performed": False, **{key: fields[key] for key in ["account_id", "credential_sha256", "semantic_headers_sha256", "source_input_sha256", "content_type"]}}
        if action == "record":
            self.env["job"]["attempts"] = [{"attempt_id": fields["attempt_id"], "status": "RECONCILIATION_REQUIRED", "charges_reconciled": False}]
            return {"ok": True, "reconciliation_required": True}
        if action == "snapshot": return {"ok": True, "job": self.env["job"]}
        raise AssertionError(action)


class Response:
    def __init__(self, data, headers): self.data = data; self.headers = headers
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, limit=None): return self.data[:limit]


def image_response():
    output = io.BytesIO(); Image.new("RGB", (64, 64), "blue").save(output, format="PNG")
    return Response(json.dumps({"id": "synthetic-provider-task", "image_base64": base64.b64encode(output.getvalue()).decode()}).encode(), {"content-type": "application/json", "x-request-id": "synthetic-provider-task"})


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        guard._active.clear()
        self.env_patch = patch.dict(os.environ, ENV, clear=True); self.env_patch.start()
        self.source_patch = patch.object(guard, "executor_source_sha", return_value="a" * 40); self.source_patch.start()
    def tearDown(self): self.source_patch.stop(); self.env_patch.stop(); guard._active.clear()
    def test_missing_or_expired_absolute_reservation_never_dispatches(self):
        for field in ["reserved_at", "admission_expires_at"]:
            gateway = SyntheticGateway()
            def changed(action, **fields):
                result = gateway(action, **fields)
                if action == "reserve": result.pop(field)
                return result
            with patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
                self.assertTrue(gateway.reserved); opener.assert_not_called()
    def test_preflight_expiry_prevents_reserve_and_dispatch(self):
        gateway = SyntheticGateway()
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "preflight": result["admission_expires_at"] = (datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
            return result
        with patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            self.assertFalse(gateway.reserved); opener.assert_not_called()
    def test_protected_gateway_origin_mismatch_never_sends_worker_credential(self):
        with patch.dict(os.environ, {"ASSET_FORGE_SPEND_GATEWAY_ORIGIN":"https://foreign.invalid"}), patch.object(guard.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): guard._gateway("snapshot", job_id="synthetic")
            opener.assert_not_called()
    def test_legacy_env_authorization_cannot_bypass_gateway(self):
        with patch.dict(os.environ, {"ASSET_FORGE_PAID_RUN_AUTHORIZED": "1", "ASSET_FORGE_MAX_PROVIDER_CALLS": "99", "ASSET_FORGE_MAX_COST_USD": "1000", "ASSET_FORGE_SPEND_WORKER_TOKEN": ""}), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            opener.assert_not_called()
    def test_unbound_outer_reserve_is_rejected_before_transport(self):
        with patch.object(guard, "_gateway") as gateway:
            with self.assertRaises(guard.PaidRequestUnauthorized): guard.reserve(provider="custom", model="synthetic", asset="synthetic", request_size="64x64")
            gateway.assert_not_called()
    def test_actual_leaf_hashes_exact_endpoint_body_and_records_pending_charge(self):
        gateway = SyntheticGateway()
        with patch.object(guard, "_gateway", gateway), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = image_response()
            result = renderer.render_with_provider(ENTRY, 64, feedback="Synthetic correction")
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(gateway.calls[0][1]["request_sha256"], guard.request_digest(request.full_url, request.data))
            self.assertIn(b"Synthetic correction", request.data); self.assertEqual(result.metadata["budget_attempt_id"], "SYNTHETIC-ATTEMPT")
            self.assertFalse(result.metadata["charges_reconciled"]); self.assertFalse(guard._active["SYNTHETIC-ATTEMPT"]["offlineReceipt"]["provider_call_authorized"])
            self.assertEqual(opener.return_value.open.call_count, 1)
    def test_openai_leaf_uses_actual_alpha_model_and_payload(self):
        gateway = SyntheticGateway()
        with patch.dict(os.environ, {"ASSET_RENDERER_PROVIDER": "openai", "OPENAI_API_KEY": "synthetic-not-a-real-key", "ASSET_RENDERER_ALPHA_MODEL": "synthetic-alpha"}), patch.object(guard, "_gateway", gateway), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = image_response()
            renderer.render_with_provider({**ENTRY, "alpha": True}, 64)
            self.assertEqual(gateway.calls[0][1]["model"], "synthetic-alpha")
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(json.loads(request.data)["model"], "synthetic-alpha"); self.assertEqual(json.loads(request.data)["background"], "transparent")
    def test_unknown_transport_does_not_retry_even_when_retry_env_is_99(self):
        gateway = SyntheticGateway()
        with patch.dict(os.environ, {"ASSET_RENDERER_MAX_ATTEMPTS": "99"}), patch.object(guard, "_gateway", gateway), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.side_effect = urllib.error.URLError("synthetic uncertain transport")
            with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(ENTRY, 64)
            self.assertEqual(opener.return_value.open.call_count, 1)
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            self.assertEqual(opener.return_value.open.call_count, 1)
    def test_auto_fallback_does_not_resubmit_provider(self):
        gateway = SyntheticGateway()
        with patch.dict(os.environ, {"ASSET_RENDERER_MODE": "auto"}), patch.object(guard, "_gateway", gateway), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.side_effect = urllib.error.URLError("synthetic uncertainty")
            result = guarded.render_asset(ENTRY, 64, lambda entry, size: Image.new("RGB", (size, size)))
            self.assertEqual(result.renderer, "offline-fallback"); self.assertEqual(opener.return_value.open.call_count, 1)
    def test_direct_renderer_auto_fallback_does_not_hide_admission_denial(self):
        with patch.dict(os.environ, {"ASSET_RENDERER_MODE": "auto", "ASSET_FORGE_SPEND_WORKER_TOKEN": ""}), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_asset(ENTRY, 64, lambda entry, size: Image.new("RGB", (size, size)))
            opener.assert_not_called()
    def test_offline_path_never_contacts_gateway_or_provider(self):
        with patch.dict(os.environ, {"ASSET_RENDERER_MODE": "offline"}), patch.object(guard, "_gateway") as gateway, patch.object(renderer.urllib.request, "build_opener") as opener:
            result = guarded.render_asset(ENTRY, 64, lambda entry, size: Image.new("RGB", (size, size)))
            self.assertEqual(result.renderer, "offline"); gateway.assert_not_called(); opener.assert_not_called()
    def test_legacy_http_override_cannot_open_paid_execution(self):
        with patch.dict(os.environ, {"ASSET_RENDERER_ENDPOINT": "http://example.invalid/render", "ASSET_RENDERER_ALLOW_HTTP": "1"}), patch.object(guard, "_gateway") as gateway:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            gateway.assert_not_called()
    def test_forged_offline_authorization_flag_cannot_reserve(self):
        with patch.object(guard, "_gateway", return_value={"ok": True, "provider_call_authorized": True, "execution_performed": False}) as gateway:
            with self.assertRaises(guard.PaidRequestUnauthorized): guard.reserve(provider="custom", model="synthetic", asset="synthetic", request_size="64x64", endpoint="https://example.invalid", request_sha256="a"*64, credential_sha256="b"*64, semantic_headers_sha256="c"*64, source_input_sha256="d"*64, content_type="application/json")
            self.assertEqual(gateway.call_count, 1)
    def test_boolean_gateway_runtime_cannot_authorize_submission(self):
        gateway = SyntheticGateway()
        def malformed(action, **fields):
            result = gateway(action, **fields)
            if action == "reserve": result["max_runtime_seconds"] = True
            return result
        with patch.object(guard, "_gateway", malformed), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            opener.assert_not_called()
    def test_gateway_duplicate_json_key_and_ambiguous_transport_are_closed(self):
        for value in [b'{"ok":true,"ok":true}', b'{"ok":true,"value":NaN}']:
            with patch.object(guard.urllib.request, "build_opener") as opener:
                opener.return_value.open.return_value = Response(value, {})
                with self.assertRaises(guard.PaidRequestUnauthorized): guard._gateway("snapshot", job_id="synthetic")
        with patch.object(guard.urllib.request, "build_opener") as opener:
            opener.return_value.open.side_effect = urllib.error.URLError("synthetic")
            with self.assertRaises(guard.PaidRequestUnauthorized): guard._gateway("reserve", job_id="synthetic")
            self.assertEqual(opener.return_value.open.call_count, 1)
    def test_redirects_never_forward_gateway_or_provider_credentials(self):
        with self.assertRaises(guard.PaidRequestUnauthorized): guard._NoRedirect().redirect_request(None, None, 302, None, None, "https://foreign.invalid")
    def test_actual_execution_deadline_interrupts_transport_and_restores_timer(self):
        before_handler = signal.getsignal(signal.SIGALRM); started = time.monotonic()
        gateway = SyntheticGateway()
        fields = {"provider": "custom", "model": "synthetic", "asset": "synthetic", "request_size": "64x64", "endpoint": "https://example.invalid", "request_sha256": "a"*64, "credential_sha256": "b"*64, "semantic_headers_sha256": "c"*64, "source_input_sha256": "d"*64, "content_type": "application/json"}
        with patch.object(guard, "_gateway", gateway): reservation = guard.reserve(**fields)
        reservation["deadlineMonotonic"] = time.monotonic() + 1
        with self.assertRaises(guard.PaidRequestLimitReached):
            with guard.runtime_limit(reservation): time.sleep(2)
        self.assertLess(time.monotonic()-started, 1.5); self.assertEqual(signal.getsignal(signal.SIGALRM), before_handler); self.assertEqual(signal.getitimer(signal.ITIMER_REAL)[0], 0)
    def test_non_main_thread_executor_is_denied_before_reserve(self):
        errors = []
        def run():
            try: guard.reserve(provider="custom", model="synthetic", asset="synthetic", request_size="64x64", endpoint="https://example.invalid", request_sha256="a"*64)
            except Exception as exc: errors.append(exc)
        with patch.object(guard, "_gateway") as gateway:
            thread=threading.Thread(target=run); thread.start(); thread.join(); self.assertIsInstance(errors[0], guard.PaidRequestUnauthorized); gateway.assert_not_called()
    def test_snapshot_never_invents_actual_spend_from_worker_outcome(self):
        gateway = SyntheticGateway()
        with patch.object(guard, "_gateway", gateway), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = image_response(); renderer.render_with_provider(ENTRY, 64)
            result = guard.snapshot(); self.assertIsNone(result["actualCostUsd"]); self.assertIsNone(result["providerCallsExecuted"]); self.assertFalse(result["chargesReconciled"]); self.assertEqual(result["providerCallsReserved"],1)

    def test_old_approved_executor_source_cannot_reserve(self):
        gateway = SyntheticGateway()
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "preflight": result["envelope"]["job"]["executor"]["source_sha"] = "c" * 40
            return result
        with patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            self.assertEqual(len(gateway.calls), 1); opener.assert_not_called()
    def test_gateway_source_mismatch_cannot_submit_provider(self):
        gateway = SyntheticGateway()
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "reserve": result["executor_source_sha"] = "c" * 40
            return result
        with patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            opener.assert_not_called()
    def test_real_git_provenance_rejects_old_head_and_dirty_spend_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); leaf = root / "image_asset_generator"; leaf.mkdir()
            for name in ["paid_request_guard.py", "provider_renderer.py", "cost_guarded_renderer.py", "spend_preflight_contract.py"]: (leaf / name).write_text("# synthetic provenance fixture\n")
            def git(*args): return subprocess.run(["git", "-C", tmp, *args], check=True, capture_output=True, text=True).stdout.strip()
            git("init"); git("config", "user.name", "Synthetic fixture"); git("config", "user.email", "fixture@example.invalid"); git("add", "image_asset_generator"); git("commit", "-m", "Synthetic provenance fixture")
            head = git("rev-parse", "HEAD")
            with patch.object(guard, "__file__", str(leaf / "paid_request_guard.py")), patch.dict(os.environ, {"URAI_SOURCE_SHA": head}):
                self.assertEqual(REAL_SOURCE_SHA(), head)
                with patch.dict(os.environ, {"URAI_SOURCE_SHA": "c" * 40}):
                    with self.assertRaises(guard.PaidRequestUnauthorized): REAL_SOURCE_SHA()
                with patch.dict(os.environ, {"URAI_SOURCE_SHA": "", "ASSET_FACTORY_EXACT_HEAD": ""}):
                    with self.assertRaises(guard.PaidRequestUnauthorized): REAL_SOURCE_SHA()
                (leaf / "provider_renderer.py").write_text("# synthetic dirty build\n")
                with self.assertRaises(guard.PaidRequestUnauthorized): REAL_SOURCE_SHA()
                git("checkout", "--", "image_asset_generator/provider_renderer.py")
                git("rm", "--cached", "image_asset_generator/spend_preflight_contract.py")
                with self.assertRaises(guard.PaidRequestUnauthorized): REAL_SOURCE_SHA()
                git("reset", "HEAD", "--", "image_asset_generator/spend_preflight_contract.py")
                (leaf / "spend_preflight_contract.py").unlink()
                with self.assertRaises(guard.PaidRequestUnauthorized): REAL_SOURCE_SHA()
    def test_artifact_retrieval_requires_https_and_has_a_bounded_read(self):
        with patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(ValueError): renderer._extract_image_bytes({"image_url": "http://example.invalid/image"}, 2)
            opener.assert_not_called()
            response = opener.return_value.open.return_value.__enter__.return_value
            response.read.return_value = b"synthetic"
            self.assertEqual(renderer._extract_image_bytes({"image_url": "https://example.invalid/image"}, 2), b"synthetic")
            response.read.assert_called_once_with(67108865)
            self.assertEqual(opener.return_value.open.call_args.args[0].get_method(), "GET")
    def test_missing_git_provenance_cannot_authorize_image_executor(self):
        with patch.object(guard.subprocess, "run", side_effect=FileNotFoundError("synthetic missing git")):
            with self.assertRaises(guard.PaidRequestUnauthorized): REAL_SOURCE_SHA()

    def test_actual_openai_and_custom_credential_account_drift_cannot_dispatch(self):
        for provider in ["openai", "custom"]:
            gateway = SyntheticGateway()
            credential_a, credential_b = "SYNTHETIC-ACCOUNT-A", "SYNTHETIC-ACCOUNT-B"
            expected = guard.source_input_digest({"authorization": "Bearer " + credential_a})
            def changed(action, **fields):
                result = gateway(action, **fields)
                if action == "preflight":
                    env = result["envelope"]
                    env["job"]["executor"]["credential_sha256"] = expected
                    env["account"]["credential_sha256"] = expected
                    env["protected_controls"]["credential_sha256"] = expected
                    env["job"]["approval"]["job_digest"] = digest(env["job"])
                return result
            with self.subTest(provider=provider), patch.dict(os.environ, {"ASSET_RENDERER_PROVIDER":provider,"OPENAI_API_KEY":credential_b,"ASSET_RENDERER_API_KEY":credential_b}), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY,64)
                opener.assert_not_called(); self.assertEqual([a for a,_ in gateway.calls],["preflight"])
    def test_missing_or_drifted_protected_fingerprints_fail_before_provider(self):
        changes = [lambda e:e["account"].pop("credential_binding_receipt"),lambda e:e["account"].update(credential_binding_verified=False),lambda e:e["protected_controls"].pop("credential_sha256"),lambda e:e["protected_controls"].update(semantic_headers_sha256="c"*64),lambda e:e["job"]["executor"].pop("source_input_sha256"),lambda e:e["job"].update(account_id="ANOTHER-ACCOUNT")]
        for change in changes:
            gateway = SyntheticGateway()
            def changed(action, **fields):
                result=gateway(action,**fields)
                if action=="preflight": change(result["envelope"]); result["envelope"]["job"]["approval"]["job_digest"]=digest(result["envelope"]["job"])
                return result
            with patch.object(guard,"_gateway",changed),patch.object(renderer.urllib.request,"build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized):renderer.render_with_provider(ENTRY,64)
                opener.assert_not_called()
    def test_custom_named_auth_headers_are_bound_and_case_duplicates_rejected(self):
        gateway=SyntheticGateway()
        with patch.dict(os.environ,{"ASSET_RENDERER_AUTH_HEADER":"X-Synthetic-Account-Key","ASSET_RENDERER_AUTH_SCHEME":""}),patch.object(guard,"_gateway",gateway),patch.object(renderer.urllib.request,"build_opener") as opener:
            opener.return_value.open.return_value=image_response();renderer.render_with_provider(ENTRY,64)
            expected=guard.source_input_digest({"x-synthetic-account-key":ENV["ASSET_RENDERER_API_KEY"]})
            self.assertEqual(gateway.calls[0][1]["credential_sha256"],expected)
            self.assertNotIn(ENV["ASSET_RENDERER_API_KEY"],json.dumps(gateway.calls))
        for headers in [{"Content-Type":"application/json","Authorization":"Bearer A","authorization":"Bearer B"},{"Content-Type":"Bearer A","Accept":"application/json"}]:
            with self.assertRaises(guard.PaidRequestUnauthorized):guard.request_header_bindings(headers,{"authorization","content-type"} if "Authorization" not in headers else {"authorization"})
    def test_environment_credential_changes_after_admission_cannot_replace_frozen_request(self):
        gateway=SyntheticGateway()
        def changed(action,**fields):
            result=gateway(action,**fields)
            if action=="preflight":os.environ["ASSET_RENDERER_API_KEY"]="SYNTHETIC-MUTATED-AFTER-PREFLIGHT"
            return result
        with patch.object(guard,"_gateway",changed),patch.object(renderer.urllib.request,"build_opener") as opener:
            opener.return_value.open.return_value=image_response();renderer.render_with_provider(ENTRY,64)
            self.assertEqual(opener.return_value.open.call_args.args[0].get_header("Authorization"),"Bearer "+ENV["ASSET_RENDERER_API_KEY"])
    def test_reserved_account_or_fingerprint_reply_drift_prevents_dispatch_and_keeps_unknown_hold(self):
        for field in ["account_id","credential_sha256","semantic_headers_sha256","source_input_sha256","content_type"]:
            gateway=SyntheticGateway()
            def changed(action,**fields):
                result=gateway(action,**fields)
                if action=="reserve":result[field]="SYNTHETIC-DRIFT"
                return result
            with patch.object(guard,"_gateway",changed),patch.object(renderer.urllib.request,"build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized):renderer.render_with_provider(ENTRY,64)
                self.assertTrue(gateway.reserved);opener.assert_not_called()

    def test_missing_drifted_or_stale_actual_bound_pricing_never_reserves_or_dispatches(self):
        changes = [lambda e:e.pop("protected_pricing")]
        for name in ["provider", "account_id", "model_version", "request_sha256", "credential_sha256", "semantic_headers_sha256", "source_input_sha256", "content_type", "receipt", "observed_at", "expires_at"]:
            changes.append(lambda e,name=name:e["protected_pricing"].pop(name))
        changes.extend([lambda e:e["protected_pricing"].update(trusted_readback=False), lambda e:e["protected_pricing"].update(expires_at="2000-01-01T00:00:00Z"), lambda e:e["protected_pricing"].update(observed_at="2100-01-01T00:00:00Z"), lambda e:e["protected_pricing"].update(semantic_headers_sha256="c"*64), lambda e:e["protected_pricing"].update(rates={**e["job"]["budget"]["rates"], "usd_micros_per_unit":1})])
        for change in changes:
            gateway = SyntheticGateway()
            def changed(action,**fields):
                result=gateway(action,**fields)
                if action=="preflight":change(result["envelope"])
                return result
            with patch.object(guard,"_gateway",changed),patch.object(renderer.urllib.request,"build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized):renderer.render_with_provider(ENTRY,64)
                opener.assert_not_called();self.assertFalse(gateway.reserved)

    def test_absolute_admission_timestamps_are_mandatory_and_cannot_extend_the_signed_window(self):
        for action, field, value in [("preflight", "admission_expires_at", None), ("preflight", "admission_expires_at", "2026-02-30T12:00:00Z"), ("reserve", "reserved_at", None), ("reserve", "admission_expires_at", None), ("reserve", "reserved_at", "2100-01-01T00:00:00Z"), ("reserve", "admission_expires_at", "2100-01-01T00:00:00Z")]:
            gateway = SyntheticGateway()
            def changed(which, **fields):
                result = gateway(which, **fields)
                if which == action: result[field] = value
                return result
            with patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
                opener.assert_not_called()
                self.assertEqual(gateway.reserved, action == "reserve")

    def test_delayed_reserve_response_cannot_restart_the_runtime(self):
        gateway = SyntheticGateway(); clock = [1000.0]
        def delayed(action, **fields):
            result = gateway(action, **fields)
            if action == "reserve": clock[0] += 3
            return result
        with patch.object(guard, "_gateway", delayed), patch.object(guard.time, "monotonic", side_effect=lambda: clock[0]), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestLimitReached): renderer.render_with_provider(ENTRY, 64)
            opener.assert_not_called(); self.assertTrue(gateway.reserved)

    def test_actual_source_changed_after_reservation_cannot_dispatch(self):
        gateway = SyntheticGateway()
        with patch.object(guard, "_gateway", gateway), patch.object(guard, "executor_source_sha", side_effect=["a"*40, "a"*40, "c"*40]), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            opener.assert_not_called(); self.assertTrue(gateway.reserved)

    def test_expired_output_body_cannot_return_a_successful_image(self):
        gateway = SyntheticGateway(); clock = [1000.0]; response = image_response()
        original_read = response.read
        def delayed_read(limit=None):
            clock[0] += 3
            return original_read(limit)
        response.read = delayed_read
        with patch.object(guard, "_gateway", gateway), patch.object(guard.time, "monotonic", side_effect=lambda: clock[0]), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = response
            with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(ENTRY, 64)
            self.assertEqual(opener.return_value.open.call_count, 1); self.assertTrue(gateway.reserved)

    def test_worker_token_is_never_sent_to_an_unpinned_gateway(self):
        for origin in ["", "https://foreign.invalid", "https://example.invalid/other"]:
            with patch.dict(os.environ, {"ASSET_FORGE_SPEND_GATEWAY_ORIGIN": origin}), patch.object(guard.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): guard._gateway("preflight", job_id="synthetic")
                opener.assert_not_called()

    def test_preflight_cannot_enlarge_any_verified_proof_window(self):
        for name in ["approval", "authority", "account", "controls", "price", "rates"]:
            gateway = SyntheticGateway()
            def changed(action, **fields):
                result = gateway(action, **fields)
                if action == "preflight":
                    env = result["envelope"]
                    row = {"approval":env["job"]["approval"], "authority":env["authority"], "account":env["account"], "controls":env["protected_controls"], "price":env["protected_pricing"], "rates":env["job"]["budget"]["rates"]}[name]
                    row["expires_at"] = (datetime.now(timezone.utc)+timedelta(seconds=1)).isoformat()
                    env["job"]["approval"]["job_digest"] = digest(env["job"])
                return result
            with self.subTest(proof=name), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
                self.assertFalse(gateway.reserved); opener.assert_not_called()

    def test_every_proof_expiry_during_reserve_prevents_actual_dispatch_and_retains_hold(self):
        for name in ["approval", "authority", "account", "controls", "price", "rates"]:
            SyntheticClock.current = datetime.now(timezone.utc)
            gateway = SyntheticGateway()
            def changed(action, **fields):
                result = gateway(action, **fields)
                if action == "preflight":
                    env = result["envelope"]
                    row = {"approval":env["job"]["approval"], "authority":env["authority"], "account":env["account"], "controls":env["protected_controls"], "price":env["protected_pricing"], "rates":env["job"]["budget"]["rates"]}[name]
                    row["expires_at"] = (SyntheticClock.current+timedelta(seconds=1)).isoformat()
                    env["job"]["approval"]["job_digest"] = digest(env["job"])
                    result["admission_expires_at"] = row["expires_at"]
                if action == "reserve": SyntheticClock.current += timedelta(seconds=2)
                return result
            with self.subTest(proof=name), patch.object(guard, "datetime", SyntheticClock), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                with self.assertRaises((guard.PaidRequestUnauthorized, guard.PaidRequestLimitReached)): renderer.render_with_provider(ENTRY, 64)
                self.assertTrue(gateway.reserved); opener.assert_not_called(); self.assertIn("SYNTHETIC-ATTEMPT", guard._active)

    def test_untrusted_or_changed_hard_controls_cannot_reserve(self):
        changes = [{"trusted_readback":False}, {"enforcement_source_sha":"c"*40}, {"hard_stop_supported":False}, {"cost_cap_enforced":False}, {"auto_top_up":True}, {"proof_receipt":""}, {"max_runtime_seconds":3}, {"max_usd_micros":3000000}, {"max_credits":21}, {"endpoint":"https://foreign.invalid"}, {"request_sha256":"c"*64}, {"expires_at":"2000-01-01T00:00:00Z"}]
        for change in changes:
            gateway = SyntheticGateway()
            def changed(action, **fields):
                result = gateway(action, **fields)
                if action == "preflight": result["envelope"]["protected_controls"].update(change)
                return result
            with self.subTest(change=change), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
                self.assertFalse(gateway.reserved); opener.assert_not_called()

    def test_approved_actual_image_request_fields_cannot_drift(self):
        for name in ["endpoint", "request_sha256", "request_size", "asset"]:
            gateway = SyntheticGateway()
            def changed(action, **fields):
                result = gateway(action, **fields)
                if action == "preflight":
                    env = result["envelope"]; env["job"]["executor"][name] = "SYNTHETIC-DRIFT"
                    env["job"]["approval"]["job_digest"] = digest(env["job"])
                return result
            with self.subTest(field=name), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
                self.assertFalse(gateway.reserved); opener.assert_not_called()

    def test_actual_response_body_completion_after_expiry_cannot_return_image(self):
        SyntheticClock.current = datetime.now(timezone.utc); gateway = SyntheticGateway(); response = image_response()
        original_read = response.read
        def late_read(limit=None):
            SyntheticClock.current += timedelta(seconds=2)
            return original_read(limit)
        response.read = late_read
        with patch.object(guard, "datetime", SyntheticClock), patch.object(guard, "_gateway", gateway), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = response
            with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(ENTRY, 64)
            opener.return_value.open.assert_called_once(); self.assertTrue(gateway.reserved)
            self.assertEqual([action for action,_ in gateway.calls].count("reserve"), 1)

    def test_delayed_success_record_cannot_return_image_and_timer_is_active(self):
        SyntheticClock.current = datetime.now(timezone.utc); gateway = SyntheticGateway(); active_during_record = []
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "record" and fields["status"] == "succeeded":
                active_during_record.append(signal.getitimer(signal.ITIMER_REAL)[0] > 0)
                SyntheticClock.current += timedelta(seconds=2)
            return result
        with patch.object(guard, "datetime", SyntheticClock), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = image_response()
            with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(ENTRY, 64)
            opener.return_value.open.assert_called_once(); self.assertEqual(active_during_record, [True]); self.assertTrue(gateway.reserved)
            self.assertFalse(guard.snapshot()["chargesReconciled"])

    def test_source_drift_during_outcome_delivery_cannot_return_image(self):
        gateway = SyntheticGateway(); source = {"sha":"a"*40}
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "record" and fields["status"] == "succeeded": source["sha"] = "c"*40
            return result
        with patch.object(guard, "executor_source_sha", side_effect=lambda:source["sha"]), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = image_response()
            with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(ENTRY, 64)
            opener.return_value.open.assert_called_once(); self.assertTrue(gateway.reserved)

    def test_monotonic_runtime_expiry_with_wall_clock_rollback_cannot_return_output(self):
        SyntheticClock.current = datetime.now(timezone.utc); clock = {"value":1000.0}; gateway = SyntheticGateway()
        response = image_response(); original_read = response.read
        def changed_read(limit=None):
            clock["value"] += 2.1; SyntheticClock.current -= timedelta(seconds=1)
            return original_read(limit)
        response.read = changed_read
        with patch.object(guard, "datetime", SyntheticClock), patch.object(guard.time, "monotonic", side_effect=lambda:clock["value"]), patch.object(guard, "_gateway", gateway), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = response
            with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(ENTRY, 64)
            self.assertTrue(gateway.reserved); opener.return_value.open.assert_called_once()

    def test_source_verification_latency_cannot_reopen_final_output(self):
        SyntheticClock.current = datetime.now(timezone.utc); gateway = SyntheticGateway(); recorded = {"success":False}
        def source():
            if recorded["success"]: SyntheticClock.current += timedelta(seconds=2)
            return "a"*40
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "record" and fields["status"] == "succeeded": recorded["success"] = True
            return result
        with patch.object(guard, "datetime", SyntheticClock), patch.object(guard, "executor_source_sha", side_effect=source), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = image_response()
            with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(ENTRY, 64)
            opener.return_value.open.assert_called_once(); self.assertTrue(gateway.reserved)

    def test_enlarged_atomic_runtime_cannot_dispatch(self):
        gateway = SyntheticGateway()
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "reserve": result["max_runtime_seconds"] = 3
            return result
        with patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): renderer.render_with_provider(ENTRY, 64)
            self.assertTrue(gateway.reserved); opener.assert_not_called()


    def test_mutation_during_final_source_check_cannot_escape_current_request_hashes(self):
        for changed_field in ["input", "credential", "body"]:
            gateway = SyntheticGateway(); entry = copy.deepcopy(ENTRY)
            state = {"recorded":False, "after_record_sources":0}; captured = {}
            def source():
                if state["recorded"]:
                    state["after_record_sources"] += 1
                    if state["after_record_sources"] == 2:
                        if changed_field == "input": entry["prompt"] = "SYNTHETIC-CHANGED-AFTER-FINAL-SOURCE"
                        elif changed_field == "credential": captured["request"].add_header("Authorization", "Bearer SYNTHETIC-DRIFT")
                        else: captured["request"].data = b'{"synthetic":"changed"}'
                return "a"*40
            def changed(action, **fields):
                result = gateway(action, **fields)
                if action == "record" and fields["status"] == "succeeded": state["recorded"] = True
                return result
            def opened(request, **kwargs):
                captured["request"] = request
                return image_response()
            with self.subTest(field=changed_field), patch.object(guard, "executor_source_sha", side_effect=source), patch.object(guard, "_gateway", changed), patch.object(renderer.urllib.request, "build_opener") as opener:
                opener.return_value.open.side_effect = opened
                with self.assertRaises(renderer.ProviderExecutionFailed): renderer.render_with_provider(entry, 64)
                opener.return_value.open.assert_called_once(); self.assertTrue(gateway.reserved)
                self.assertGreaterEqual(state["after_record_sources"], 2)


if __name__ == '__main__': unittest.main()

