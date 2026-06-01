"""
Export the generated asset pack into a zip archive.

The archive includes:
- generated assets
- manifest.json
- preview.html when present
- firebase_seed.json when present
- validation_report.json when present
"""

from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"
DEFAULT_ZIP = BASE_DIR / "asset_pack.zip"


def export(zip_path: Path = DEFAULT_ZIP) -> Path:
    with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
        if ASSETS_DIR.exists():
            for file_path in ASSETS_DIR.rglob("*"):
                if file_path.is_file():
                    archive.write(file_path, file_path.relative_to(BASE_DIR))

        for extra_name in (
            "manifest.json",
            "manifest.schema.json",
            "preview.html",
            "firebase_seed.json",
            "validation_report.json",
        ):
            extra_path = BASE_DIR / extra_name
            if extra_path.exists():
                archive.write(extra_path, extra_path.relative_to(BASE_DIR))

    return zip_path


def main() -> None:
    zip_path = export()
    print(f"Exported asset pack to {zip_path}")


if __name__ == "__main__":
    main()
