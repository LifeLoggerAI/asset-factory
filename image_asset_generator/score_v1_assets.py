"""V1 production scorer with separate scene and transparent-object rules."""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

from PIL import Image, ImageFilter, ImageStat

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
REPORT_PATH = BASE_DIR / "quality_report.json"
FEEDBACK_PATH = BASE_DIR / "upgrade_feedback.json"


def source_for(entry: Dict[str, Any]) -> Path | None:
    candidates: List[Tuple[int, Path]] = []
    for raw_size in entry.get("sizes", []):
        size = int(raw_size)
        candidate = BASE_DIR / entry["path_template"].format(size=size)
        if candidate.exists():
            candidates.append((size, candidate))
    return max(candidates, key=lambda value: value[0])[1] if candidates else None


def render_metadata(path: Path) -> Dict[str, Any]:
    metadata_path = path.with_suffix(path.suffix + ".render.json")
    if not metadata_path.exists():
        return {}
    try:
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def analysis_surface(image: Image.Image, alpha: bool) -> tuple[Image.Image, float]:
    if not alpha or image.mode != "RGBA":
        return image.convert("RGB"), 1.0
    channel = image.getchannel("A")
    bbox = channel.getbbox()
    if not bbox:
        return Image.new("RGB", (64, 64), (96, 96, 96)), 0.0
    coverage_sample = channel.resize((128, 128), Image.Resampling.LANCZOS)
    coverage = sum(1 for value in coverage_sample.getdata() if value > 12) / (128 * 128)
    cropped = image.crop(bbox)
    background = Image.new("RGBA", cropped.size, (48, 54, 62, 255))
    return Image.alpha_composite(background, cropped).convert("RGB"), coverage


def entropy(image: Image.Image) -> float:
    histogram = image.convert("L").histogram()
    total = sum(histogram) or 1
    return -sum((count / total) * math.log2(count / total) for count in histogram if count)


def edge_density(image: Image.Image) -> float:
    edges = image.convert("L").resize((384, 384), Image.Resampling.LANCZOS).filter(ImageFilter.FIND_EDGES)
    pixels = list(edges.getdata())
    return sum(1 for value in pixels if value > 28) / len(pixels)


def perceptual_hash(image: Image.Image) -> str:
    gray = image.convert("L").resize((16, 16), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    average = sum(pixels) / len(pixels)
    bits = "".join("1" if value >= average else "0" for value in pixels)
    return f"{int(bits, 2):064x}"


def hamming(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def score(entry: Dict[str, Any], require_provider: bool) -> Dict[str, Any]:
    path = source_for(entry)
    if not path:
        return {"name": entry["name"], "category": entry.get("category"), "status": "failed", "issues": ["missing output"]}

    image = Image.open(path)
    image.load()
    alpha = bool(entry.get("alpha"))
    surface, coverage = analysis_surface(image, alpha)
    sample = surface.resize((256, 256), Image.Resampling.LANCZOS)
    stat = ImageStat.Stat(sample)
    stddev = sum(stat.stddev) / 3
    color_range = sum(high - low for low, high in sample.getextrema()) / 3
    detail = edge_density(sample)
    visual_entropy = entropy(sample)
    file_bytes = path.stat().st_size
    metadata = render_metadata(path)
    renderer = metadata.get("renderer") or entry.get("renderer") or "unknown"
    issues: List[str] = []

    if alpha:
        if max(image.size) < 512:
            issues.append("transparent asset longest edge below 512px")
        if file_bytes < 20_000:
            issues.append("transparent asset suspiciously small")
        if coverage < 0.025:
            issues.append("almost no visible subject")
        if stddev < 18:
            issues.append("visible subject tonal variation too flat")
        if color_range < 90:
            issues.append("visible subject dynamic range too narrow")
        if visual_entropy < 4.4:
            issues.append("visible subject lacks production detail")
        if detail < 0.022:
            issues.append("visible subject edge detail too low")
    else:
        if max(image.size) < 1200:
            issues.append("scene longest edge below 1200px")
        if file_bytes < 120_000:
            issues.append("scene suspiciously small")
        if stddev < 24:
            issues.append("scene tonal variation too flat")
        if color_range < 130:
            issues.append("scene dynamic range too narrow")
        if visual_entropy < 5.2:
            issues.append("scene lacks production detail")
        if detail < 0.035:
            issues.append("scene edge detail too low")

    if require_provider and renderer != "provider":
        issues.append(f"provider renderer required, found {renderer}")

    return {
        "name": entry["name"],
        "category": entry.get("category"),
        "status": "passed" if not issues else "failed",
        "issues": issues,
        "path": str(path.relative_to(BASE_DIR)),
        "metrics": {
            "width": image.width,
            "height": image.height,
            "bytes": file_bytes,
            "alphaCoverage": round(coverage, 5),
            "stddev": round(stddev, 3),
            "range": round(color_range, 3),
            "entropy": round(visual_entropy, 3),
            "edgeDensity": round(detail, 5),
            "renderer": renderer,
            "perceptualHash": perceptual_hash(sample),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        },
    }


def feedback(records: List[Dict[str, Any]]) -> Dict[str, str]:
    return {
        record["name"]: (
            "Regenerate as richer premium cinematic production art. "
            + "; ".join(record["issues"])
            + ". Increase believable materials, lighting separation, depth, fine detail, and route-specific storytelling. Avoid text, cards, posters, flat vector geometry, and repeated compositions."
        )
        for record in records
        if record.get("issues")
    }


def main() -> int:
    entries = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    require_provider = os.environ.get("ASSET_QUALITY_REQUIRE_PROVIDER", "0") == "1"
    records = [score(entry, require_provider) for entry in entries]
    by_name = {record["name"]: record for record in records}

    hashes = [(record["name"], record.get("metrics", {}).get("perceptualHash")) for record in records]
    for index, (name_a, hash_a) in enumerate(hashes):
        if not hash_a:
            continue
        for name_b, hash_b in hashes[index + 1 :]:
            if not hash_b:
                continue
            same_category = by_name[name_a].get("category") == by_name[name_b].get("category")
            if hamming(hash_a, hash_b) <= (5 if same_category else 8):
                for name, other in ((name_a, name_b), (name_b, name_a)):
                    issue = f"composition near-duplicates {other}"
                    if issue not in by_name[name]["issues"]:
                        by_name[name]["issues"].append(issue)
                        by_name[name]["status"] = "failed"

    failed = [record for record in records if record["status"] != "passed"]
    report = {
        "schemaVersion": "2.0.0",
        "status": "failed" if failed else "passed",
        "requireProvider": require_provider,
        "passed": len(records) - len(failed),
        "failed": len(failed),
        "assets": records,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    FEEDBACK_PATH.write_text(json.dumps(feedback(records), indent=2) + "\n", encoding="utf-8")

    print(f"V1 quality score passed={report['passed']} failed={report['failed']}")
    print(f"QUALITY_REPORT={REPORT_PATH}")
    print(f"UPGRADE_FEEDBACK={FEEDBACK_PATH}")
    for record in failed:
        print(f"FAIL {record['name']}: {'; '.join(record['issues'])}")
    return 4 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
