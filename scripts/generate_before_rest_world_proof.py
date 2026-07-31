#!/usr/bin/env python3
"""Generate the bounded Before the Rest of the World AAA proof-of-look tranche.

This generator is deliberately narrow:
- exactly ten manifest-defined hero frames;
- one OpenAI provider request per frame;
- hard budget enforced by paid_request_guard;
- no promotion, deployment, public-release, or runtime-repository mutation;
- immutable source PNGs, normalized WebP previews, a contact sheet, and receipts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
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

EXPECTED_SHOTS = 10
EXPECTED_AUTHORITY = "LifeLoggerAI/urai-studio#59"
EXPECTED_PROJECT = "before-the-rest-of-the-world"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_manifest(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    if manifest.get("schemaVersion") != "1.0.0":
        raise ValueError("manifest schemaVersion must be 1.0.0")
    if manifest.get("programAuthority") != EXPECTED_AUTHORITY:
        raise ValueError("manifest authority drift")
    if manifest.get("projectId") != EXPECTED_PROJECT:
        raise ValueError("manifest project drift")
    if manifest.get("provider") != "openai":
        raise ValueError("manifest provider must be openai")
    shots = manifest.get("shots")
    if not isinstance(shots, list) or len(shots) != EXPECTED_SHOTS:
        raise ValueError(f"manifest must contain exactly {EXPECTED_SHOTS} shots")
    names = [shot.get("name") for shot in shots if isinstance(shot, dict)]
    if len(names) != EXPECTED_SHOTS or any(not isinstance(name, str) or not name for name in names):
        raise ValueError("every shot must have a non-empty name")
    if len(set(names)) != EXPECTED_SHOTS:
        raise ValueError("shot names must be unique")
    for shot in shots:
        if shot.get("aspect_ratio") != "16:9":
            raise ValueError(f"{shot.get('name')} must remain 16:9")
        if shot.get("alpha") is not False:
            raise ValueError(f"{shot.get('name')} must remain opaque")
        if not isinstance(shot.get("prompt"), str) or len(shot["prompt"].strip()) < 80:
            raise ValueError(f"{shot.get('name')} prompt is too short")
    return shots


def validate_authorization(auth: dict[str, Any], manifest_path: Path) -> None:
    if auth.get("schemaVersion") != "1.0.0":
        raise ValueError("authorization schemaVersion must be 1.0.0")
    if auth.get("programAuthority") != EXPECTED_AUTHORITY:
        raise ValueError("authorization authority drift")
    if auth.get("projectId") != EXPECTED_PROJECT:
        raise ValueError("authorization project drift")
    if auth.get("provider") != "openai":
        raise ValueError("authorization provider must be openai")
    if auth.get("manifestPath") != manifest_path.as_posix():
        raise ValueError("authorization manifest path drift")
    if int(auth.get("maximumProviderCalls", 0)) != EXPECTED_SHOTS:
        raise ValueError("authorization must permit exactly ten calls")
    if str(auth.get("maximumReservedCostUsd")) != "10.00":
        raise ValueError("authorization maximum cost must remain 10.00")
    if auth.get("promotionAuthorized") is not False:
        raise ValueError("authorization cannot permit promotion")
    if auth.get("deploymentAuthorized") is not False:
        raise ValueError("authorization cannot permit deployment")
    if auth.get("publicReleaseAuthorized") is not False:
        raise ValueError("authorization cannot permit public release")


def make_entry(shot: dict[str, Any], model: str) -> dict[str, Any]:
    return {
        "name": shot["name"],
        "category": shot["category"],
        "prompt": shot["prompt"],
        "aspect_ratio": shot["aspect_ratio"],
        "alpha": False,
        "quality": shot.get("quality", "high"),
        "tags": ["private-film", "proof-of-look", "before-rest-world"],
        "prompt_version": "before-rest-world-proof-v1",
        "model": model,
    }


def render_one(shot: dict[str, Any], model: str, long_edge: int):
    entry = make_entry(shot, model)
    width, height = provider_renderer.target_dimensions(entry, long_edge)
    reservation = paid_request_guard.reserve(
        provider="openai",
        model=model,
        asset=shot["name"],
        request_size=f"{width}x{height}",
    )
    attempt_id = str(reservation["attemptId"])
    try:
        result = provider_renderer.render_with_provider(entry, long_edge)
        paid_request_guard.record(
            attempt_id,
            status="succeeded",
            request_id=str(result.metadata.get("provider_request_id") or "") or None,
        )
        return result, reservation
    except Exception as exc:
        paid_request_guard.record(attempt_id, status="failed", error=str(exc))
        raise


def write_contact_sheet(rows: list[dict[str, Any]], output: Path) -> None:
    thumb_w, thumb_h = 640, 360
    margin = 28
    label_h = 54
    columns = 2
    rows_count = (len(rows) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * thumb_w + (columns + 1) * margin, rows_count * (thumb_h + label_h) + (rows_count + 1) * margin), (12, 14, 20))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, row in enumerate(rows):
        x = margin + (index % columns) * (thumb_w + margin)
        y = margin + (index // columns) * (thumb_h + label_h + margin)
        with Image.open(row["sourcePath"]) as image:
            frame = image.convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(frame, (x, y))
        draw.text((x, y + thumb_h + 14), f"{index + 1:02d}  {row['name']}", fill=(235, 235, 240), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, format="JPEG", quality=92, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--authorization", required=True)
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    authorization_path = Path(args.authorization)
    output_root = Path(args.output_root)
    manifest = read_json(manifest_path)
    auth = read_json(authorization_path)
    shots = validate_manifest(manifest)
    validate_authorization(auth, manifest_path)

    model = str(manifest.get("model") or "gpt-image-2")
    long_edge = int(manifest.get("targetLongEdge") or 1536)
    source_dir = output_root / "sources"
    preview_dir = output_root / "previews"
    source_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    status = "passed"
    error: str | None = None
    started = utc_now()
    try:
        for shot in shots:
            result, reservation = render_one(shot, model, long_edge)
            source_path = source_dir / f"{shot['name']}.png"
            preview_path = preview_dir / f"{shot['name']}.webp"
            result.image.convert("RGB").save(source_path, format="PNG", optimize=True)
            result.image.convert("RGB").save(preview_path, format="WEBP", quality=95, method=6)
            results.append(
                {
                    "name": shot["name"],
                    "category": shot["category"],
                    "sourcePath": source_path.as_posix(),
                    "previewPath": preview_path.as_posix(),
                    "sourceSha256": sha256_file(source_path),
                    "previewSha256": sha256_file(preview_path),
                    "width": result.image.width,
                    "height": result.image.height,
                    "provider": result.metadata.get("provider"),
                    "providerModel": result.metadata.get("provider_model"),
                    "providerRequestId": result.metadata.get("provider_request_id"),
                    "attemptId": reservation.get("attemptId"),
                }
            )
    except Exception as exc:
        status = "failed"
        error = str(exc)

    budget = paid_request_guard.snapshot()
    receipt = {
        "schemaVersion": "1.0.0",
        "programAuthority": EXPECTED_AUTHORITY,
        "projectId": EXPECTED_PROJECT,
        "status": status,
        "startedAt": started,
        "finishedAt": utc_now(),
        "manifestPath": manifest_path.as_posix(),
        "manifestSha256": sha256_file(manifest_path),
        "authorizationPath": authorization_path.as_posix(),
        "authorizationSha256": sha256_file(authorization_path),
        "expected": EXPECTED_SHOTS,
        "generated": len(results),
        "failed": EXPECTED_SHOTS - len(results),
        "providerCallsExecuted": budget.get("providerCallsExecuted"),
        "reservedEstimatedCostUsd": budget.get("reservedEstimatedCostUsd"),
        "maximumAuthorizedCostUsd": "10.00",
        "promotionAuthorized": False,
        "deploymentAuthorized": False,
        "publicReleaseAuthorized": False,
        "error": error,
        "assets": results,
    }
    receipt_path = output_root / "before-rest-world-generation-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if results:
        write_contact_sheet(results, output_root / "before-rest-world-contact-sheet.jpg")

    print(json.dumps({key: receipt[key] for key in ("status", "expected", "generated", "failed", "providerCallsExecuted", "reservedEstimatedCostUsd")}, sort_keys=True))
    if status != "passed" or len(results) != EXPECTED_SHOTS:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
