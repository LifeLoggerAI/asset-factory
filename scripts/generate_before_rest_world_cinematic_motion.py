#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'image_asset_generator'))
import cinema_provider

API = "https://api.openai.com/v1"
EXPECTED_AUTHORITY = "LifeLoggerAI/asset-factory#224"
EXPECTED_SHOTS = 6


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, capture_output=capture)


def curl_json(args: list[str]) -> dict[str, Any]:
    cp = run(["curl", "--fail-with-body", "--silent", "--show-error", *args])
    return json.loads(cp.stdout)


def create_video(api_key: str, model: str, size: str, seconds: str, prompt: str) -> dict[str, Any]:
    return cinema_provider.create_video(api_key, str(model), str(size), str(seconds), str(prompt))


def wait_video(api_key: str, video_id: str, timeout_seconds: int = 3600) -> dict[str, Any]:
    return cinema_provider.wait_video(api_key, video_id, timeout_seconds)


def download_video(api_key: str, video_id: str, output: Path) -> None:
    return cinema_provider.download_video(api_key, video_id, output)


def create_speech(api_key: str, model: str, voice: str, text: str, output: Path) -> dict[str, Any]:
    return cinema_provider.create_speech(api_key, str(model), str(voice), str(text), output, "Speak as a calm, confident prestige-documentary narrator. Emotionally restrained, intelligent, grounded, never salesy. Deliberate pace with cinematic pauses. Pronounce UrAi as 'your eye'.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    auth_path = Path(args.authorization)
    out = Path(args.output_root)
    out.mkdir(parents=True, exist_ok=True)
    clips_dir = out / "clips"
    clips_dir.mkdir(exist_ok=True)

    manifest = json.loads(manifest_path.read_text())
    auth = json.loads(auth_path.read_text())
    cinema_provider.bind_sources(manifest, auth)
    if manifest.get("executionAuthority") != EXPECTED_AUTHORITY:
        raise ValueError("manifest execution authority drift")
    if auth.get("executionAuthority") != EXPECTED_AUTHORITY:
        raise ValueError("authorization authority drift")
    shots = manifest.get("shots")
    if not isinstance(shots, list) or len(shots) != EXPECTED_SHOTS:
        raise ValueError("exactly six shots required")
    if int(auth.get("maximumProviderCalls", 0)) != 7:
        raise ValueError("authorization must permit exactly seven calls")
    if auth.get("publicReleaseAuthorized") is not False:
        raise ValueError("public release must remain false")

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY missing")

    receipt: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "executionAuthority": EXPECTED_AUTHORITY,
        "startedAt": now(),
        "manifestSha256": sha256(manifest_path),
        "authorizationSha256": sha256(auth_path),
        "publicReleaseAuthorized": False,
        "providerCallsAuthorized": 7,
        "providerCallsExecuted": 0,
        "chargesReconciled": False,
        "actualSpendUsd": None,
        "videos": [],
        "speech": None,
        "status": "running",
    }
    receipt_path = out / "cinematic-motion-receipt.json"

    try:
        for shot in shots:
            created = create_video(api_key, manifest["videoModel"], manifest["videoSize"], manifest["secondsPerShot"], shot["prompt"])
            receipt["providerCallsExecuted"] += 1
            video_id = created["id"]
            completed = wait_video(api_key, video_id)
            clip_path = clips_dir / f"{shot['id']}.mp4"
            download_video(api_key, video_id, clip_path)
            receipt["videos"].append({
                "shotId": shot["id"],
                "videoId": video_id,
                "budgetAttemptId": completed["budget_attempt_id"],
                "budgetJobId": completed["budget_job_id"],
                "chargesReconciled": False,
                "status": completed.get("status"),
                "model": completed.get("model", manifest["videoModel"]),
                "seconds": completed.get("seconds", manifest["secondsPerShot"]),
                "size": completed.get("size", manifest["videoSize"]),
                "path": clip_path.as_posix(),
                "sha256": sha256(clip_path),
                "bytes": clip_path.stat().st_size,
            })
            receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

        speech_path = out / "narration.wav"
        speech_meta = create_speech(api_key, manifest["voiceModel"], manifest["voice"], manifest["narration"], speech_path)
        receipt["providerCallsExecuted"] += 1
        receipt["speech"] = {
            **speech_meta,
            "path": speech_path.as_posix(),
            "sha256": sha256(speech_path),
            "bytes": speech_path.stat().st_size,
        }
        receipt["status"] = "passed"
    except Exception as exc:
        receipt["status"] = "failed"
        receipt["error"] = str(exc)
        raise
    finally:
        receipt["finishedAt"] = now()
        receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    assert receipt["providerCallsExecuted"] == 7
    assert len(receipt["videos"]) == 6
    assert receipt["speech"]
    print(json.dumps({"status": receipt["status"], "calls": receipt["providerCallsExecuted"], "videos": len(receipt["videos"])}, sort_keys=True))


if __name__ == "__main__":
    main()
