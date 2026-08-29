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

API = "https://api.openai.com/v1"
EXPECTED_PROGRAM_REPOSITORY = "LifeLoggerAI/urai-studio"
EXPECTED_PROGRAM_SHA = "802f909ecad2bd000e4c8011a14bc3340fe88950"
EXPECTED_SHOTS = 5
MAX_CALLS = 5
MAX_RESERVED_SPEND_USD = "8.00"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(cmd: list[str], *, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, capture_output=capture)


def curl_json(args: list[str]) -> dict[str, Any]:
    completed = run(["curl", "--fail-with-body", "--silent", "--show-error", *args])
    return json.loads(completed.stdout)


def create_video(api_key: str, model: str, size: str, seconds: str, prompt: str) -> dict[str, Any]:
    return curl_json([
        f"{API}/videos",
        "-H", f"Authorization: Bearer {api_key}",
        "-F", f"model={model}",
        "-F", f"size={size}",
        "-F", f"seconds={seconds}",
        "-F", f"prompt={prompt}",
    ])


def wait_video(api_key: str, video_id: str, timeout_seconds: int = 3600) -> dict[str, Any]:
    started = time.monotonic()
    while True:
        data = curl_json([f"{API}/videos/{video_id}", "-H", f"Authorization: Bearer {api_key}"])
        status = str(data.get("status") or "")
        print(json.dumps({"video": video_id, "status": status, "progress": data.get("progress")}), flush=True)
        if status == "completed":
            return data
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"video {video_id} ended with status {status}: {data}")
        if time.monotonic() - started > timeout_seconds:
            raise TimeoutError(f"video {video_id} timed out")
        time.sleep(20)


def download_video(api_key: str, video_id: str, output: Path) -> None:
    run([
        "curl", "--fail-with-body", "--location", "--silent", "--show-error",
        f"{API}/videos/{video_id}/content", "-H", f"Authorization: Bearer {api_key}",
        "--output", str(output),
    ], capture=False)


def ffprobe(path: Path) -> dict[str, Any]:
    completed = run([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,duration",
        "-show_entries", "format=duration,size", "-of", "json", str(path),
    ])
    return json.loads(completed.stdout)


def make_review_reel(clips: list[Path], output: Path) -> None:
    concat_path = output.with_suffix(".txt")
    concat_path.write_text("".join(f"file '{clip.resolve().as_posix()}'\n" for clip in clips), encoding="utf-8")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path), "-c", "copy", str(output)], capture=False)


def validate(manifest: dict[str, Any], authorization: dict[str, Any], manifest_path: Path) -> list[dict[str, Any]]:
    if manifest.get("schemaVersion") != "1.0.0":
        raise ValueError("manifest schema version drift")
    if manifest.get("programAuthorityRepository") != EXPECTED_PROGRAM_REPOSITORY:
        raise ValueError("program repository authority drift")
    if manifest.get("programAuthoritySha") != EXPECTED_PROGRAM_SHA:
        raise ValueError("program SHA authority drift")
    if authorization.get("programAuthorityRepository") != EXPECTED_PROGRAM_REPOSITORY:
        raise ValueError("authorization program repository drift")
    if authorization.get("programAuthoritySha") != EXPECTED_PROGRAM_SHA:
        raise ValueError("authorization program SHA drift")
    if authorization.get("manifestPath") != manifest_path.as_posix():
        raise ValueError("authorization manifest path drift")
    if int(authorization.get("maximumProviderCalls", 0)) != MAX_CALLS:
        raise ValueError("authorization call limit drift")
    if str(authorization.get("maximumReservedCostUsd")) != MAX_RESERVED_SPEND_USD:
        raise ValueError("authorization spend limit drift")
    if authorization.get("automaticRetryAuthorized") is not False:
        raise ValueError("automatic retry must remain prohibited")
    if authorization.get("remixAuthorized") is not False:
        raise ValueError("remix must remain prohibited")
    if authorization.get("publicReleaseAuthorized") is not False:
        raise ValueError("public release must remain prohibited")
    if authorization.get("privateReviewAuthorized") is not True:
        raise ValueError("private review authorization required")
    shots = manifest.get("shots")
    if not isinstance(shots, list) or len(shots) != EXPECTED_SHOTS:
        raise ValueError(f"manifest must contain exactly {EXPECTED_SHOTS} shots")
    ids = [shot.get("id") for shot in shots]
    if ids != ["GEN-01", "GEN-02", "GEN-03", "GEN-04", "GEN-05"]:
        raise ValueError("hero shot identity/order drift")
    allowed = {"cinematic-recreation", "concept-visualization"}
    for shot in shots:
        if shot.get("classification") not in allowed:
            raise ValueError(f"invalid classification for {shot.get('id')}")
        if not isinstance(shot.get("prompt"), str) or len(shot["prompt"].strip()) < 180:
            raise ValueError(f"prompt too short for {shot.get('id')}")
    return shots


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    authorization_path = Path(args.authorization)
    output_root = Path(args.output_root)
    clips_dir = output_root / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    authorization = json.loads(authorization_path.read_text(encoding="utf-8"))
    shots = validate(manifest, authorization, manifest_path)

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY missing")

    receipt: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "projectId": manifest["projectId"],
        "programAuthorityRepository": EXPECTED_PROGRAM_REPOSITORY,
        "programAuthoritySha": EXPECTED_PROGRAM_SHA,
        "startedAt": now(),
        "manifestPath": manifest_path.as_posix(),
        "manifestSha256": sha256(manifest_path),
        "authorizationPath": authorization_path.as_posix(),
        "authorizationSha256": sha256(authorization_path),
        "providerCallsAuthorized": MAX_CALLS,
        "providerCallsExecuted": 0,
        "maximumReservedCostUsd": MAX_RESERVED_SPEND_USD,
        "automaticRetryAuthorized": False,
        "remixAuthorized": False,
        "publicReleaseAuthorized": False,
        "privateReviewAuthorized": True,
        "editorialPromotionAuthorized": False,
        "generatedImageryIsRecreation": True,
        "clips": [],
        "status": "running"
    }
    receipt_path = output_root / "hero-cinema-receipt.json"
    clip_paths: list[Path] = []

    try:
        for shot in shots:
            created = create_video(api_key, str(manifest["videoModel"]), str(manifest["videoSize"]), str(manifest["secondsPerSourceClip"]), str(shot["prompt"]))
            receipt["providerCallsExecuted"] += 1
            video_id = str(created["id"])
            completed = wait_video(api_key, video_id)
            output_path = clips_dir / f"{shot['id']}.mp4"
            download_video(api_key, video_id, output_path)
            entry = {
                "shotId": shot["id"], "name": shot["name"], "classification": shot["classification"],
                "targetEditorialDurationSeconds": shot["targetEditorialDurationSeconds"],
                "sourceClipSecondsRequested": manifest["secondsPerSourceClip"],
                "videoId": video_id, "status": completed.get("status"),
                "model": completed.get("model", manifest["videoModel"]),
                "sizeRequested": manifest["videoSize"], "path": output_path.as_posix(),
                "sha256": sha256(output_path), "bytes": output_path.stat().st_size, "probe": ffprobe(output_path)
            }
            receipt["clips"].append(entry)
            clip_paths.append(output_path)
            receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        reel_path = output_root / "hero-cinema-private-review-reel.mp4"
        make_review_reel(clip_paths, reel_path)
        receipt["reviewReel"] = {"path": reel_path.as_posix(), "sha256": sha256(reel_path), "bytes": reel_path.stat().st_size}
        receipt["status"] = "passed"
    except Exception as exc:
        receipt["status"] = "failed"
        receipt["error"] = str(exc)
        raise
    finally:
        receipt["finishedAt"] = now()
        receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if receipt["providerCallsExecuted"] != MAX_CALLS or len(receipt["clips"]) != EXPECTED_SHOTS:
        raise RuntimeError("bounded hero cinema result count mismatch")
    print(json.dumps({"status": receipt["status"], "calls": receipt["providerCallsExecuted"], "clips": len(receipt["clips"])}, sort_keys=True))


if __name__ == "__main__":
    main()
