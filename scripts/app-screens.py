#!/usr/bin/env python3
"""Make the website's app screenshots from the Play Store captures.

    python3 scripts/app-screens.py PATH/TO/FarmFlow-App/store/screenshots/phone

The captures are the real app (the `storeDemo` build, sample data) on the Pixel 7 emulator, taken
by FarmFlow-App `store/tools/avd.sh` at 1080x1920. For each one listed in SCREENS, writes into
images/app/: <name>-360.webp, <name>-720.webp and <name>-720.jpg (9:16, unframed — the phone
frame is CSS, `.app-shot`).
"""
import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'images' / 'app'
SCREENS = {  # capture file -> name on the website
    '1-market.png': 'market',
    '2-category.png': 'category',
    '3-listing.png': 'listing',
    '6-edit.png': 'edit-listing',
    '7-listings.png': 'my-listings',
}


def main(src: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for capture, name in SCREENS.items():
        img = Image.open(src / capture).convert('RGB')
        for width in (360, 720):
            out = img.resize((width, width * 16 // 9), Image.LANCZOS)
            out.save(OUT / f'{name}-{width}.webp', 'WEBP', quality=82, method=6)
            if width == 720:
                out.save(OUT / f'{name}-{width}.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
        print(name)


if __name__ == '__main__':
    main(Path(sys.argv[1]))
