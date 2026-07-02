"""Generate URAI image assets from manifest.json.

The generator now supports a real provider-backed renderer through
``provider_renderer.py`` while preserving an offline-safe fallback for CI.
Set ``ASSET_RENDERER_MODE=provider`` to fail closed when a real provider is not
configured. Set ``ASSET_RENDERER_FORCE=1`` to replace existing outputs during an
upgrade pass.
"""

from __future__ import annotations

import json
import os
import math
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

from PIL import Image, ImageDraw

from provider_renderer import render_asset as render_via_adapter
from provider_renderer import write_render_metadata

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
FEEDBACK_PATH = BASE_DIR / "upgrade_feedback.json"
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
    draw.rounded_rectangle(
        [x, y, x + w, y + h],
        radius=max(8, int(w * .08)),
        fill=hex_to_rgba("0b1721", 235),
        outline=hex_to_rgba("91f6ff", 110),
        width=max(2, int(w * .015)),
    )
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
    draw.polygon(
        [(size * .06, size * .94), (size * .94, size * .94), (size * .76, size * .48), (size * .24, size * .48)],
        fill=hex_to_rgba("142631", 205),
        outline=hex_to_rgba("8fddff", 90),
    )
    for step in range(1, 7):
        y = size * (.50 + step * .065)
        inset = size * (.22 - step * .027)
        draw.line([inset, y, size - inset, y], fill=hex_to_rgba("8fddff", 38), width=max(1, size // 260))
    for idx, x in enumerate([.16, .32, .48, .64, .80]):
        draw_ground_station(draw, size * x - size * .06, size * (.48 - .04 * (idx % 3)), size * .12, size * .13)
    for idx, x in enumerate([.28, .40, .58, .70]):
        head = size * (.60 + .025 * (idx % 2))
        draw.ellipse([size * x - size * .012, head - size * .012, size * x + size * .012, head + size * .012], fill=hex_to_rgba("d5f6ff", 190))
        draw.rounded_rectangle([size * x - size * .014, head + size * .014, size * x + size * .014, head + size * .075], radius=max(3, size // 180), fill=hex_to_rgba("78d8ff", 120))
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
    for ring in (.35, .27, .19):
        draw.ellipse([size * (.5-ring), size * (.5-ring), size * (.5+ring), size * (.5+ring)], outline=hex_to_rgba("91f6ff", int(60 + ring * 100)), width=max(2, size // 180))
    draw.ellipse([size * .30, size * .30, size * .70, size * .70], fill=hex_to_rgba("13243a", 230), outline=hex_to_rgba("ffe7ad", 130), width=max(2, size // 120))
    draw.polygon([(size * .31, size * .60), (size * .47, size * .43), (size * .57, size * .56), (size * .69, size * .39), (size * .70, size * .70), (size * .30, size * .70)], fill=hex_to_rgba("071018", 240))
    return image


def render_replay(size: int) -> Image.Image:
    image = gradient(size, hex_to_rgba("161033"), hex_to_rgba("050713"), alpha=False)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([size * .10, size * .16, size * .90, size * .70], radius=size // 22, fill=hex_to_rgba("090d16", 235), outline=hex_to_rgba("ffdca8", 95), width=max(2, size // 120))
    draw.rectangle([size * .14, size * .20, size * .86, size * .66], fill=hex_to_rgba("19334b", 235))
    draw.ellipse([size * .61, size * .25, size * .69, size * .33], fill=hex_to_rgba("ffe0a0", 220))
    draw.polygon([(size * .14, size * .57), (size * .33, size * .39), (size * .48, size * .56), (size * .62, size * .35), (size * .86, size * .58), (size * .86, size * .66), (size * .14, size * .66)], fill=hex_to_rgba("081019", 245))
    for x in (.24, .42, .60, .78):
        draw.ellipse([size * x - size * .009, size * .77, size * x + size * .009, size * .788], fill=hex_to_rgba("91f6ff", 160))
    return image


def render_alpha_icon(size: int, text: str) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw_orb(draw, size * .5, size * .45, size * .24)
    if "avatar" in text or "workforce" in text:
        draw.arc([size * .25, size * .52, size * .75, size * .93], 200, 340, fill=hex_to_rgba("ffdca8", 160), width=max(3, size // 32))
    return image


def offline_render_asset(entry: Dict[str, Any], size: int) -> Image.Image:
    text = f"{entry.get('name', '')} {entry.get('category', '')} {entry.get('prompt', '')}".lower()
    if entry.get("alpha"):
        return render_alpha_icon(size, text)
    if "ground" in text or "reception" in text or "logistics" in text or "wellness" in text or "archive" in text:
        return render_ground(size)
    if "life-map" in text or "lifemap" in text or "galaxy" in text or "location" in text:
        return render_lifemap(size)
    if "focus" in text or "chamber" in text:
        return render_focus(size)
    if "replay" in text or "film" in text:
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


def load_feedback() -> Dict[str, str]:
    if not FEEDBACK_PATH.exists():
        return {}
    payload = json.loads(FEEDBACK_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("upgrade_feedback.json must be an object keyed by asset name")
    return {str(key): str(value) for key, value in payload.items() if value}


def main() -> None:
    entries = load_manifest()
    feedback = load_feedback()
    force = os.environ.get("ASSET_RENDERER_FORCE") == "1"
    manifest_changed = False
    created_count = 0
    replaced_count = 0
    renderers: Dict[str, int] = {}

    for entry in entries:
        entry_created = False
        for size, output_path in iter_outputs(entry):
            exists = output_path.exists()
            if exists and not force and entry["name"] not in feedback:
                continue

            output_path.parent.mkdir(parents=True, exist_ok=True)
            result = render_via_adapter(
                entry,
                size,
                offline_render_asset,
                feedback=feedback.get(entry["name"]),
            )
            result.image.save(output_path, format="PNG", optimize=True)
            write_render_metadata(output_path, entry, result)
            renderers[result.renderer] = renderers.get(result.renderer, 0) + 1
            if exists:
                replaced_count += 1
            else:
                created_count += 1
            entry_created = True

        if entry_created:
            entry["status"] = "generated"
            entry["renderer"] = "provider" if renderers.get("provider") else "offline-safe"
            entry.setdefault("prompt_version", "v1")
            manifest_changed = True

    if manifest_changed:
        save_manifest(entries)

    print(f"Generated {created_count} missing asset file(s).")
    print(f"Replaced {replaced_count} existing asset file(s).")
    print(f"Renderer counts: {json.dumps(renderers, sort_keys=True)}")


if __name__ == "__main__":
    main()
