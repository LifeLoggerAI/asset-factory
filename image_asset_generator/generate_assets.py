"""
Generate deterministic placeholder image assets from manifest.json.

This is the local, offline-safe stage of the URAI image asset generator loop.
It reads manifest.json, creates missing PNG assets at the exact declared paths,
and updates asset status to generated when new files are created.

Replace the placeholder renderer with the approved production renderer when
final art generation is wired in.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

from PIL import Image, ImageDraw

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
RGBA = Tuple[int, int, int, int]


def pick_colour(name: str, prompt: str, category: str) -> RGBA:
    text = f"{name} {prompt} {category}".lower()
    if "orb" in text:
        return (255, 215, 72, 255)
    if "night" in text or "star" in text:
        return (10, 15, 45, 255)
    if "sky" in text:
        return (135, 206, 235, 255)
    if "mountain" in text:
        return (120, 120, 130, 255)
    if "ground" in text or "grass" in text:
        return (34, 139, 64, 255)
    return (205, 205, 205, 255)


def generate_radial_gradient(size: int, colour: RGBA) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    centre = size / 2
    max_radius = size / 2
    for radius in range(size // 2, 0, -1):
        alpha = int((radius / max_radius) * colour[3])
        fill = (colour[0], colour[1], colour[2], alpha)
        draw.ellipse(
            [centre - radius, centre - radius, centre + radius, centre + radius],
            fill=fill,
        )
    return image


def render_asset(entry: Dict[str, Any], size: int) -> Image.Image:
    category = str(entry.get("category", ""))
    colour = pick_colour(str(entry.get("name", "")), str(entry.get("prompt", "")), category)
    if category.lower() == "orb":
        return generate_radial_gradient(size, colour)
    return Image.new("RGBA", (size, size), colour)


def iter_outputs(entry: Dict[str, Any]) -> Iterable[Tuple[int, Path]]:
    template = entry["path_template"]
    for size in entry.get("sizes", []):
        yield int(size), BASE_DIR / template.format(size=size)


def load_manifest() -> list[Dict[str, Any]]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_manifest(entries: list[Dict[str, Any]]) -> None:
    with MANIFEST_PATH.open("w", encoding="utf-8") as file:
        json.dump(entries, file, indent=2)
        file.write("\n")


def main() -> None:
    entries = load_manifest()
    manifest_changed = False
    created_count = 0
    for entry in entries:
        entry_created = False
        for size, output_path in iter_outputs(entry):
            if output_path.exists():
                continue
            output_path.parent.mkdir(parents=True, exist_ok=True)
            render_asset(entry, size).save(output_path)
            created_count += 1
            entry_created = True
        if entry_created:
            entry["status"] = "generated"
            manifest_changed = True
    if manifest_changed:
        save_manifest(entries)
    print(f"Generated {created_count} missing asset file(s).")


if __name__ == "__main__":
    main()
