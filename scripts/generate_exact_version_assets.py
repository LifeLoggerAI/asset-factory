#!/usr/bin/env python3
"""Generate the exact authorized URAI V2-V5 canonical asset tranche.

This runner is intentionally narrow:
- target names come only from one immutable authorization marker;
- canonical prompts, dimensions, alpha rules, and paths come from the checked-in
  canonical release manifest builder;
- every provider request is reserved and recorded by paid_request_guard;
- each asset receives at most the explicitly requested number of quality attempts;
- outputs are retained as provider PNG sources and lossless/high-quality WebP runtime files;
- no promotion, deployment, or runtime repository write occurs here.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "image_asset_generator"
sys.path.insert(0, str(GEN))

import canonical_release_manifests  # noqa: E402
import paid_request_guard  # noqa: E402
import provider_renderer  # noqa: E402
import score_v1_assets  # noqa: E402

EXPECTED_COUNTS = {"v2": 71, "v3": 14, "v4": 39, "v5": 27}
FULL_COUNTS = {"v2": 80, "v3": 14, "v4": 39, "v5": 27}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def target_digest(names: list[str]) -> str:
    payload = "\n".join(sorted(names)) + "\n"
    return sha256_bytes(payload.encode("utf-8"))


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def visible_metrics(image: Image.Image) -> dict[str, float | int]:
    rgba = image.convert("RGBA")
    total_weight = 0.0
    weighted_sum = 0.0
    weighted_square_sum = 0.0
    visible_pixels = 0
    for red, green, blue, alpha in rgba.getdata():
        if alpha <= 0:
            continue
        visible_pixels += 1
        weight = alpha / 255.0
        luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        total_weight += weight
        weighted_sum += luminance * weight
        weighted_square_sum += luminance * luminance * weight
    if total_weight == 0:
        return {
            "visiblePixels": 0,
            "visibleWeight": 0.0,
            "visibleMean": 0.0,
            "visibleStdDev": 0.0,
        }
    mean = weighted_sum / total_weight
    variance = max(0.0, weighted_square_sum / total_weight - mean * mean)
    return {
        "visiblePixels": visible_pixels,
        "visibleWeight": round(total_weight, 4),
        "visibleMean": round(mean, 4),
        "visibleStdDev": round(math.sqrt(variance), 4),
    }


def composite_for_hash(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (18, 22, 32, 255))
    background.alpha_composite(rgba)
    return background.convert("RGB")


def perceptual_hash(image: Image.Image) -> str:
    gray = composite_for_hash(image).convert("L").resize((8, 8), Image.Resampling.LANCZOS)
    values = list(gray.getdata())
    average = sum(values) / len(values)
    return "".join("1" if value >= average else "0" for value in values)


def hamming(left: str, right: str) -> int:
    return sum(a != b for a, b in zip(left, right))


def validate_authorization(path: Path, version: str) -> tuple[dict[str, Any], list[str]]:
    auth = load_json(path)
    if not isinstance(auth, dict):
        raise ValueError("authorization marker must be a JSON object")
    if auth.get("schemaVersion") != "1.0.0":
        raise ValueError("authorization schemaVersion must be 1.0.0")
    if auth.get("programAuthority") != "LifeLoggerAI/asset-factory#206":
        raise ValueError("unexpected programAuthority")
    if auth.get("provider") != "openai":
        raise ValueError("provider must be openai")
    if auth.get("endpoint") != "https://api.openai.com/v1/images/generations":
        raise ValueError("OpenAI endpoint drift")
    if auth.get("promotionAuthorized") is not False or auth.get("deploymentAuthorized") is not False:
        raise ValueError("generation marker cannot authorize promotion or deployment")
    if str(auth.get("totalMaxCostUsd")) != "300.00":
        raise ValueError("totalMaxCostUsd must remain 300.00")

    versions = auth.get("versions")
    if not isinstance(versions, dict) or set(versions) != set(EXPECTED_COUNTS):
        raise ValueError("authorization must define v2, v3, v4, and v5")
    spec = versions.get(version)
    if not isinstance(spec, dict):
        raise ValueError(f"missing authorization for {version}")
    names = spec.get("targetNames")
    if not isinstance(names, list) or not all(isinstance(name, str) and name for name in names):
        raise ValueError(f"{version} targetNames must be a non-empty string list")
    if len(names) != len(set(names)):
        raise ValueError(f"{version} targetNames contain duplicates")
    if len(names) != EXPECTED_COUNTS[version]:
        raise ValueError(
            f"{version} authorization count drift: expected {EXPECTED_COUNTS[version]}, found {len(names)}"
        )
    if spec.get("targetNamesSha256") != target_digest(names):
        raise ValueError(f"{version} targetNamesSha256 mismatch")

    total_targets = sum(len(value.get("targetNames", [])) for value in versions.values() if isinstance(value, dict))
    if total_targets != 151 or auth.get("totalTargets") != 151:
        raise ValueError(f"authorization total target drift: {total_targets}")
    total_calls = sum(int(value.get("maxProviderCalls", 0)) for value in versions.values() if isinstance(value, dict))
    if total_calls != 300:
        raise ValueError(f"authorization provider-call exposure must total 300, found {total_calls}")
    return auth, names


def load_entries(version: str, authorized_names: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    manifest_path = canonical_release_manifests.build(version)
    entries = load_json(manifest_path)
    if not isinstance(entries, list) or len(entries) != FULL_COUNTS[version]:
        raise ValueError(f"{version} canonical manifest count drift")
    by_name = {entry.get("name"): entry for entry in entries}
    if len(by_name) != len(entries):
        raise ValueError(f"{version} canonical manifest contains duplicate names")
    missing = sorted(set(authorized_names) - set(by_name))
    if missing:
        raise ValueError(f"{version} authorization names absent from canonical manifest: {missing}")
    selected = [by_name[name] for name in authorized_names]
    preserved = sorted(set(by_name) - set(authorized_names))
    if version == "v2":
        if len(preserved) != 9:
            raise ValueError(f"v2 must preserve exactly nine technical passes, found {len(preserved)}")
    elif preserved:
        raise ValueError(f"{version} authorization must cover the full canonical manifest")
    return selected, preserved


def provider_render(entry: dict[str, Any], size: int, feedback: str | None):
    alpha = bool(entry.get("alpha"))
    model = (
        os.environ.get("ASSET_RENDERER_ALPHA_MODEL", "").strip() if alpha else ""
    ) or os.environ.get("ASSET_RENDERER_MODEL", "").strip() or (
        "gpt-image-1.5" if alpha else "gpt-image-2"
    )
    width, height = provider_renderer.target_dimensions(entry, size)
    reservation = paid_request_guard.reserve(
        provider="openai",
        model=model,
        asset=str(entry["name"]),
        request_size=f"{width}x{height}",
    )
    attempt_id = str(reservation["attemptId"])
    try:
        result = provider_renderer.render_with_provider(entry, size, feedback=feedback)
        request_id = result.metadata.get("provider_request_id")
        paid_request_guard.record(
            attempt_id,
            status="succeeded",
            request_id=str(request_id) if request_id else None,
        )
        return result, reservation, None
    except Exception as error:
        paid_request_guard.record(attempt_id, status="failed", error=str(error))
        return None, reservation, error


def write_provider_source(
    entry: dict[str, Any], size: int, result: provider_renderer.RenderResult, output_root: Path
) -> Path:
    forge_path = GEN / str(entry["path_template"]).format(size=size)
    forge_path.parent.mkdir(parents=True, exist_ok=True)
    result.image.save(forge_path, format="PNG", optimize=True)
    provider_renderer.write_render_metadata(forge_path, entry, result)

    source_path = output_root / "sources" / f"{entry['name']}_{size}.png"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    source_path.write_bytes(forge_path.read_bytes())
    source_meta = forge_path.with_suffix(forge_path.suffix + ".render.json")
    source_path.with_suffix(source_path.suffix + ".render.json").write_bytes(source_meta.read_bytes())
    return forge_path


def write_runtime_webp(entry: dict[str, Any], image: Image.Image, output_root: Path) -> Path:
    canonical = str(entry["canonical_path"]).lstrip("/")
    if not canonical.endswith(".webp"):
        raise ValueError(f"{entry['name']} canonical path must end in .webp")
    runtime_path = output_root / "runtime" / canonical
    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    if bool(entry.get("alpha")):
        image.convert("RGBA").save(
            runtime_path,
            format="WEBP",
            lossless=True,
            method=6,
            exact=True,
        )
    else:
        image.convert("RGB").save(
            runtime_path,
            format="WEBP",
            quality=95,
            method=6,
        )
    return runtime_path


def inspect_runtime(entry: dict[str, Any], path: Path, expected_size: int) -> dict[str, Any]:
    with Image.open(path) as image:
        image.load()
        rgba = image.convert("RGBA")
        alpha_min, alpha_max = rgba.getchannel("A").getextrema()
        expected_width, expected_height = provider_renderer.target_dimensions(entry, expected_size)
        visible = visible_metrics(rgba)
        alpha_required = bool(entry.get("alpha"))
        alpha_valid = (
            alpha_min < 255 and alpha_max > 0 and int(visible["visiblePixels"]) > 0
            if alpha_required
            else alpha_min == 255
        )
        issues: list[str] = []
        if image.format != "WEBP":
            issues.append("format-not-webp")
        if image.size != (expected_width, expected_height):
            issues.append("canonical-geometry-mismatch")
        if not alpha_valid:
            issues.append("alpha-mode-mismatch")
        if path.stat().st_size < 256 or int(visible["visiblePixels"]) == 0:
            issues.append("near-empty-or-corrupt")
        return {
            "format": image.format,
            "width": image.width,
            "height": image.height,
            "expectedWidth": expected_width,
            "expectedHeight": expected_height,
            "bytes": path.stat().st_size,
            "alphaMin": alpha_min,
            "alphaMax": alpha_max,
            "alphaRequired": alpha_required,
            "alphaValid": alpha_valid,
            "sha256": sha256_file(path),
            "perceptualHash": perceptual_hash(rgba),
            **visible,
            "issues": issues,
            "technicalStatus": "passed" if not issues else "failed",
        }


def generate_one(
    entry: dict[str, Any], output_root: Path, max_attempts: int
) -> dict[str, Any]:
    sizes = entry.get("sizes")
    if not isinstance(sizes, list) or len(sizes) != 1:
        raise ValueError(f"{entry['name']} must declare exactly one canonical source size")
    size = int(sizes[0])
    attempt_records: list[dict[str, Any]] = []
    final_result = None
    final_score: dict[str, Any] | None = None
    for quality_attempt in range(1, max_attempts + 1):
        feedback = None
        if final_score and final_score.get("issues"):
            feedback = (
                "Regenerate this exact asset as richer premium production art. "
                + "; ".join(str(issue) for issue in final_score["issues"])
                + ". Preserve the requested subject, aspect ratio, transparency mode, and no-text boundary."
            )
        result, reservation, provider_error = provider_render(entry, size, feedback)
        if provider_error is not None or result is None:
            attempt_records.append(
                {
                    "qualityAttempt": quality_attempt,
                    "budgetAttemptId": reservation["attemptId"],
                    "providerStatus": "failed",
                    "providerError": str(provider_error),
                }
            )
            if quality_attempt >= max_attempts:
                raise RuntimeError(
                    f"{entry['name']} provider request failed after {quality_attempt} attempt(s): {provider_error}"
                )
            continue
        source_path = write_provider_source(entry, size, result, output_root)
        score = score_v1_assets.score(entry, True)
        attempt_records.append(
            {
                "qualityAttempt": quality_attempt,
                "budgetAttemptId": reservation["attemptId"],
                "providerStatus": "succeeded",
                "providerRequestId": result.metadata.get("provider_request_id"),
                "providerModel": result.metadata.get("provider_model"),
                "sourceSha256": sha256_file(source_path),
                "qualityStatus": score.get("status"),
                "qualityIssues": score.get("issues", []),
                "qualityMetrics": score.get("metrics", {}),
            }
        )
        final_result = result
        final_score = score
        if score.get("status") == "passed":
            break

    if final_result is None or final_score is None:
        raise RuntimeError(f"{entry['name']} produced no provider result")
    runtime_path = write_runtime_webp(entry, final_result.image, output_root)
    technical = inspect_runtime(entry, runtime_path, size)
    status = "passed" if final_score.get("status") == "passed" and technical["technicalStatus"] == "passed" else "failed"
    return {
        "name": entry["name"],
        "category": entry.get("category"),
        "canonicalPath": str(entry["canonical_path"]),
        "promptVersion": entry.get("prompt_version"),
        "alpha": bool(entry.get("alpha")),
        "size": size,
        "status": status,
        "attempts": attempt_records,
        "quality": final_score,
        "technical": technical,
        "runtimeFile": str(runtime_path.relative_to(output_root)),
    }


def duplicate_evidence(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_sha: dict[str, list[str]] = {}
    hashes: list[tuple[str, str]] = []
    for record in records:
        technical = record.get("technical", {})
        file_sha = technical.get("sha256")
        phash = technical.get("perceptualHash")
        if isinstance(file_sha, str):
            by_sha.setdefault(file_sha, []).append(str(record["name"]))
        if isinstance(phash, str):
            hashes.append((str(record["name"]), phash))
    exact = [
        {"sha256": file_sha, "names": sorted(names)}
        for file_sha, names in sorted(by_sha.items())
        if len(names) > 1
    ]
    near: list[dict[str, Any]] = []
    for index, (left_name, left_hash) in enumerate(hashes):
        for right_name, right_hash in hashes[index + 1 :]:
            distance = hamming(left_hash, right_hash)
            if distance <= 3:
                near.append({"a": left_name, "b": right_name, "distance": distance})
    return exact, near


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", choices=tuple(EXPECTED_COUNTS), required=True)
    parser.add_argument("--authorization", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--max-attempts-per-asset", type=int, default=2)
    args = parser.parse_args()
    if args.max_attempts_per_asset not in {1, 2}:
        raise SystemExit("max attempts per asset must be 1 or 2")

    version = args.version
    output_root = args.output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    receipt_path = output_root / f"{version}-generation-receipt.json"
    records: list[dict[str, Any]] = []
    auth, target_names = validate_authorization(args.authorization.resolve(), version)
    entries, preserved = load_entries(version, target_names)
    version_spec = auth["versions"][version]
    expected_calls = int(version_spec["maxProviderCalls"])
    if os.environ.get("ASSET_FORGE_MAX_PROVIDER_CALLS") != str(expected_calls):
        raise ValueError(f"{version} runtime provider-call ceiling differs from authorization")
    if os.environ.get("ASSET_FORGE_MAX_COST_USD") != str(version_spec["maxCostUsd"]):
        raise ValueError(f"{version} runtime cost ceiling differs from authorization")

    try:
        for index, entry in enumerate(entries, start=1):
            print(
                "EXACT_ASSET_BEGIN "
                + json.dumps(
                    {
                        "version": version,
                        "index": index,
                        "total": len(entries),
                        "name": entry["name"],
                        "canonicalPath": entry["canonical_path"],
                    },
                    sort_keys=True,
                )
            )
            record = generate_one(entry, output_root, args.max_attempts_per_asset)
            records.append(record)
            print(
                "EXACT_ASSET_END "
                + json.dumps(
                    {"version": version, "name": record["name"], "status": record["status"]},
                    sort_keys=True,
                )
            )

        exact_duplicates, near_duplicates = duplicate_evidence(records)
        failed = [record["name"] for record in records if record["status"] != "passed"]
        if exact_duplicates:
            failed.extend(name for group in exact_duplicates for name in group["names"])
        failed = sorted(set(failed))
        ledger = paid_request_guard.snapshot()
        receipt = {
            "schemaVersion": "1.0.0",
            "generatedAt": utc_now(),
            "programAuthority": auth["programAuthority"],
            "authorizationMarker": str(args.authorization),
            "authorizationSha256": sha256_file(args.authorization),
            "version": version,
            "expectedTargets": EXPECTED_COUNTS[version],
            "targetNamesSha256": target_digest(target_names),
            "generated": len(records),
            "passed": len(records) - len(failed),
            "failed": len(failed),
            "failedNames": failed,
            "preservedCanonicalNames": preserved,
            "provider": "openai",
            "endpoint": auth["endpoint"],
            "providerCallsExecuted": ledger["providerCallsExecuted"],
            "reservedEstimatedCostUsd": ledger["reservedEstimatedCostUsd"],
            "maxProviderCalls": expected_calls,
            "maxCostUsd": str(version_spec["maxCostUsd"]),
            "exactDuplicateGroups": exact_duplicates,
            "nearDuplicatePairs": near_duplicates,
            "promotionAuthorized": False,
            "deploymentAuthorized": False,
            "status": "passed" if not failed else "failed",
            "assets": records,
        }
        raw = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode("utf-8")
        receipt["receiptSha256"] = sha256_bytes(raw)
        receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({key: receipt[key] for key in ("version", "generated", "passed", "failed", "providerCallsExecuted", "reservedEstimatedCostUsd", "status")}, sort_keys=True))
        return 0 if not failed else 4
    except Exception as error:
        try:
            ledger = paid_request_guard.snapshot()
        except Exception as ledger_error:
            ledger = {"snapshotError": str(ledger_error)}
        failure = {
            "schemaVersion": "1.0.0",
            "generatedAt": utc_now(),
            "version": version,
            "status": "execution-failed",
            "error": str(error),
            "completedAssets": records,
            "budget": ledger,
            "promotionAuthorized": False,
            "deploymentAuthorized": False,
        }
        receipt_path.write_text(json.dumps(failure, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        raise


if __name__ == "__main__":
    raise SystemExit(main())
