"""Synthetic actual cinema entry points; no real provider transport or approval."""
from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cinema_provider as cinema
import paid_request_guard as guard
from test_paid_executor import ENV, SyntheticGateway


class Response(io.BytesIO):
    headers = {}
    def __enter__(self): return self
    def __exit__(self, *args): self.close()


class CinemaTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, ENV, clear=True); self.env.start()
        self.source = patch.object(guard, "executor_source_sha", return_value="a" * 40); self.source.start()
        self.cinema_source = patch.object(cinema, "executor_source_sha", return_value="a" * 40); self.cinema_source.start()
        cinema.bind_sources({"program": "SYNTHETIC", "prompt": "synthetic"}, {"status": "SYNTHETIC-NOT-SPEND-AUTHORITY"})
    def tearDown(self):
        self.cinema_source.stop(); self.source.stop(); self.env.stop()
        guard._active.clear(); cinema._videos.clear(); cinema._sources = None
    def video(self): return cinema.create_video("SYNTHETIC-KEY", "synthetic-model", "1280x720", "4", "synthetic prompt")

    def test_markers_and_provider_key_cannot_authorize_a_paid_leaf(self):
        with patch.dict(os.environ, {"ASSET_FORGE_SPEND_WORKER_TOKEN": "", "ASSET_FORGE_PAID_RUN_AUTHORIZED": "1"}), patch.object(guard.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): self.video()
            opener.assert_not_called()

    def test_program_input_is_required_before_any_gateway_or_provider(self):
        cinema._sources = None
        with patch.object(guard, "_gateway") as gateway:
            with self.assertRaises(guard.PaidRequestUnauthorized): self.video()
            gateway.assert_not_called()

    def test_one_exact_frozen_multipart_post_retains_an_unreconciled_hold(self):
        gateway = SyntheticGateway()
        with patch.object(guard, "_gateway", gateway), patch.object(guard.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = Response(b'{"id":"video_SYNTHETIC"}')
            self.assertEqual(self.video()["id"], "video_SYNTHETIC")
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), "POST"); self.assertEqual(request.full_url, cinema.API + "/videos")
            self.assertIn(b'name="prompt"', request.data)
            self.assertEqual(guard.request_digest(request.full_url, request.data), gateway.env["job"]["executor"]["request_sha256"])
            self.assertTrue(gateway.reserved)
            self.assertFalse(gateway.env["job"]["attempts"][0]["charges_reconciled"])
            self.assertEqual(opener.return_value.open.call_count, 1)

    def test_lost_transport_is_observed_once_and_never_retried(self):
        gateway = SyntheticGateway()
        with patch.object(guard, "_gateway", gateway), patch.object(guard.urllib.request, "build_opener") as opener:
            opener.return_value.open.side_effect = OSError("SYNTHETIC uncertain charge")
            with self.assertRaises(OSError): self.video()
            self.assertTrue(gateway.reserved); self.assertEqual(opener.return_value.open.call_count, 1)
            self.assertFalse(gateway.env["job"]["attempts"][0]["charges_reconciled"])

    def test_observation_cannot_authorize_execution_or_settle_the_hold(self):
        for changed_field, value in [("provider_call_authorized", True), ("execution_performed", True), ("reconciliation_required", False)]:
            gateway = SyntheticGateway()
            def observed(action, **fields):
                result = gateway(action, **fields)
                if action == "record": result[changed_field] = value
                return result
            with patch.object(guard, "_gateway", observed), patch.object(guard.urllib.request, "build_opener") as opener:
                opener.return_value.open.return_value = Response(b'{"id":"video_SYNTHETIC"}')
                with self.assertRaises(guard.PaidRequestUnauthorized): self.video()
                self.assertTrue(gateway.reserved); self.assertFalse(cinema.has_video("video_SYNTHETIC"))
            guard._active.clear()

    def test_actual_extra_provenance_rejects_each_dirty_cinema_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in cinema.SOURCE_PATHS:
                source = root / relative; source.parent.mkdir(parents=True, exist_ok=True); source.write_text("# SYNTHETIC SOURCE\n")
            def git(*args): return subprocess.run(["git", "-C", directory, *args], capture_output=True, text=True, check=True)
            git("init", "--quiet"); git("add", "."); git("-c", "user.name=Synthetic Fixture", "-c", "user.email=synthetic@example.invalid", "commit", "-qm", "Synthetic source, not deployment proof")
            self.cinema_source.stop()
            try:
                with patch.object(cinema, "__file__", str(root / cinema.SOURCE_PATHS[0])):
                    self.assertEqual(cinema.executor_source_sha(), "a" * 40)
                    for relative in cinema.SOURCE_PATHS:
                        source = root / relative; source.write_text("# SOURCE CHANGED\n")
                        with self.assertRaises(guard.PaidRequestUnauthorized): cinema.executor_source_sha()
                        source.write_text("# SYNTHETIC SOURCE\n")
                    git("rm", "--cached", cinema.SOURCE_PATHS[-1])
                    with self.assertRaises(guard.PaidRequestUnauthorized): cinema.executor_source_sha()
            finally: self.cinema_source.start()

    def test_delayed_reserve_never_restarts_runtime_or_dispatches(self):
        gateway, monotonic = SyntheticGateway(), [1000.0]
        def delayed(action, **fields):
            result = gateway(action, **fields)
            if action == "reserve": monotonic[0] += 3
            return result
        with patch.object(guard, "_gateway", delayed), patch.object(guard.time, "monotonic", side_effect=lambda: monotonic[0]), patch.object(guard.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestLimitReached): self.video()
            self.assertTrue(gateway.reserved); opener.assert_not_called()

    def test_expiry_during_body_or_outcome_cannot_return_an_admitted_task(self):
        for boundary in ["body", "record"]:
            gateway, monotonic = SyntheticGateway(), [1000.0]
            response = Response(b'{"id":"video_SYNTHETIC"}')
            original_read = response.read
            def read(size):
                if boundary == "body": monotonic[0] += 3
                return original_read(size)
            response.read = read
            def observed(action, **fields):
                result = gateway(action, **fields)
                if boundary == "record" and action == "record": monotonic[0] += 3
                return result
            with patch.object(guard, "_gateway", observed), patch.object(guard.time, "monotonic", side_effect=lambda: monotonic[0]), patch.object(guard.urllib.request, "build_opener") as opener:
                opener.return_value.open.return_value = response
                with self.assertRaises(guard.PaidRequestLimitReached): self.video()
                self.assertTrue(gateway.reserved); self.assertEqual(opener.return_value.open.call_count, 1)

    def test_program_drift_during_reservation_blocks_the_adjacent_post(self):
        gateway = SyntheticGateway()
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "reserve": cinema.bind_sources({"program": "changed"}, {})
            return result
        with patch.object(guard, "_gateway", changed), patch.object(guard.urllib.request, "build_opener") as opener:
            with self.assertRaises(guard.PaidRequestUnauthorized): self.video()
            self.assertTrue(gateway.reserved); opener.assert_not_called()

    def test_audio_exact_json_and_output_share_the_same_admission(self):
        gateway = SyntheticGateway()
        with tempfile.TemporaryDirectory() as directory, patch.object(guard, "_gateway", gateway), patch.object(guard.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = Response(b"SYNTHETIC AUDIO")
            output = Path(directory) / "speech.wav"
            result = cinema.create_speech("SYNTHETIC-KEY", "synthetic-model", "synthetic-voice", "synthetic text", output, "synthetic instructions")
            self.assertEqual(output.read_bytes(), b"SYNTHETIC AUDIO"); self.assertFalse(result["charges_reconciled"])
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, cinema.API + "/audio/speech")
            self.assertEqual(json.loads(request.data)["voice"], "synthetic-voice")

    def test_expired_audio_does_not_publish_output_or_delete_an_existing_file(self):
        gateway, monotonic = SyntheticGateway(), [1000.0]
        def changed(action, **fields):
            result = gateway(action, **fields)
            if action == "record": monotonic[0] += 3
            return result
        with tempfile.TemporaryDirectory() as directory, patch.object(guard, "_gateway", changed), patch.object(guard.time, "monotonic", side_effect=lambda: monotonic[0]), patch.object(guard.urllib.request, "build_opener") as opener:
            opener.return_value.open.return_value = Response(b"SYNTHETIC AUDIO")
            output = Path(directory) / "speech.wav"; output.write_bytes(b"existing")
            with self.assertRaises(guard.PaidRequestLimitReached): cinema.create_speech("SYNTHETIC-KEY", "synthetic-model", "synthetic", "text", output, "instructions")
            self.assertEqual(output.read_bytes(), b"existing"); self.assertTrue(gateway.reserved)

    def test_actual_four_creator_entrypoints_cannot_bypass_the_shared_gateway(self):
        root = Path(__file__).resolve().parents[2]
        for name in ["generate_before_rest_world_cinematic_motion", "generate_before_rest_world_full_master_t1", "generate_built_from_survival_hero_cinema", "resume_built_from_survival_hero_cinema"]:
            spec = importlib.util.spec_from_file_location(name, root / "scripts" / (name + ".py")); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
            fn = getattr(module, "create_video", getattr(module, "create_video_once", None))
            with patch.dict(os.environ, {"ASSET_FORGE_SPEND_WORKER_TOKEN": ""}), patch.object(module.subprocess, "run") as curl:
                with self.assertRaises(guard.PaidRequestUnauthorized): fn("SYNTHETIC", "synthetic", "1280x720", "4", "synthetic")
                curl.assert_not_called()

    def test_actual_finite_time_cli_cannot_turn_a_marker_into_paid_admission(self):
        root = Path(__file__).resolve().parents[2]
        spec = importlib.util.spec_from_file_location("protected_cinema_cli", root / "scripts/run_protected_cinema.py"); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "marker.json"; marker.write_text('{"maximumProviderCalls":1,"status":"SYNTHETIC"}')
            argv = ["run_protected_cinema.py", "--authorization", str(marker), "--model", "synthetic", "--size", "1280x720", "--seconds", "8", "--prompt", "synthetic", "--output-root", directory, "--output-name", "clip.mp4"]
            with patch.object(sys, "argv", argv), patch.dict(os.environ, {"OPENAI_API_KEY": "SYNTHETIC", "ASSET_FORGE_SPEND_WORKER_TOKEN": ""}), patch.object(guard.urllib.request, "build_opener") as opener:
                with self.assertRaises(guard.PaidRequestUnauthorized): module.main()
                opener.assert_not_called(); self.assertFalse((Path(directory) / "clip.mp4").exists())

    def test_actual_finite_time_cli_persists_only_the_same_admitted_task(self):
        root = Path(__file__).resolve().parents[2]
        spec = importlib.util.spec_from_file_location("protected_cinema_cli", root / "scripts/run_protected_cinema.py"); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "marker.json"; marker.write_text('{"maximumProviderCalls":1,"status":"SYNTHETIC"}')
            argv = ["run_protected_cinema.py", "--authorization", str(marker), "--model", "synthetic", "--size", "1280x720", "--seconds", "8", "--prompt", "synthetic", "--output-root", directory, "--output-name", "clip.mp4"]
            gateway = SyntheticGateway()
            with patch.object(sys, "argv", argv), patch.dict(os.environ, {"OPENAI_API_KEY": "SYNTHETIC"}), patch.object(guard, "_gateway", gateway), patch.object(guard.urllib.request, "build_opener") as opener:
                opener.return_value.open.side_effect = [Response(b'{"id":"video_SYNTHETIC"}'), Response(b'{"id":"video_SYNTHETIC","status":"completed"}'), Response(b"SYNTHETIC CLIP")]
                module.main()
                self.assertEqual([call.args[0].get_method() for call in opener.return_value.open.call_args_list], ["POST", "GET", "GET"])
                self.assertEqual((Path(directory) / "clip.mp4").read_bytes(), b"SYNTHETIC CLIP")
                receipt = json.loads((Path(directory) / "spend-observation.json").read_text())
                self.assertFalse(receipt["chargesReconciled"]); self.assertIsNone(receipt["actualSpendUsd"]); self.assertTrue(gateway.reserved)

    def test_derived_finite_time_program_keeps_private_lifecycle_closed_and_nonprivate_gateway_required(self):
        root = Path(__file__).resolve().parents[2]
        spec = importlib.util.spec_from_file_location("finite_time", root / "film_foundry/finite_time/generate-openai-production.py"); module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        with patch.object(guard, "_gateway") as gateway:
            with self.assertRaisesRegex(guard.PaidRequestUnauthorized, "current protected lifecycle"): module.create_video("SYNTHETIC", "synthetic", "1280x720", "8", "synthetic", Path("private.jpg"))
            gateway.assert_not_called()
        with patch.dict(os.environ, {"ASSET_FORGE_SPEND_WORKER_TOKEN": ""}), patch.object(module.subprocess, "run") as curl:
            with self.assertRaises(guard.PaidRequestUnauthorized): module.create_video("SYNTHETIC", "synthetic", "1280x720", "8", "synthetic", None)
            curl.assert_not_called()


if __name__ == "__main__": unittest.main()
