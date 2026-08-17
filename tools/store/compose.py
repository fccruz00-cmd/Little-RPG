#!/usr/bin/env python3
"""The 1024x500 Play banner: a real arena frame, plus the title.

The scene is not a mock-up, it is a screenshot of the game's own renderer
with the arena forced to banner size (see shoot-scene.mjs). The title is
drawn small and blown up NEAREST, so the letters are pixels like the rest
of the picture instead of a smooth font sitting on top of pixel art.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
# shoot-scene.mjs writes its burst here; pick the frame where the fight reads
# best and point SCENE at it.
SCENE = os.path.join(HERE, 'scene-06.png')
OUT = os.path.join(ROOT, 'docs', 'store', 'feature-graphic-1024x500.png')

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
GOLD = (0xeb, 0xb8, 0x5b)     # the UI gold, straight off styles.css
INK = (0x0d, 0x0a, 0x14)      # darker than the darkest sky, so it reads

PX = 4                        # one text pixel = 4 screen pixels


def pixel_text(text, size, color, shadow=INK):
    """Draw at 1/PX scale, threshold away the antialiasing, blow up NEAREST."""
    font = ImageFont.truetype(FONT, size)
    probe = ImageDraw.Draw(Image.new('L', (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), text, font=font)
    small = Image.new('L', (r - l + 2, b - t + 2), 0)
    ImageDraw.Draw(small).text((-l + 1, -t + 1), text, font=font, fill=255)
    mask = small.point(lambda v: 255 if v > 110 else 0)   # hard pixel edges

    big = mask.resize((mask.width * PX, mask.height * PX), Image.NEAREST)
    out = Image.new('RGBA', (big.width + PX, big.height + PX), (0, 0, 0, 0))
    for dx, dy, c in ((PX, PX, shadow), (0, 0, color)):
        layer = Image.new('RGBA', out.size, c + (255,))
        layer.putalpha(big.crop((-dx, -dy, out.width - dx, out.height - dy)))
        out.alpha_composite(layer)
    return out


def main():
    canvas = Image.open(SCENE).convert('RGBA')
    assert canvas.size == (1024, 500), canvas.size

    # The sky's empty quarter, upper left: the moon owns the right, the
    # fight owns the bottom, and nothing here has to be moved to make room.
    # Title only. A tagline here would be a second language to maintain and
    # the first thing a store thumbnail shrinks into mush.
    title = pixel_text('LITTLE RPG', 19, GOLD)
    canvas.alpha_composite(title, (64, 74))

    canvas.convert('RGB').save(OUT)
    print(OUT, canvas.size, f'title {title.width}x{title.height}')


if __name__ == '__main__':
    main()
