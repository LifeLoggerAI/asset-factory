from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


def file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pixel_sha(image: Image.Image) -> str:
    digest = hashlib.sha256()
    digest.update(f"{image.mode}:{image.width}x{image.height}\n".encode())
    digest.update(image.tobytes())
    return digest.hexdigest()


def unique(root: Path, pattern: str) -> Path:
    matches = list(root.rglob(pattern))
    if len(matches) != 1:
        raise AssertionError(f"expected one {pattern}, found {len(matches)}: {matches}")
    return matches[0]


def validate(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).resolve()
    if not root.is_dir() or root.is_symlink():
        raise AssertionError(f"invalid generated pack root: {root}")
    for candidate in root.rglob("*"):
        if candidate.is_symlink():
            raise AssertionError(f"symlink rejected: {candidate}")

    manifest_path = unique(root, "manifests/generated/v1.manifest.json")
    quality_path = unique(root, "quality_report_v1.json")
    receipt_path = unique(root, "forge_receipt_v1.json")
    dropin_path = unique(root, "dropin_receipt_v1.json")
    handoff_manifest_path = unique(
        root,
        "spatial_handoff/assets/urai/final/manifests/v1-asset-factory-spatial-handoff.json",
    )
    generic_manifest_path = unique(
        root,
        "spatial_handoff/assets/urai/final/manifests/asset-factory-spatial-handoff.json",
    )

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    quality = json.loads(quality_path.read_text(encoding="utf-8"))
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    dropin = json.loads(dropin_path.read_text(encoding="utf-8"))
    handoff = json.loads(handoff_manifest_path.read_text(encoding="utf-8"))
    generic = json.loads(generic_manifest_path.read_text(encoding="utf-8"))

    if args.source_conclusion != "success":
        raise AssertionError(f"source workflow was not successful: {args.source_conclusion}")
    if len(manifest) != 53:
        raise AssertionError(f"expected 53 manifest entries, found {len(manifest)}")
    if quality.get("status") != "passed" or quality.get("failed") != 0:
        raise AssertionError(f"quality report did not pass: {quality}")
    if receipt.get("status") != "passed" or receipt.get("forgeExitCode") != 0:
        raise AssertionError(f"forge receipt did not pass: {receipt}")
    if receipt.get("newProviderCalls") != 47:
        raise AssertionError(f"expected 47 new provider calls: {receipt.get('newProviderCalls')}")
    if receipt.get("ready") != 53 or receipt.get("missing") != 0:
        raise AssertionError(f"forge output count mismatch: {receipt}")
    if dropin.get("status") != "certified" or dropin.get("ready") != 53:
        raise AssertionError(f"drop-in receipt did not certify 53 assets: {dropin}")
    if handoff != generic:
        raise AssertionError("versioned and generic handoff manifests differ")
    if handoff.get("sourceBinding") != "lossless-webp-decoded-pixel-sha256":
        raise AssertionError(f"unexpected source binding: {handoff.get('sourceBinding')}")
    if handoff.get("ready") != 53 or handoff.get("missing") != 0:
        raise AssertionError(f"handoff count mismatch: {handoff}")
    if len(handoff.get("assets", [])) != 53:
        raise AssertionError(f"handoff asset count mismatch: {len(handoff.get('assets', []))}")

    base = manifest_path.parents[2]
    handoff_root = handoff_manifest_path.parents[4]
    handoff_by_name = {asset["name"]: asset for asset in handoff["assets"]}
    if len(handoff_by_name) != 53:
        raise AssertionError("duplicate or missing handoff asset names")

    direct_records: list[dict[str, Any]] = []
    derived_records: list[dict[str, Any]] = []
    handoff_records: list[dict[str, Any]] = []

    for entry in manifest:
        name = entry["name"]
        size = max(int(value) for value in entry["sizes"])
        source_path = (base / entry["path_template"].format(size=size)).resolve()
        metadata_path = source_path.with_suffix(source_path.suffix + ".render.json")
        if not source_path.is_file() or not metadata_path.is_file():
            raise AssertionError(f"missing source or metadata for {name}")
        if source_path.is_symlink() or metadata_path.is_symlink():
            raise AssertionError(f"symlink source rejected for {name}")
        source_path.relative_to(base.resolve())

        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        details = metadata.get("metadata") or {}
        asset = handoff_by_name[name]
        if asset.get("status") != "ready" or asset.get("renderer") != "provider":
            raise AssertionError(f"asset not provider-ready: {name}: {asset}")
        if asset.get("sourcePath") != str(source_path.relative_to(base)):
            raise AssertionError(f"source path mismatch for {name}")
        if asset.get("sourceSha256") != file_sha(source_path):
            raise AssertionError(f"source hash mismatch for {name}")
        if asset.get("sourceMetadataSha256") != file_sha(metadata_path):
            raise AssertionError(f"source metadata hash mismatch for {name}")
        if asset.get("encoding") != {"format": "WEBP", "lossless": True, "method": 6}:
            raise AssertionError(f"unexpected handoff encoding for {name}: {asset.get('encoding')}")

        handoff_path = (handoff_root / asset["canonicalPath"]).resolve()
        handoff_path.relative_to(handoff_root.resolve())
        if not handoff_path.is_file() or handoff_path.is_symlink():
            raise AssertionError(f"invalid handoff file for {name}: {handoff_path}")
        if asset.get("sha256") != file_sha(handoff_path):
            raise AssertionError(f"handoff hash mismatch for {name}")
        if asset.get("bytes") != handoff_path.stat().st_size:
            raise AssertionError(f"handoff byte count mismatch for {name}")

        mode = "RGBA" if asset["alpha"] else "RGB"
        with Image.open(source_path) as source_image:
            source_image.load()
            source_image = source_image.convert(mode)
            source_pixels = pixel_sha(source_image)
            source_size = source_image.size
        with Image.open(handoff_path) as handoff_image:
            handoff_image.load()
            handoff_image = handoff_image.convert(mode)
            handoff_pixels = pixel_sha(handoff_image)
            handoff_size = handoff_image.size
        if source_size != handoff_size or source_size != (asset["width"], asset["height"]):
            raise AssertionError(f"dimension mismatch for {name}")
        if source_pixels != handoff_pixels:
            raise AssertionError(f"decoded-pixel mismatch for {name}")
        if asset.get("sourcePixelSha256") != source_pixels:
            raise AssertionError(f"source pixel receipt mismatch for {name}")
        if asset.get("handoffPixelSha256") != handoff_pixels:
            raise AssertionError(f"handoff pixel receipt mismatch for {name}")

        record = {
            "name": name,
            "sourcePath": str(source_path.relative_to(root)),
            "sourceSha256": file_sha(source_path),
            "sourceMetadataSha256": file_sha(metadata_path),
            "sourcePixelSha256": source_pixels,
            "handoffPath": str(handoff_path.relative_to(root)),
            "handoffSha256": file_sha(handoff_path),
            "handoffPixelSha256": handoff_pixels,
            "canonicalPath": asset["canonicalPath"],
        }
        handoff_records.append(record)

        if details.get("provider") == "derived-provider":
            source_ids = details.get("source_provider_request_ids")
            if not isinstance(source_ids, list) or not source_ids:
                raise AssertionError(f"derived provider IDs missing for {name}")
            if asset.get("sourceProviderRequestIds") != source_ids:
                raise AssertionError(f"derived provider IDs mismatch for {name}")
            derived_records.append({**record, "sourceProviderRequestIds": source_ids})
            continue

        if metadata.get("renderer") != "provider":
            raise AssertionError(f"direct renderer mismatch for {name}")
        if details.get("provider") != "openai":
            raise AssertionError(f"direct provider mismatch for {name}: {details.get('provider')}")
        request_id = details.get("provider_request_id")
        if not isinstance(request_id, str) or not request_id:
            raise AssertionError(f"provider request ID missing for {name}")
        if asset.get("providerRequestId") != request_id:
            raise AssertionError(f"provider request ID mismatch for {name}")
        with Image.open(source_path) as direct_image:
            gray = direct_image.convert("L").resize((16, 16), Image.Resampling.LANCZOS)
            pixels = list(gray.getdata())
        average = sum(pixels) / len(pixels)
        bits = "".join("1" if value >= average else "0" for value in pixels)
        direct_records.append(
            {
                **record,
                "category": entry.get("category"),
                "perceptualHash": f"{int(bits, 2):064x}",
                "providerRequestId": request_id,
            }
        )

    if len(direct_records) != 48:
        raise AssertionError(f"expected 48 direct provider-backed assets, found {len(direct_records)}")
    if len(derived_records) != 5:
        raise AssertionError(f"expected 5 derived provider-backed assets, found {len(derived_records)}")

    duplicates: list[dict[str, Any]] = []
    for index, left in enumerate(direct_records):
        for right in direct_records[index + 1 :]:
            distance = (
                int(left["perceptualHash"], 16) ^ int(right["perceptualHash"], 16)
            ).bit_count()
            threshold = 5 if left["category"] == right["category"] else 8
            if distance <= threshold:
                duplicates.append(
                    {
                        "left": left["name"],
                        "right": right["name"],
                        "leftCategory": left["category"],
                        "rightCategory": right["category"],
                        "distance": distance,
                        "threshold": threshold,
                    }
                )

    return {
        "schemaVersion": "2.0.0",
        "sourceRunId": int(args.source_run_id),
        "sourceHeadSha": args.source_head_sha,
        "sourceArtifactId": int(args.source_artifact_id),
        "sourceConclusion": args.source_conclusion,
        "sourceBinding": "lossless-webp-decoded-pixel-sha256",
        "handoffAssetsChecked": len(handoff_records),
        "directProviderAssetsChecked": len(direct_records),
        "derivedProviderAssetsChecked": len(derived_records),
        "duplicatePairs": duplicates,
        "status": "failed" if duplicates else "passed",
        "errors": [],
        "handoffAssets": handoff_records,
        "directAssets": direct_records,
        "derivedAssets": derived_records,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--source-conclusion", required=True)
    parser.add_argument("--source-run-id", required=True)
    parser.add_argument("--source-head-sha", required=True)
    parser.add_argument("--source-artifact-id", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        report = validate(args)
        exit_code = 1 if report["duplicatePairs"] else 0
    except Exception as exc:
        report = {
            "schemaVersion": "2.0.0",
            "sourceRunId": int(args.source_run_id),
            "sourceHeadSha": args.source_head_sha,
            "sourceArtifactId": int(args.source_artifact_id),
            "sourceConclusion": args.source_conclusion,
            "status": "error",
            "errors": [f"{type(exc).__name__}: {exc}"],
            "duplicatePairs": [],
            "handoffAssetsChecked": 0,
            "directProviderAssetsChecked": 0,
            "derivedProviderAssetsChecked": 0,
        }
        exit_code = 2
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(output)
    print(json.dumps(report, indent=2, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
