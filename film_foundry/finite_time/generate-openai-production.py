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
EXPECTED_SOURCE = "2f61af8442b4b20e8b0e4638ca4119a17969c6d4"
EXPECTED_SHOTS = 30
EXPECTED_SECONDS = 180
ALLOWED_MODELS = {"sora-2", "sora-2-pro"}
ALLOWED_SECONDS = {4, 8, 12}
IDENTIFIABLE_CHARACTER_SHOTS = {
    "ft-fl-001", "ft-fl-002", "ft-fl-003", "ft-fl-004", "ft-fl-005", "ft-fl-006",
    "ft-fl-009", "ft-fl-010", "ft-fl-011", "ft-fl-016", "ft-fl-018", "ft-fl-020",
    "ft-fl-021", "ft-fl-022", "ft-fl-023", "ft-fl-024", "ft-fl-029", "ft-fl-030"
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, capture_output=capture)


def curl_json(args: list[str]) -> dict[str, Any]:
    cp = run(["curl", "--fail-with-body", "--silent", "--show-error", *args])
    return json.loads(cp.stdout)


def create_video(api_key: str, model: str, size: str, seconds: int, prompt: str, reference: Path | None) -> dict[str, Any]:
    args = [
        f"{API}/videos",
        "-H", f"Authorization: Bearer {api_key}",
        "-F", f"model={model}",
        "-F", f"size={size}",
        "-F", f"seconds={seconds}",
        "-F", f"prompt={prompt}",
    ]
    if reference is not None:
        args.extend(["-F", f"input_reference=@{reference}"])
    return curl_json(args)


def wait_video(api_key: str, video_id: str, timeout_seconds: int = 3600) -> dict[str, Any]:
    start = time.monotonic()
    while True:
        data = curl_json([f"{API}/videos/{video_id}", "-H", f"Authorization: Bearer {api_key}"])
        status = data.get("status")
        print(json.dumps({"video": video_id, "status": status, "progress": data.get("progress")}), flush=True)
        if status == "completed":
            return data
        if status in {"failed", "cancelled"}:
            raise RuntimeError(f"video {video_id} ended with status {status}: {data}")
        if time.monotonic() - start > timeout_seconds:
            raise TimeoutError(f"video {video_id} timed out")
        time.sleep(20)


def download_video(api_key: str, video_id: str, output: Path) -> None:
    run([
        "curl", "--fail-with-body", "--location", "--silent", "--show-error",
        f"{API}/videos/{video_id}/content",
        "-H", f"Authorization: Bearer {api_key}",
        "--output", str(output),
    ], capture=False)


def choose_source_duration(editorial_seconds: int) -> int:
    for candidate in (4, 8, 12):
        if editorial_seconds <= candidate:
            return candidate
    raise ValueError(f"editorial shot {editorial_seconds}s exceeds one supported Sora source clip")


def build_prompt(shot: dict[str, Any], editorial_seconds: int) -> str:
    return (
        "FINITE TIME autobiographical short film. Photoreal memory-realism in East Texas, natural skin, believable hair and fabric, "
        "physically credible body mechanics, lived-in practical environments, restrained motivated camera, subtle film grain, coherent lighting, "
        "realistic temporal consistency, no text overlays, no readable brands, no plastic AI aesthetic. Preserve autobiographical restraint and do not invent facts or dialogue. "
        f"Shot {shot['id']}; editorial window {editorial_seconds} seconds. Title: {shot.get('title','')}. "
        f"Visual intent: {shot.get('visual','')}. Accessibility intent: {shot.get('audioDescription','')}. "
        "Generate continuous moving footage with emotionally motivated camera movement and physically believable interaction."
    )


def load_reference_map(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != "finite-time-private-reference-map-v1":
        raise ValueError("private reference map schema mismatch")
    return data.get("shots", {})


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", required=True)
    p.add_argument("--edit-plan", required=True)
    p.add_argument("--authorization", required=True)
    p.add_argument("--private-reference-map")
    p.add_argument("--output-root", required=True)
    p.add_argument("--start-shot", type=int, default=1)
    p.add_argument("--end-shot", type=int, default=30)
    args = p.parse_args()

    story_path = Path(args.manifest)
    edit_path = Path(args.edit_plan)
    auth_path = Path(args.authorization)
    story = json.loads(story_path.read_text())
    edit = json.loads(edit_path.read_text())
    auth = json.loads(auth_path.read_text())

    if auth.get("sourceCommit") != EXPECTED_SOURCE:
        raise ValueError("source authority drift")
    if not auth.get("release", {}).get("paidGenerationAuthorized"):
        raise ValueError("paid generation not authorized")
    if auth.get("release", {}).get("publicReleaseAuthorized") is not False:
        raise ValueError("public release must remain false")
    if auth.get("privacy", {}).get("semanticKeysOnly") is not True:
        raise ValueError("private reference boundary missing")

    shots = story.get("shots", [])
    if len(shots) != EXPECTED_SHOTS:
        raise ValueError("exactly 30 shots required")
    if not (1 <= args.start_shot <= args.end_shot <= EXPECTED_SHOTS):
        raise ValueError("invalid shot range")

    durations = edit.get("shotDurations", {})
    if set(durations) != {shot["id"] for shot in shots}:
        raise ValueError("edit-plan shot set mismatch")
    if sum(int(v) for v in durations.values()) != EXPECTED_SECONDS:
        raise ValueError("certified editorial duration must equal 180 seconds")

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY missing")
    model = os.environ.get("FINITE_TIME_VIDEO_MODEL", auth["provider"]["primaryModel"]).strip()
    if model not in ALLOWED_MODELS:
        raise ValueError("unsupported video model")
    size = os.environ.get("FINITE_TIME_VIDEO_SIZE", "1280x720").strip()

    refs = load_reference_map(Path(args.private_reference_map) if args.private_reference_map else None)
    out = Path(args.output_root)
    clips = out / "clips"
    clips.mkdir(parents=True, exist_ok=True)
    receipt_path = out / "provider-receipt.json"
    receipt: dict[str, Any] = {
        "schemaVersion": "finite-time-provider-receipt-v2",
        "sourceCommit": EXPECTED_SOURCE,
        "startedAt": now(),
        "model": model,
        "size": size,
        "providerCallsExecuted": 0,
        "generatedSeconds": 0,
        "videos": [],
        "status": "running",
        "publicReleaseAuthorized": False,
        "privateSourcePointersRetained": False,
        "storyManifestSha256": sha256(story_path),
        "editPlanSha256": sha256(edit_path),
        "authorizationSha256": sha256(auth_path),
    }

    try:
        for index in range(args.start_shot - 1, args.end_shot):
            shot = shots[index]
            shot_id = shot["id"]
            editorial_seconds = int(durations[shot_id])
            source_seconds = choose_source_duration(editorial_seconds)
            ref_spec = refs.get(shot_id)
            reference: Path | None = None

            if shot_id in IDENTIFIABLE_CHARACTER_SHOTS and not ref_spec:
                raise RuntimeError(f"{shot_id}: cleared private reference package required before provider submission")
            if ref_spec:
                if ref_spec.get("clearedForProviderSubmission") is not True:
                    raise RuntimeError(f"{shot_id}: private reference is not cleared for provider submission")
                raw_path = ref_spec.get("path")
                if not raw_path:
                    raise RuntimeError(f"{shot_id}: cleared private reference has no materialized path")
                reference = Path(raw_path)
                if not reference.is_file():
                    raise RuntimeError(f"{shot_id}: materialized private reference missing")

            created = create_video(key, model, size, source_seconds, build_prompt(shot, editorial_seconds), reference)
            receipt["providerCallsExecuted"] += 1
            receipt["generatedSeconds"] += source_seconds
            video_id = created["id"]
            completed = wait_video(key, video_id)
            target = clips / f"{shot_id}.mp4"
            download_video(key, video_id, target)
            receipt["videos"].append({
                "shotId": shot_id,
                "videoId": video_id,
                "status": completed.get("status"),
                "model": completed.get("model", model),
                "editorialSeconds": editorial_seconds,
                "generatedSeconds": source_seconds,
                "size": completed.get("size", size),
                "referenceUsed": reference is not None,
                "sha256": sha256(target),
                "bytes": target.stat().st_size,
            })
            receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
        receipt["status"] = "generated-awaiting-literal-qc"
    except Exception as exc:
        receipt["status"] = "failed-closed"
        receipt["error"] = str(exc)
        raise
    finally:
        receipt["finishedAt"] = now()
        receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    print(json.dumps({"status": receipt["status"], "calls": receipt["providerCallsExecuted"], "videos": len(receipt["videos"]), "generatedSeconds": receipt["generatedSeconds"]}, sort_keys=True))


if __name__ == "__main__":
    main()
