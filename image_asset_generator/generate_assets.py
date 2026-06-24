"""
Generate deterministic image assets from manifest.json.

The default renderer is offline-safe so launch checks can run without paid provider
credentials. It now produces URAI-specific scene plates instead of flat color
blocks. Provider-backed rendering can replace this stage later without changing
the manifest or export contract.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

from PIL import Image, ImageDraw

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
RGBA = Tuple[int, int, int, int]


def hex_to_rgba(value: str, alpha: int = 255) -> RGBA:
    value = value.strip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def blend(a: RGBA, b: RGBA, t: float) -> RGBA:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))  # type: ignore[return-value]


def gradient(size: int, top: RGBA, bottom: RGBA, *, alpha: bool) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0) if alpha else bottom)
    draw = ImageDraw.Draw(image)
    for y in range(size):
        fill = blend(top, bottom, y / max(1, size - 1))
        draw.line([(0, y), (size, y)], fill=fill)
    return image


def draw_orb(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hex_to_rgba("91f6ff", 170))
    draw.ellipse([cx - r * .62, cy - r * .62, cx + r * .62, cy + r * .62], fill=hex_to_rgba("ffe7ad", 205))
    draw.ellipse([cx - r * .35, cy - r * .45, cx - r * .08, cy - r * .18], fill=(255, 255, 255, 210))


def draw_stars(draw: ImageDraw.ImageDraw, size: int, count: int = 22) -> None:
    for i in range(count):
        x = (size * ((i * 37) % 100)) / 100
        y = (size * ((i * 53 + 11) % 78)) / 100
        r = 2 + (i % 5)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=hex_to_rgba("fff0b8", 230))


def draw_ground_station(draw: ImageDraw.ImageDraw, x: float, y: float, w: float, h: float) -> None:
    draw.rounded_rectangle([x, y, x + w, y + h], radius=max(8, int(w * .08)), fill=hex_to_rgba("0b1721", 235), outline=hex_to_rgba("91f6ff", 110), width=max(2, int(w * .015)))
    draw.ellipse([x + w * .41, y + h * .2, x + w * .59, y + h * .42], fill=hex_to_rgba("ffe7ad", 230))
    draw.line([x + w * .24, y + h * .68, x + w * .76, y + h * .68], fill=hex_to_rgba("ffdca8", 120), width=max(2, int(w * .018)))


def render_home(size: int) -> Image.Image:
    image = gradient(size, hex_to_rgba("17234c"), hex_to_rgba("060705"), alpha=False)
    draw = ImageDraw.Draw(image)
    draw_stars(draw, size, 18)
    draw.polygon([(size * .5, size * .1), (size * .64, size * .73), (size * .36, size * .73)], fill=hex_to_rgba("fff2bd", 45))
    draw.ellipse([size * .08, size * .70, size * .92, size * .93], fill=hex_to_rgba("b9824b", 70), outline=hex_to_rgba("ffdca8", 90), width=max(2, size // 120))
    for idx, x in enumerate([.23, .39, .61, .77]):
        draw_ground_station(draw, size * x - size * .055, size * (.68 - .03 * (idx % 2)), size * .11, size * .085)
    draw_orb(draw, size * .5, size * .62, size * .055)
    return image


def render_ground(size: int) -> Image.Image:
    image = gradient(size, hex_to_rgba("07131d"), hex_to_rgba("080806"), alpha=False)
    draw = ImageDraw.Draw(image)
    draw.ellipse([size * .08, size * .72, size * .92, size * .94], fill=hex_to_rgba("a56a3b", 70), outline=hex_to_rgba("ffdca8", 90), width=max(2, size // 110))
    for idx, x in enumerate([.16, .32, .48, .64, .80]):
        draw_ground_station(draw, size * x - size * .06, size * (.48 - .04 * (idx % 3)), size * .12, size * .13)
    draw.line([size * .18, size * .75, size * .82, size * .75], fill=hex_to_rgba("91f6ff", 80), width=max(2, size // 130))
    draw_orb(draw, size * .5, size * .74, size * .045)
    return image


def render_lifemap(size: int) -> Image.Image:
    image = gradient(size, hex_to_rgba("1d245f"), hex_to_rgba("03040c"), alpha=False)
    draw = ImageDraw.Draw(image)
    points = [(size * .22, size * .28), (size * .35, size * .41), (size * .50, size * .30), (size * .59, size * .50), (size * .73, size * .38), (size * .82, size * .58), (size * .44, size * .68)]
    for a, b in zip(points, points[1:]):
        draw.line([a, b], fill=hex_to_rgba("91f6ff", 100), width=max(2, size // 160))
    for idx, (x, y) in enumerate(points):
        r = size * (.012 + .005 * (idx % 4))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=hex_to_rgba("fff0b8", 235))
    draw_stars(draw, size, 28)
    return image


def render_focus(size: int) -> Image.Image:
    image = gradient(size, hex_to_rgba("13213d"), hex_to_rgba("03060c"), alpha=False)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([size * .26, size * .24, size * .74, size * .62], radius=size // 22, fill=hex_to_rgba("07131d", 235), outline=hex_to_rgba("91f6ff", 120), width=max(2, size // 120))
    draw_orb(draw, size * .5, size * .43, size * .09)
    draw.ellipse([size * .25, size * .72, size * .75, size * .84], fill=hex_to_rgba("05080d", 190), outline=hex_to_rgba("ffdca8", 80), width=max(2, size // 150))
    return image


def render_replay(size: int) -> Image.Image:
    image = gradient(size, hex_to_rgba("161033"), hex_to_rgba("050713"), alpha=False)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([size * .12, size * .20, size * .88, size * .62], radius=size // 22, fill=hex_to_rgba("090d16", 235), outline=hex_to_rgba("ffdca8", 95), width=max(2, size // 120))
    for idx, x in enumerate([.24, .42, .60, .78]):
        draw.rounded_rectangle([size * x - size * .07, size * .27, size * x + size * .07, size * .54], radius=size // 40, fill=hex_to_rgba("141b2d", 235), outline=hex_to_rgba("91f6ff", 90), width=max(2, size // 180))
        draw.ellipse([size * x - size * .025, size * .39 - size * .025, size * x + size * .025, size * .39 + size * .025], fill=hex_to_rgba("ffe7ad", 225))
    draw.line([size * .22, size * .74, size * .78, size * .74], fill=hex_to_rgba("91f6ff", 90), width=max(2, size // 130))
    draw_orb(draw, size * .5, size * .76, size * .045)
    return image


def render_alpha_icon(size: int, text: str) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw_orb(draw, size * .5, size * .45, size * .24)
    if "avatar" in text:
        draw.arc([size * .25, size * .52, size * .75, size * .93], 200, 340, fill=hex_to_rgba("ffdca8", 160), width=max(3, size // 32))
    return image


def render_asset(entry: Dict[str, Any], size: int) -> Image.Image:
    text = f"{entry.get('name', '')} {entry.get('category', '')} {entry.get('prompt', '')}".lower()
    if entry.get("alpha"):
        return render_alpha_icon(size, text)
    if "ground" in text:
        return render_ground(size)
    if "life-map" in text or "lifemap" in text or "galaxy" in text:
        return render_lifemap(size)
    if "focus" in text:
        return render_focus(size)
    if "replay" in text:
        return render_replay(size)
    return render_home(size)


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
