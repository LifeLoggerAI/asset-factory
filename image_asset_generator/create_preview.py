"""
Create a static HTML preview gallery for assets listed in manifest.json.
"""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any, Dict

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
PREVIEW_PATH = BASE_DIR / "preview.html"


def load_manifest() -> list[Dict[str, Any]]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def build_html(entries: list[Dict[str, Any]]) -> str:
    lines = [
        "<!doctype html>",
        "<html lang=\"en\">",
        "<head>",
        "  <meta charset=\"utf-8\" />",
        "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
        "  <title>URAI Image Asset Preview</title>",
        "  <style>",
        "    body{font-family:Arial,sans-serif;margin:24px;background:#f7f7f8;color:#171717}",
        "    h1{margin-bottom:8px}",
        "    .asset{background:white;border:1px solid #ddd;border-radius:14px;padding:18px;margin:18px 0}",
        "    .meta{color:#555;font-size:14px;margin-bottom:12px}",
        "    .grid{display:flex;flex-wrap:wrap;gap:16px}",
        "    figure{margin:0;text-align:center}",
        "    img{background:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0;border:1px solid #ccc;max-width:220px;height:auto}",
        "    figcaption{font-size:12px;color:#444;margin-top:6px}",
        "  </style>",
        "</head>",
        "<body>",
        "  <h1>URAI Image Asset Preview</h1>",
        "  <p>Generated from image_asset_generator/manifest.json.</p>",
    ]

    for entry in entries:
        name = html.escape(str(entry.get("name", "unnamed")))
        category = html.escape(str(entry.get("category", "uncategorized")))
        status = html.escape(str(entry.get("status", "unknown")))
        prompt = html.escape(str(entry.get("prompt", "")))
        template = str(entry.get("path_template", ""))
        lines.extend([
            "  <section class=\"asset\">",
            f"    <h2>{name}</h2>",
            f"    <div class=\"meta\">Category: {category} | Status: {status}</div>",
            f"    <div class=\"meta\">Prompt: {prompt}</div>",
            "    <div class=\"grid\">",
        ])
        for size in entry.get("sizes", []):
            relative_path = html.escape(template.format(size=int(size)))
            alt = html.escape(f"{name} {size}px")
            lines.extend([
                "      <figure>",
                f"        <img src=\"{relative_path}\" alt=\"{alt}\" width=\"220\" />",
                f"        <figcaption>{size}px<br />{relative_path}</figcaption>",
                "      </figure>",
            ])
        lines.extend(["    </div>", "  </section>"])

    lines.extend(["</body>", "</html>"])
    return "\n".join(lines) + "\n"


def main() -> None:
    PREVIEW_PATH.write_text(build_html(load_manifest()), encoding="utf-8")
    print(f"Preview written to {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
