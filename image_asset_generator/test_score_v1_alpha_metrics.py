from pathlib import Path
import tempfile

from PIL import Image, ImageDraw

import score_v1_assets


def make_textured_subject(
    path: Path,
    *,
    canvas_size: tuple[int, int] = (768, 768),
    offset: tuple[int, int] = (220, 100),
) -> None:
    """Create the same detailed visible subject on any transparent canvas."""
    image = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    pixels = image.load()
    origin_x, origin_y = offset
    width, height = 328, 568

    for y in range(height):
        for x in range(width):
            normalized_x = (x - width / 2) / (width / 2)
            normalized_y = (y - height / 2) / (height / 2)
            if normalized_x * normalized_x + normalized_y * normalized_y <= 1:
                pixels[origin_x + x, origin_y + y] = (
                    (x * 7 + y * 3) % 256,
                    (x * 5 + y * 11) % 256,
                    (x * 13 + y * 2) % 256,
                    255,
                )

    image.save(path)


def make_flat_subject(path: Path) -> None:
    image = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((250, 120, 520, 700), fill=(102, 108, 116, 255))
    image.save(path)


def test_transparent_negative_space_does_not_reduce_subject_metrics() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        normal_path = root / "normal-canvas.png"
        oversized_path = root / "oversized-canvas.png"
        make_textured_subject(normal_path)
        make_textured_subject(
            oversized_path,
            canvas_size=(1200, 1200),
            offset=(436, 316),
        )

        normal_metrics = score_v1_assets.visible_subject_metrics(Image.open(normal_path))
        oversized_metrics = score_v1_assets.visible_subject_metrics(Image.open(oversized_path))

        assert normal_metrics == oversized_metrics
        stddev, color_range, entropy = normal_metrics
        assert stddev >= 18
        assert color_range >= 90
        assert entropy >= 4.4


def test_flat_transparent_subject_still_fails_detail_gate() -> None:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "flat.png"
        make_flat_subject(path)
        stddev, _, entropy = score_v1_assets.visible_subject_metrics(Image.open(path))
        assert stddev < 18 or entropy < 4.4
