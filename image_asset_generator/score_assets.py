"""Score generated URAI assets and emit deterministic upgrade feedback.

This is not a replacement for human art direction. It rejects obvious production failures:
flat placeholders, near-empty outputs, crushed black/white images, low-detail images,
undersized files, duplicate scene plates, and non-provider renders in production mode.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from PIL import Image, ImageFilter, ImageStat

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
REPORT_PATH = BASE_DIR / "quality_report.json"
FEEDBACK_PATH = BASE_DIR / "upgrade_feedback.json"


def source_for(entry: Dict[str, Any]) -> Path | None:
    candidates: List[Tuple[int, Path]] = []
    for raw_size in entry.get("sizes", []):
        size = int(raw_size)
        path = BASE_DIR / entry["path_template"].format(size=size)
        if path.exists():
            candidates.append((size, path))
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def entropy(image: Image.Image) -> float:
    histogram = image.convert("L").histogram()
    total = sum(histogram) or 1
    result = 0.0
    for count in histogram:
        if count:
            p = count / total
            result -= p * math.log2(p)
    return result


def perceptual_hash(image: Image.Image) -> str:
    gray = image.convert("L").resize((16, 16), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    average = sum(pixels) / len(pixels)
    bits = "".join("1" if value >= average else "0" for value in pixels)
    return f"{int(bits, 2):064x}"


def hamming(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def edge_density(image: Image.Image) -> float:
    gray = image.convert("L").resize((512, 512), Image.Resampling.LANCZOS)
    edges = gray.filter(ImageFilter.FIND_EDGES)
    pixels = list(edges.getdata())
    return sum(1 for value in pixels if value > 28) / len(pixels)


def clipped_ratio(image: Image.Image, low: bool) -> float:
    gray = image.convert("L").resize((256, 256), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    if low:
        return sum(1 for value in pixels if value <= 5) / len(pixels)
    return sum(1 for value in pixels if value >= 250) / len(pixels)


def render_metadata(path: Path) -> Dict[str, Any]:
    metadata_path = path.with_suffix(path.suffix + ".render.json")
    if not metadata_path.exists():
        return {}
    try:
        value = json.loads(metadata_path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def score_entry(entry: Dict[str, Any], require_provider: bool) -> Dict[str, Any]:
    path = source_for(entry)
    issues: List[str] = []
    if not path:
        return {"name": entry["name"], "status": "failed", "issues": ["missing generated output"]}

    image = Image.open(path)
    image.load()
    rgb = image.convert("RGB")
    sample = rgb.resize((256, 256), Image.Resampling.LANCZOS)
    stat = ImageStat.Stat(sample)
    channel_stddev = sum(stat.stddev) / 3
    channel_range = sum((extrema[1] - extrema[0]) for extrema in sample.getextrema()) / 3
    image_entropy = entropy(sample)
    image_edge_density = edge_density(sample)
    dark_ratio = clipped_ratio(sample, True)
    bright_ratio = clipped_ratio(sample, False)
    file_bytes = path.stat().st_size
    metadata = render_metadata(path)
    renderer = metadata.get("renderer") or entry.get("renderer") or "unknown"

    alpha = bool(entry.get("alpha"))
    if image.width < 768 or image.height < 768:
        issues.append("largest output is below 768px")
    if not alpha and file_bytes < 120_000:
        issues.append("scene file is suspiciously small and likely under-detailed")
    if alpha and file_bytes < 35_000:
        issues.append("transparent asset is suspiciously small")
    if channel_stddev < 24:
        issues.append("tonal variation is too flat")
    if channel_range < 130:
        issues.append("dynamic range is too narrow")
    if image_entropy < 5.2:
        issues.append("visual entropy is too low for production art")
    if image_edge_density < 0.035:
        issues.append("edge/detail density is too low")
    if dark_ratio > 0.58:
        issues.append("too much of the image is crushed near black")
    if bright_ratio > 0.25:
        issues.append("too much of the image is clipped near white")
    if require_provider and renderer != "provider":
        issues.append(f"production forge requires provider renderer, found {renderer}")

    return {
        "name": entry["name"],
        "category": entry.get("category"),
        "path": str(path.relative_to(BASE_DIR)),
        "status": "passed" if not issues else "failed",
        "issues": issues,
        "metrics": {
            "width": image.width,
            "height": image.height,
            "bytes": file_bytes,
            "stddev": round(channel_stddev, 3),
            "range": round(channel_range, 3),
            "entropy": round(image_entropy, 3),
            "edgeDensity": round(image_edge_density, 5),
            "darkRatio": round(dark_ratio, 5),
            "brightRatio": round(bright_ratio, 5),
            "renderer": renderer,
            "perceptualHash": perceptual_hash(sample),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        },
    }


def build_feedback(records: List[Dict[str, Any]]) -> Dict[str, str]:
    feedback: Dict[str, str] = {}
    for record in records:
        if record.get("issues"):
            feedback[record["name"]] = (
                "Regenerate as materially richer premium cinematic production art. "
                + "; ".join(record["issues"])
                + ". Increase believable materials, environmental detail, depth, lighting separation, and route-specific storytelling. Avoid text, cards, posters, flat vector geometry, and repeated compositions."
            )
    return feedback


def main() -> int:
    entries = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    require_provider = os.environ.get("ASSET_QUALITY_REQUIRE_PROVIDER", "0") == "1"
    records = [score_entry(entry, require_provider) for entry in entries]

    hashes = [(record["name"], record.get("metrics", {}).get("perceptualHash")) for record in records]
    for index, (name_a, hash_a) in enumerate(hashes):
        if not hash_a:
            continue
        for name_b, hash_b in hashes[index + 1 :]:
            if not hash_b:
                continue
            if hamming(hash_a, hash_b) <= 8:
                for record in records:
                    if record["name"] in {name_a, name_b}:
                        issue = f"composition is near-duplicate of {name_b if record['name'] == name_a else name_a}"
                        if issue not in record["issues"]:
                            record["issues"].append(issue)
                            record["status"] = "failed"

    passed = [record for record in records if record["status"] == "passed"]
    failed = [record for record in records if record["status"] != "passed"]
    report = {
        "schemaVersion": "1.0.0",
        "requireProvider": require_provider,
        "passed": len(passed),
        "failed": len(failed),
        "status": "passed" if not failed else "failed",
        "assets": records,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    FEEDBACK_PATH.write_text(json.dumps(build_feedback(records), indent=2) + "\n", encoding="utf-8")

    print(f"Asset quality score passed={len(passed)} failed={len(failed)}")
    print(f"QUALITY_REPORT={REPORT_PATH}")
    print(f"UPGRADE_FEEDBACK={FEEDBACK_PATH}")
    for record in failed:
        print(f"FAIL {record['name']}: {'; '.join(record['issues'])}")
    return 0 if not failed else 4


if __name__ == "__main__":
    raise SystemExit(main())
