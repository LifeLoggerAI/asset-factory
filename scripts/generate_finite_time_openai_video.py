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


def choose_duration(seconds: int) -> int:
    # OpenAI video jobs currently allow 4/8/12 seconds. Generate the smallest
    # supported source clip not shorter than the certified editorial duration;
    # editorial trims the accepted source to the certified shot window.
    for candidate in (4, 8, 12):
        if seconds <= candidate:
            return candidate
    raise ValueError(f"shot duration {seconds}s exceeds one source clip")


def build_prompt(shot: dict[str, Any], target_seconds: int) -> str:
    return (
        "FINITE TIME autobiographical short film. Photoreal memory-realism, natural skin, lived-in East Texas environments, "
        "believable body mechanics, restrained cinematic camera, practical light, subtle atmospheric depth, no text, no logos, "
        "no slideshow behavior, no frozen subjects, no plastic AI look. Preserve the described event without inventing facts. "
        f"Shot {shot['id']} ({target_seconds}s editorial window). Title: {shot.get('title','')}. "
        f"Visual intent: {shot.get('visual','')}. Accessibility intent: {shot.get('audioDescription','')}. "
        "Generate continuous physically believable motion with an emotionally motivated camera move."
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
    p.add_argument("--story-manifest", required=True)
    p.add_argument("--edit-plan", required=True)
    p.add_argument("--authority", required=True)
    p.add_argument("--private-reference-map")
    p.add_argument("--output-root", required=True)
    p.add_argument("--model", default="sora-2", choices=sorted(ALLOWED_MODELS))
    p.add_argument("--size", default="1280x720")
    args = p.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY missing")

    story_path = Path(args.story_manifest)
    edit_path = Path(args.edit_plan)
    authority_path = Path(args.authority)
    story = json.loads(story_path.read_text())
    edit = json.loads(edit_path.read_text())
    authority = json.loads(authority_path.read_text())

    if authority.get("sourceCommit") != EXPECTED_SOURCE:
        raise ValueError("execution authority source commit drift")
    if not authority.get("founderAuthorization", {}).get("paidOpenAIExecutionAuthorized"):
        raise ValueError("paid OpenAI execution not authorized")
    if authority.get("releaseBoundary", {}).get("publicReleaseAuthorized") is not False:
        raise ValueError("public release must remain false")

    shots = story.get("shots")
    if not isinstance(shots, list) or len(shots) != EXPECTED_SHOTS:
        raise ValueError("exactly 30 certified shots required")
    durations = edit.get("shotDurations", {})
    if set(durations) != {shot["id"] for shot in shots}:
        raise ValueError("edit-plan shot set mismatch")
    if sum(int(v) for v in durations.values()) != EXPECTED_SECONDS:
        raise ValueError("certified editorial duration must equal 180 seconds")

    refs = load_reference_map(Path(args.private_reference_map) if args.private_reference_map else None)
    out = Path(args.output_root)
    clips = out / "clips"
    clips.mkdir(parents=True, exist_ok=True)
    receipt_path = out / "provider-receipt.json"
    receipt: dict[str, Any] = {
        "schemaVersion": "finite-time-openai-provider-receipt-v1",
        "sourceCommit": EXPECTED_SOURCE,
        "startedAt": now(),
        "model": args.model,
        "size": args.size,
        "storyManifestSha256": sha256(story_path),
        "editPlanSha256": sha256(edit_path),
        "authoritySha256": sha256(authority_path),
        "privateReferenceMapPresent": bool(args.private_reference_map),
        "publicReleaseAuthorized": False,
        "providerCallsExecuted": 0,
        "generatedSeconds": 0,
        "videos": [],
        "status": "running"
    }

    try:
        for shot in shots:
            shot_id = shot["id"]
            target = int(durations[shot_id])
            source_seconds = choose_duration(target)
            ref_spec = refs.get(shot_id)
            reference: Path | None = None
            if ref_spec:
                if ref_spec.get("clearedForProviderSubmission") is not True:
                    raise RuntimeError(f"{shot_id}: private reference exists but is not cleared for provider submission")
                raw_path = ref_spec.get("path")
                if not raw_path:
                    raise RuntimeError(f"{shot_id}: cleared private reference has no materialized path")
                reference = Path(raw_path)
                if not reference.is_file():
                    raise RuntimeError(f"{shot_id}: materialized private reference missing")
            elif ref_spec is None and shot_id in {"ft-fl-001", "ft-fl-002", "ft-fl-003", "ft-fl-004", "ft-fl-005", "ft-fl-006", "ft-fl-009", "ft-fl-010", "ft-fl-011", "ft-fl-016", "ft-fl-018", "ft-fl-020", "ft-fl-021", "ft-fl-022", "ft-fl-023", "ft-fl-024", "ft-fl-029", "ft-fl-030"}:
                raise RuntimeError(f"{shot_id}: recurring identifiable-character shot requires a cleared private reference package")

            prompt = build_prompt(shot, target)
            created = create_video(api_key, args.model, args.size, source_seconds, prompt, reference)
            receipt["providerCallsExecuted"] += 1
            receipt["generatedSeconds"] += source_seconds
            video_id = created["id"]
            completed = wait_video(api_key, video_id)
            clip_path = clips / f"{shot_id}.mp4"
            download_video(api_key, video_id, clip_path)
            receipt["videos"].append({
                "shotId": shot_id,
                "videoId": video_id,
                "targetEditorialSeconds": target,
                "generatedSeconds": source_seconds,
                "referenceUsed": reference is not None,
                "status": completed.get("status"),
                "model": completed.get("model", args.model),
                "size": completed.get("size", args.size),
                "sha256": sha256(clip_path),
                "bytes": clip_path.stat().st_size
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

    print(json.dumps({"status": receipt["status"], "calls": receipt["providerCallsExecuted"], "generatedSeconds": receipt["generatedSeconds"]}, sort_keys=True))


if __name__ == "__main__":
    main()
