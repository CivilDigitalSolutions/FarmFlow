#!/usr/bin/env python3
"""Turn source photos into the guide pages' black-and-white, slightly faded images.

    python3 scripts/guide-photos.py SOURCE_DIR

For every SOURCE_DIR/<name>.jpg (or .jpeg / .png / .webp) writes, into images/guides/:
    <name>-760.webp, <name>-1520.webp, <name>-1520.jpg   (3:2 crop, centred)

The look is baked into the files rather than applied with a CSS filter, so the pages stay right
even with an old stylesheet cached, and greyscale files are smaller than colour ones.
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

OUT = Path(__file__).resolve().parent.parent / 'images' / 'guides'
RATIO = 3 / 2
# Fade: lower the contrast, then lift the blacks and soften the whites (a matte look).
CONTRAST = 0.88
BLACK, WHITE = 34, 238


def treat(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img).convert('RGB')
    w, h = img.size
    if w / h > RATIO:
        cw = round(h * RATIO)
        img = img.crop(((w - cw) // 2, 0, (w - cw) // 2 + cw, h))
    else:
        ch = round(w / RATIO)
        img = img.crop((0, (h - ch) // 2, w, (h - ch) // 2 + ch))
    grey = ImageEnhance.Contrast(ImageOps.grayscale(img)).enhance(CONTRAST)
    return grey.point(lambda v: round(BLACK + v * (WHITE - BLACK) / 255))


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.iterdir()):
        if f.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp'}:
            continue
        img = treat(Image.open(f))
        for width in (760, 1520):
            out = img.resize((width, round(width / RATIO)), Image.LANCZOS)
            out.save(OUT / f'{f.stem}-{width}.webp', 'WEBP', quality=72, method=6)
            if width == 1520:
                out.save(OUT / f'{f.stem}-{width}.jpg', 'JPEG', quality=74, optimize=True, progressive=True)
        print(f.stem)


if __name__ == '__main__':
    main(Path(sys.argv[1]))
