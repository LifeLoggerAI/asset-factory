#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifests/v2-certified-repair-manifest-20260730.json"
AUTH = ROOT / "authorizations/execute-v2-certified-repair-20260730.json"
OUT = ROOT / "artifacts/v2-certified-repair"
PNG_ROOT = OUT / "provider-png"
WEBP_ROOT = OUT / "runtime-webp"
RECEIPT = OUT / "generation-receipt.json"
API_URL = "https://api.openai.com/v1/images/generations"
MAX_FILE_BYTES = 1_048_576


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def target_dimensions(ratio: float, long_edge: int) -> tuple[int, int]:
    if ratio >= 1:
        return long_edge, max(1, round(long_edge / ratio))
    return max(1, round(long_edge * ratio)), long_edge


def api_generate(asset: dict[str, Any], prompt: str) -> tuple[bytes, dict[str, Any]]:
    payload = {
        "model": asset["model"],
        "prompt": prompt,
        "size": asset["apiSize"],
        "quality": asset["quality"],
        "background": asset["background"],
        "output_format": "png",
        "n": 1,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI image request failed ({exc.code}): {detail}") from exc
    data = body.get("data")
    if not isinstance(data, list) or not data or not data[0].get("b64_json"):
        raise RuntimeError(f"OpenAI response missing data[0].b64_json: {body}")
    return base64.b64decode(data[0]["b64_json"]), body


def make_runtime_webp(png_path: Path, destination: Path, asset: dict[str, Any]) -> dict[str, Any]:
    width, height = target_dimensions(float(asset["expectedAspectRatio"]), int(asset["expectedLongEdge"]))
    with Image.open(png_path) as source:
        source.load()
        image = source.convert("RGBA")
        source_ratio = image.width / image.height
        target_ratio = width / height
        if source_ratio > target_ratio:
            crop_width = round(image.height * target_ratio)
            left = (image.width - crop_width) // 2
            image = image.crop((left, 0, left + crop_width, image.height))
        elif source_ratio < target_ratio:
            crop_height = round(image.width / target_ratio)
            top = (image.height - crop_height) // 2
            image = image.crop((0, top, image.width, top + crop_height))
        image = image.resize((width, height), Image.Resampling.LANCZOS)
        if asset["alphaRequired"]:
            alpha_min, alpha_max = image.getchannel("A").getextrema()
            if alpha_min == 255:
                raise ValueError(f"{asset['name']}: transparent asset has no transparent pixels")
        else:
            background = Image.new("RGB", image.size, (8, 10, 18))
            background.paste(image, mask=image.getchannel("A"))
            image = background

        destination.parent.mkdir(parents=True, exist_ok=True)
        selected_quality = None
        for quality in (90, 86, 82, 78, 74, 70, 66, 62):
            image.save(destination, "WEBP", quality=quality, method=6, exact=True)
            if destination.stat().st_size <= MAX_FILE_BYTES:
                selected_quality = quality
                break
        if selected_quality is None:
            raise ValueError(f"{asset['name']}: cannot meet 1 MiB runtime budget")

    with Image.open(destination) as check:
        check.load()
        expected_mode = "RGBA" if asset["alphaRequired"] else "RGB"
        actual = check.convert(expected_mode)
        if actual.size != (width, height):
            raise ValueError(f"{asset['name']}: geometry mismatch {actual.size} != {(width, height)}")
        if asset["alphaRequired"] and actual.getchannel("A").getextrema()[0] == 255:
            raise ValueError(f"{asset['name']}: alpha lost after WebP export")
    return {
        "width": width,
        "height": height,
        "bytes": destination.stat().st_size,
        "quality": selected_quality,
        "sha256": sha256_file(destination),
    }


def main() -> int:
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is required")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    authorization = json.loads(AUTH.read_text(encoding="utf-8"))
    replacements = manifest["replacements"]
    policy = manifest["policy"]
    if len(replacements) != 71 or policy["maxProviderCalls"] != 142:
        raise SystemExit("V2 authorization boundary mismatch")
    if authorization["execution"]["promotionAuthorized"] or authorization["execution"]["deploymentAuthorized"]:
        raise SystemExit("generation lane must not authorize promotion or deployment")

    OUT.mkdir(parents=True, exist_ok=True)
    PNG_ROOT.mkdir(parents=True, exist_ok=True)
    WEBP_ROOT.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []
    seen_hashes: dict[str, str] = {}
    provider_calls = 0
    failures: list[dict[str, Any]] = []

    for index, asset in enumerate(replacements, start=1):
        canonical = Path(asset["canonicalPath"])
        png_path = PNG_ROOT / canonical.with_suffix(".png")
        webp_path = WEBP_ROOT / canonical
        success = None
        for attempt in range(1, int(asset["maxAttempts"]) + 1):
            prompt = asset["prompt"]
            if attempt > 1:
                prompt += (
                    " This is a repair retry. Increase semantic specificity and visual uniqueness; "
                    "do not resemble any previously generated state in the same family."
                )
            provider_calls += 1
            if provider_calls > int(policy["maxProviderCalls"]):
                raise SystemExit("provider-call ceiling exceeded")
            raw, response = api_generate(asset, prompt)
            png_path.parent.mkdir(parents=True, exist_ok=True)
            png_path.write_bytes(raw)
            try:
                runtime = make_runtime_webp(png_path, webp_path, asset)
                duplicate_of = seen_hashes.get(runtime["sha256"])
                if duplicate_of:
                    raise ValueError(f"exact duplicate of {duplicate_of}")
                seen_hashes[runtime["sha256"]] = asset["name"]
                success = {
                    "name": asset["name"],
                    "family": asset["family"],
                    "canonicalPath": asset["canonicalPath"],
                    "attempt": attempt,
                    "provider": "openai",
                    "model": asset["model"],
                    "requestCreated": response.get("created"),
                    "providerPngSha256": sha256_bytes(raw),
                    "runtime": runtime,
                    "sourceIssues": asset["issues"],
                }
                break
            except Exception as exc:
                if attempt == int(asset["maxAttempts"]):
                    failures.append({"name": asset["name"], "error": str(exc), "attempts": attempt})
                time.sleep(1)
        if success:
            results.append(success)
        print(json.dumps({"progress": f"{index}/{len(replacements)}", "asset": asset["name"], "ok": bool(success)}), flush=True)

    receipt = {
        "schemaVersion": "1.0.0",
        "programAuthority": manifest["programAuthority"],
        "sourceCertification": manifest["sourceCertification"],
        "model": "gpt-image-2",
        "providerCalls": provider_calls,
        "authorizedReplacementCount": 71,
        "generatedAndValidated": len(results),
        "failed": failures,
        "uniqueRuntimeHashes": len(seen_hashes),
        "promotionAuthorized": False,
        "deploymentAuthorized": False,
        "results": results,
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if failures or len(results) != 71 or len(seen_hashes) != 71:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
