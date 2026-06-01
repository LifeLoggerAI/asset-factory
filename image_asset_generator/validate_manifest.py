"""
Validate image_asset_generator/manifest.json before generation.

This check is intentionally dependency-free so it can run anywhere Python runs.
It validates the registry contract that the generator, preview builder, exporter,
and future production renderer depend on.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = BASE_DIR / "manifest.json"
VALID_STATUS = {
    "prompted",
    "generated",
    "validated",
    "previewed",
    "approved",
    "committed",
    "shipped",
}
VALID_OUTPUT_RE = re.compile(r"^[A-Za-z0-9_./{}-]+\.png$")


def load_manifest() -> Any:
    with MANIFEST_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def require_string(entry: Dict[str, Any], field: str, index: int, errors: List[str]) -> str:
    value = entry.get(field)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"entry[{index}].{field} must be a non-empty string")
        return ""
    return value


def validate_manifest_entries(manifest: Any) -> List[str]:
    errors: List[str] = []

    if not isinstance(manifest, list):
        return ["manifest root must be a list"]

    seen_names: set[str] = set()
    seen_paths: set[str] = set()

    for index, entry in enumerate(manifest):
        if not isinstance(entry, dict):
            errors.append(f"entry[{index}] must be an object")
            continue

        name = require_string(entry, "name", index, errors)
        require_string(entry, "category", index, errors)
        require_string(entry, "prompt", index, errors)
        path_template = require_string(entry, "path_template", index, errors)

        if name:
            if name in seen_names:
                errors.append(f"entry[{index}].name duplicates another asset: {name}")
            seen_names.add(name)

        sizes = entry.get("sizes")
        if not isinstance(sizes, list) or not sizes:
            errors.append(f"entry[{index}].sizes must be a non-empty list")
        else:
            for size in sizes:
                if not isinstance(size, int) or size <= 0:
                    errors.append(f"entry[{index}].sizes contains invalid size: {size!r}")

        if not isinstance(entry.get("alpha"), bool):
            errors.append(f"entry[{index}].alpha must be true or false")

        status = entry.get("status")
        if status not in VALID_STATUS:
            errors.append(
                f"entry[{index}].status must be one of {sorted(VALID_STATUS)}, found {status!r}"
            )

        if path_template:
            if "{size}" not in path_template:
                errors.append(f"entry[{index}].path_template must include {{size}}")
            if path_template.startswith("/") or ".." in Path(path_template).parts:
                errors.append(f"entry[{index}].path_template must be repo-relative and stay inside generator dir")
            if not VALID_OUTPUT_RE.match(path_template):
                errors.append(f"entry[{index}].path_template must be a png path with safe characters")
            if isinstance(sizes, list):
                for size in sizes:
                    if isinstance(size, int) and size > 0:
                        output = path_template.format(size=size)
                        if output in seen_paths:
                            errors.append(f"entry[{index}] duplicates output path: {output}")
                        seen_paths.add(output)

    return errors


def validate_manifest() -> List[str]:
    try:
        manifest = load_manifest()
    except Exception as exc:
        return [f"manifest could not be loaded: {exc}"]

    return validate_manifest_entries(manifest)


def main() -> None:
    errors = validate_manifest()
    if errors:
        print("Manifest validation failed:")
        for error in errors:
            print(f"- {error}")
        sys.exit(1)

    print("Manifest validated successfully.")


if __name__ == "__main__":
    main()
