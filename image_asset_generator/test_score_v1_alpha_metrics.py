from pathlib import Path
import tempfile

from PIL import Image, ImageDraw

import score_v1_assets


def make_subject(path: Path, *, detailed: bool) -> None:
    image = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if detailed:
        for index in range(48):
            shade = 30 + (index * 4) % 220
            draw.ellipse((180 + index * 2, 80 + index * 4, 590 - index, 700 - index * 3), fill=(shade, 255 - shade // 2, 120 + index % 100, 220))
    else:
        draw.ellipse((250, 120, 520, 700), fill=(102, 108, 116, 255))
    image.save(path)


def test_transparent_negative_space_does_not_reduce_subject_entropy() -> None:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "detailed.png"
        make_subject(path, detailed=True)
        image = Image.open(path)
        stddev, color_range, entropy = score_v1_assets.visible_subject_metrics(image)
        assert stddev >= 18
        assert color_range >= 90
        assert entropy >= 4.4


def test_flat_transparent_subject_still_fails_detail_gate() -> None:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "flat.png"
        make_subject(path, detailed=False)
        image = Image.open(path)
        stddev, _, entropy = score_v1_assets.visible_subject_metrics(image)
        assert stddev < 18 or entropy < 4.4
