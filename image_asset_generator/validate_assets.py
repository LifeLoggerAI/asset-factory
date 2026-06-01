"""
Validate generated image assets against manifest.json.

Checks:
- every declared file exists
- each image has the requested square dimensions
- alpha-required assets are stored as RGBA

The script exits non-zero when validation fails, so it can be used in CI.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"


def load_manifest() -> list[Dict[str, Any]]:
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def validate() -> List[str]:
    errors: List[str] = []
    entries = load_manifest()

    for entry in entries:
        template = entry.get("path_template")
        alpha_required = bool(entry.get("alpha", False))
        for size in entry.get("sizes", []):
            expected_size = int(size)
            relative_path = template.format(size=expected_size)
            file_path = BASE_DIR / relative_path

            if not file_path.exists():
                errors.append(f"Missing file: {relative_path}")
                continue

            try:
                with Image.open(file_path) as image:
                    width, height = image.size
                    if (width, height) != (expected_size, expected_size):
                        errors.append(
                            f"Incorrect dimensions for {relative_path}: "
                            f"expected {expected_size}x{expected_size}, found {width}x{height}"
                        )
                    if alpha_required and image.mode != "RGBA":
                        errors.append(
                            f"Missing alpha channel for {relative_path}: expected RGBA, found {image.mode}"
                        )
            except Exception as exc:
                errors.append(f"Failed to open {relative_path}: {exc}")

    return errors


def main() -> None:
    errors = validate()
    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)

    print("All assets validated successfully.")


if __name__ == "__main__":
    main()
