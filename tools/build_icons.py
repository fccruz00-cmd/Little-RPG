#!/usr/bin/env python3
"""Compose the installable app's icons out of the game's own art.

    python3 tools/build_icons.py

Nothing here is drawn by hand: the knight is his own idle frame and the
moon is the one hanging over the road, so the icon on a home screen is
literally a still of the game. Every scale-up is NEAREST, because a
smoothed pixel is a broken pixel.

Android masks icons to whatever shape the launcher likes, so the maskable
pair keeps every important pixel inside the middle 80% circle and lets the
background bleed to the edges.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "app")

NIGHT = (20, 18, 28, 255)      # the theme colour, straight off the meta tag
GROUND = (43, 31, 24, 255)     # the board brown the panel is framed in


def art(rel, box=None):
    im = Image.open(os.path.join(ROOT, rel)).convert("RGBA")
    if box:
        im = im.crop(box)
    return im.crop(im.getbbox())


def compose(size, safe):
    """One icon. `safe` is the fraction of the canvas the art may fill."""
    icon = Image.new("RGBA", (size, size), NIGHT)

    # The ground takes the bottom third, so the knight has a road to stand on.
    ground_y = int(size * (0.5 + safe * 0.18))
    icon.paste(Image.new("RGBA", (size, size - ground_y), GROUND), (0, ground_y))

    # The moon, up and to the right, behind everything.
    moon = art("assets/bg/moon.png")
    m = max(1, int(size * safe * 0.26))
    moon = moon.resize((m, m), Image.NEAREST)
    icon.paste(moon, (int(size * (0.5 + safe * 0.14)),
                      int(size * (0.5 - safe * 0.42))), moon)

    # The knight, feet on the line, as tall as the safe area allows. His
    # frame carries a sword out to the right, so centring the whole box
    # would push the BODY left: nudge back by a third of the overhang.
    knight = art("assets/characters/knight/idle.png", (0, 0, 100, 100))
    scale = max(1, round((size * safe * 0.52) / knight.height))
    knight = knight.resize((knight.width * scale, knight.height * scale), Image.NEAREST)
    nudge = int(knight.width * 0.16)
    icon.paste(knight, ((size - knight.width) // 2 + nudge,
                        ground_y - knight.height + scale), knight)
    return icon


def main():
    os.makedirs(OUT, exist_ok=True)
    # Plain icons fill the frame; maskable ones pull in for the launcher's mask.
    for name, size, safe in [
        # Plain icons stop short of the edge: iOS rounds the corners and
        # the knight's sword would lose its tip.
        ("icon-192.png", 192, 0.86),
        ("icon-512.png", 512, 0.86),
        ("maskable-192.png", 192, 0.72),
        ("maskable-512.png", 512, 0.72),
        ("apple-touch-icon.png", 180, 0.86),
    ]:
        compose(size, safe).save(os.path.join(OUT, name))
        print(f"assets/app/{name}")


if __name__ == "__main__":
    main()
