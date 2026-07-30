from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

import export_spatial_handoff as handoff


class TransparentWebPExportTest(unittest.TestCase):
    def test_lossless_webp_preserves_hidden_rgb_under_alpha(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "assets" / "test-16.png"
            source.parent.mkdir(parents=True)

            image = Image.new("RGBA", (16, 16), (17, 34, 51, 0))
            image.putpixel((8, 8), (201, 99, 7, 255))
            image.save(source, "PNG")

            original_base = handoff.BASE_DIR
            original_handoff = handoff.HANDOFF_DIR
            try:
                handoff.BASE_DIR = root
                handoff.HANDOFF_DIR = root / "spatial_handoff"
                entry = {
                    "name": "transparent_regression",
                    "category": "test",
                    "sizes": [16],
                    "path_template": "assets/test-{size}.png",
                    "aspect_ratio": "1:1",
                    "alpha": True,
                    "prompt_version": "test",
                }
                result = handoff.export_entry(entry, "assets/urai/test/transparent.webp")
            finally:
                handoff.BASE_DIR = original_base
                handoff.HANDOFF_DIR = original_handoff

            self.assertEqual(result["status"], "ready")
            self.assertTrue(result["encoding"]["exactAlpha"])
            exported = root / "spatial_handoff" / "assets/urai/test/transparent.webp"
            with Image.open(exported) as decoded:
                self.assertEqual(decoded.convert("RGBA").tobytes(), image.tobytes())


if __name__ == "__main__":
    unittest.main()
