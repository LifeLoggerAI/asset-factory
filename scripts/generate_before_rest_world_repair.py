#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "image_asset_generator"
sys.path.insert(0, str(GEN))

import paid_request_guard  # noqa: E402
import provider_renderer  # noqa: E402

EXPECTED_AUTHORITY = "LifeLoggerAI/urai-studio#59"
EXPECTED_PROJECT = "before-the-rest-of-the-world"
EXPECTED_REPAIRS = 2


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain an object")
    return value


def validate(manifest: dict[str, Any], auth: dict[str, Any], manifest_path: Path) -> list[dict[str, Any]]:
    for payload, label in ((manifest, "manifest"), (auth, "authorization")):
        if payload.get("schemaVersion") != "1.0.0":
            raise ValueError(f"{label} schema drift")
        if payload.get("programAuthority") != EXPECTED_AUTHORITY:
            raise ValueError(f"{label} authority drift")
        if payload.get("projectId") != EXPECTED_PROJECT:
            raise ValueError(f"{label} project drift")
        if payload.get("provider") != "openai":
            raise ValueError(f"{label} provider drift")
    if auth.get("manifestPath") != manifest_path.as_posix():
        raise ValueError("authorization manifest path drift")
    if int(auth.get("maximumProviderCalls", 0)) != EXPECTED_REPAIRS:
        raise ValueError("authorization must permit exactly two calls")
    if str(auth.get("maximumReservedCostUsd")) != "2.00":
        raise ValueError("authorization cost must remain 2.00")
    for key in ("promotionAuthorized", "deploymentAuthorized", "publicReleaseAuthorized", "fullFilmCompletionAuthorized"):
        if auth.get(key) is not False or manifest.get(key) is not False:
            raise ValueError(f"{key} must remain false")
    repairs = manifest.get("repairs")
    if not isinstance(repairs, list) or len(repairs) != EXPECTED_REPAIRS:
        raise ValueError("manifest must contain exactly two repairs")
    names = []
    for repair in repairs:
        if not isinstance(repair, dict):
            raise ValueError("repair must be an object")
        name = repair.get("name")
        if not isinstance(name, str) or not name:
            raise ValueError("repair name missing")
        names.append(name)
        if repair.get("aspect_ratio") != "16:9" or repair.get("alpha") is not False:
            raise ValueError(f"{name} geometry drift")
        if not isinstance(repair.get("prompt"), str) or len(repair["prompt"]) < 120:
            raise ValueError(f"{name} prompt too short")
    if len(set(names)) != EXPECTED_REPAIRS:
        raise ValueError("repair names must be unique")
    return repairs


def make_entry(repair: dict[str, Any], model: str) -> dict[str, Any]:
    return {
        "name": repair["name"],
        "category": repair["category"],
        "prompt": repair["prompt"],
        "aspect_ratio": repair["aspect_ratio"],
        "alpha": False,
        "quality": repair.get("quality", "high"),
        "prompt_version": "before-rest-world-repair-v2",
        "tags": ["private-film", "proof-repair", "before-rest-world"],
        "model": model,
    }


def render(repair: dict[str, Any], model: str, long_edge: int):
    entry = make_entry(repair, model)
    width, height = provider_renderer.target_dimensions(entry, long_edge)
    reservation = paid_request_guard.reserve(provider="openai", model=model, asset=repair["name"], request_size=f"{width}x{height}")
    attempt_id = str(reservation["attemptId"])
    try:
        result = provider_renderer.render_with_provider(entry, long_edge)
        paid_request_guard.record(attempt_id, status="succeeded", request_id=str(result.metadata.get("provider_request_id") or "") or None)
        return result, reservation
    except Exception as exc:
        paid_request_guard.record(attempt_id, status="failed", error=str(exc))
        raise


def contact_sheet(rows: list[dict[str, Any]], output: Path) -> None:
    thumb_w, thumb_h, margin, label_h = 768, 432, 32, 56
    sheet = Image.new("RGB", (thumb_w + margin * 2, len(rows) * (thumb_h + label_h + margin) + margin), (12, 14, 20))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, row in enumerate(rows):
        x = margin
        y = margin + index * (thumb_h + label_h + margin)
        with Image.open(row["sourcePath"]) as image:
            frame = image.convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(frame, (x, y))
        draw.text((x, y + thumb_h + 15), f"{index + 1:02d}  {row['name']} replaces {row['replaces']}", fill=(235, 235, 240), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, "JPEG", quality=92, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    authorization_path = Path(args.authorization)
    output_root = Path(args.output_root)
    manifest = load(manifest_path)
    auth = load(authorization_path)
    repairs = validate(manifest, auth, manifest_path)
    model = str(manifest.get("model") or "gpt-image-2")
    long_edge = int(manifest.get("targetLongEdge") or 1536)
    source_dir = output_root / "sources"
    preview_dir = output_root / "previews"
    source_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict[str, Any]] = []
    status = "passed"
    error = None
    started = now()
    try:
        for repair in repairs:
            result, reservation = render(repair, model, long_edge)
            source = source_dir / f"{repair['name']}.png"
            preview = preview_dir / f"{repair['name']}.webp"
            result.image.convert("RGB").save(source, "PNG", optimize=True)
            result.image.convert("RGB").save(preview, "WEBP", quality=95, method=6)
            rows.append({
                "name": repair["name"],
                "replaces": repair["replaces"],
                "reason": repair["reason"],
                "sourcePath": source.as_posix(),
                "previewPath": preview.as_posix(),
                "sourceSha256": sha256_file(source),
                "previewSha256": sha256_file(preview),
                "width": result.image.width,
                "height": result.image.height,
                "provider": result.metadata.get("provider"),
                "providerModel": result.metadata.get("provider_model"),
                "providerRequestId": result.metadata.get("provider_request_id"),
                "attemptId": reservation.get("attemptId"),
            })
    except Exception as exc:
        status = "failed"
        error = str(exc)

    budget = paid_request_guard.snapshot()
    receipt = {
        "schemaVersion": "1.0.0",
        "programAuthority": EXPECTED_AUTHORITY,
        "projectId": EXPECTED_PROJECT,
        "sourceRunId": manifest.get("sourceRunId"),
        "sourceArtifactId": manifest.get("sourceArtifactId"),
        "status": status,
        "startedAt": started,
        "finishedAt": now(),
        "manifestPath": manifest_path.as_posix(),
        "manifestSha256": sha256_file(manifest_path),
        "authorizationPath": authorization_path.as_posix(),
        "authorizationSha256": sha256_file(authorization_path),
        "expected": EXPECTED_REPAIRS,
        "generated": len(rows),
        "failed": EXPECTED_REPAIRS - len(rows),
        "providerCallsExecuted": budget.get("providerCallsExecuted"),
        "reservedEstimatedCostUsd": budget.get("reservedEstimatedCostUsd"),
        "maximumAuthorizedCostUsd": "2.00",
        "promotionAuthorized": False,
        "deploymentAuthorized": False,
        "publicReleaseAuthorized": False,
        "assets": rows,
        "error": error,
    }
    receipt_path = output_root / "before-rest-world-repair-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if rows:
        contact_sheet(rows, output_root / "before-rest-world-repair-contact-sheet.jpg")
    print(json.dumps({key: receipt[key] for key in ("status", "expected", "generated", "failed", "providerCallsExecuted", "reservedEstimatedCostUsd")}, sort_keys=True))
    if status != "passed" or len(rows) != EXPECTED_REPAIRS:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
