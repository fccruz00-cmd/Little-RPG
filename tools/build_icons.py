#!/usr/bin/env python3
"""Compose the installable app's icons out of the game's own art.

    python3 tools/build_icons.py

Nothing here is drawn by hand: the knight is his own idle frame, the moon
is the one hanging over the road, the hills and the treeline are the
parallax masks the arena tints every frame, and the dirt is the same
detail strip that scrolls under the fight. The colours are stage one's
biome, copied out of BIOME_TIERS in src/game/render.js. The icon on a home
screen is a still of the game, down to the palette.

Every scale-up is NEAREST, because a smoothed pixel is a broken pixel, and
one pixel scale governs the whole scene: the knight sets it, and the
scenery is measured in the same pixels he is, so nothing in the picture
disagrees about how big a pixel is.

Android masks icons to whatever shape the launcher likes, so the maskable
pair keeps every important pixel inside the middle 80% circle and lets the
background bleed to the edges.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "app")

# Stage one's biome and tier, straight out of BIOME_TIERS in render.js. The
# ground used to be a brown that appears nowhere in the game.
SKY_TOP = (0x1b, 0x23, 0x40)
SKY_LOW = (0x3d, 0x33, 0x57)
FAR = (0x2a, 0x27, 0x43)
MID = (0x1d, 0x1b, 0x31)
TREE = (0x12, 0x10, 0x1f)
GROUND = (0x2f, 0x2a, 0x3d)
GRASS = (0x4a, 0x44, 0x60)
MOON = (0xf6, 0xf0, 0xdc)
STAR = (0xff, 0xff, 0xff)

DIRT_H = 16          # GROUND_FROM_BOTTOM, the band the dirt strip fills

# Three pixel scales, not one, and the reason is distance. The arena draws
# every band at the same scale because its world is 92 units tall; an icon's
# world is barely forty, so at one scale the treeline buries the sky and the
# dirt turns into four boulders. Shrinking the pixels of the scenery is how
# a picture this small says "further away", and it is the same trick the
# parallax is already playing with speed.
BG_SCALE = 0.25      # ridge, hills, treeline, stars
DIRT_SCALE = 0.70    # the ground the knight stands on

# Stars, as (x, y) fractions of the sky and a brightness. Fixed rather than
# random: an icon is rebuilt often and must come out identical every time.
STARS = [(0.08, 0.16, 0.55), (0.19, 0.45, 0.35), (0.31, 0.10, 0.75),
         (0.45, 0.30, 0.40), (0.57, 0.07, 0.60), (0.72, 0.38, 0.30),
         (0.88, 0.20, 0.65), (0.95, 0.52, 0.35)]


def art(rel, box=None):
    im = Image.open(os.path.join(ROOT, rel)).convert("RGBA")
    if box:
        im = im.crop(box)
    return im.crop(im.getbbox())


def raw(rel):
    return Image.open(os.path.join(ROOT, rel)).convert("RGBA")


def tint(mask, color):
    """Recolour a silhouette, keeping its alpha: canvas `source-in`."""
    out = Image.new("RGBA", mask.size, color + (255,))
    out.putalpha(mask.getchannel("A"))
    return out


def band(rel, color, size, scale, baseline, offset):
    """One parallax band, tinted and tiled across the icon at `scale`."""
    strip = tint(raw(rel), color)
    strip = strip.resize((strip.width * scale, strip.height * scale), Image.NEAREST)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    for x in range(-offset, size, strip.width):
        out.alpha_composite(strip, (x, baseline - strip.height))
    return out


def compose(size, safe):
    """One icon. `safe` is the fraction of the canvas the art may fill."""
    knight = art("assets/characters/knight/idle.png", (0, 0, 100, 100))
    # The knight sets the pixel scale; the scenery gets its own, smaller.
    scale = max(1, round((size * safe * 0.52) / knight.height))
    bg = max(1, round(scale * BG_SCALE))
    dirt_s = max(1, round(scale * DIRT_SCALE))
    ground_y = size - DIRT_H * dirt_s

    icon = Image.new("RGBA", (size, size), SKY_TOP + (255,))

    # Sky, the biome's own two-stop gradient, down to the horizon.
    column = Image.new("RGBA", (1, max(1, ground_y)))
    for y in range(column.height):
        t = y / max(1, column.height - 1)
        column.putpixel((0, y), tuple(
            round(SKY_TOP[i] + (SKY_LOW[i] - SKY_TOP[i]) * t) for i in range(3)) + (255,))
    icon.paste(column.resize((size, column.height), Image.NEAREST), (0, 0))

    # Stars, one scenery pixel each. Kept inside the safe band, because a
    # launcher's mask cropping a star off is a star that was never there.
    for fx, fy, a in STARS:
        dot = Image.new("RGBA", (bg, bg), STAR + (round(255 * a),))
        x = (0.5 + safe * 0.9 * (fx - 0.5)) * size
        icon.alpha_composite(dot, (round(x), round(fy * ground_y)))

    # The moon, up and to the right, behind everything. `source-atop` at
    # nine tenths, the renderer's own blend, so the craters survive.
    moon = raw("assets/bg/moon.png")
    wash = Image.new("RGBA", moon.size, MOON + (230,))
    moon = Image.alpha_composite(moon, Image.composite(
        wash, Image.new("RGBA", moon.size, (0, 0, 0, 0)), moon.getchannel("A")))
    m = 11 * scale
    moon = moon.resize((m, m), Image.NEAREST)
    icon.alpha_composite(moon, (round(size * (0.5 + safe * 0.42)) - m, 3 * scale))

    # Ridge, wooded hills, pine treeline: the arena's three bands, in order.
    # The offsets are the parallax frozen: three different slices of the
    # three strips, so no two silhouettes line up their peaks.
    for rel, color, off in (("assets/bg/far.png", FAR, 0),
                            ("assets/bg/mid.png", MID, 37),
                            ("assets/bg/trees.png", TREE, 113)):
        icon.alpha_composite(band(rel, color, size, bg, ground_y + bg, off * bg))

    # Ground: the biome's dirt, its grass line, and the real detail strip
    # over the top, at the scale that keeps it gravel instead of boulders.
    icon.paste(Image.new("RGBA", (size, size - ground_y), GROUND + (255,)), (0, ground_y))
    icon.paste(Image.new("RGBA", (size, 2 * dirt_s), GRASS + (255,)), (0, ground_y))
    dirt = raw("assets/bg/ground.png")
    dirt = dirt.resize((dirt.width * dirt_s, dirt.height * dirt_s), Image.NEAREST)
    # Held back to three quarters: at full strength the road is the
    # brightest thing in the picture, and the knight has to win that.
    dirt.putalpha(dirt.getchannel("A").point(lambda v: round(v * 0.75)))
    for x in range(0, size, dirt.width):
        icon.alpha_composite(dirt, (x, ground_y))

    # The knight, feet on the line. His frame carries a sword out to the
    # right, so centring the whole box would push the BODY left: nudge back
    # by a sixth of the overhang.
    knight = knight.resize((knight.width * scale, knight.height * scale), Image.NEAREST)
    icon.alpha_composite(knight, ((size - knight.width) // 2 + int(knight.width * 0.16),
                                  ground_y - knight.height + scale))
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
