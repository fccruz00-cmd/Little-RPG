#!/usr/bin/env python3
"""Extract only the sprites the game actually uses from the source packs.

Usage:
    python3 tools/extract_assets.py <character-pack-folder> \
                                    <Mini-Medieval-UI-folder> \
                                    <Raven-Fantasy-32x32.png>

Writes assets/characters/**, assets/ui/** and assets/icons/icons.png, and
prints the manifest (frames + body box) used by src/data/sprites.js.
"""
import json
import os
import re
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")
FRAME = 100

# character -> {in-game anim name: original file name}
ROSTER = {
    "knight":              ("Knight",              {}),
    "slime":               ("Slime",               {}),
    "orc":                 ("Orc",                 {}),
    "bat":                 ("Bat",                 {"idle": "Flying", "walk": "Flying"}),
    "skeleton":            ("Skeleton",            {}),
    "armored_skeleton":    ("Armored Skeleton",    {}),
    "armored_orc":         ("Armored Orc",         {}),
    "werewolf":            ("Werewolf",            {}),
    "greatsword_skeleton": ("Greatsword Skeleton", {}),
    "elite_orc":           ("Elite Orc",           {}),
    "werebear":            ("Werebear",            {}),
    "orc_rider":           ("Orc rider",           {}),
    "knight_templar":      ("Knight Templar",      {"walk": "Walk01"}),
    "swordsman":           ("Swordsman",           {}),
    "necromancer":         ("Necromancer",         {"death": "DEATH"}),
    "wizard":              ("Wizard",              {}),
}
ANIMS = {"idle": "Idle", "walk": "Walk", "attack": "Attack01", "hurt": "Hurt", "death": "Death"}

# Mini Medieval UI crops (sheet, x, y, w, h) -> assets/ui/<name>.png
#
# Every one of these is 9-sliced in styles.css, so the crop has to line up with
# a slice that leaves the middle of each edge uniform. Crop one pixel off and
# the stretched edge smears a bevel across the whole side.
UI_CROPS = {
    # buttons
    "button":          ("Inputs.png", 7, 7, 26, 12),
    "button_pressed":  ("Inputs.png", 8, 24, 24, 10),
    "button_disabled": ("Inputs.png", 127, 7, 26, 12),
    "scroll":          ("Inputs.png", 3, 165, 34, 15),
    # frames, 9-sliced for tree nodes: gems dark when empty, lit when maxed
    "frame_gem":       ("Frames.png", 4, 84, 32, 33),
    "frame_lit":       ("Frames.png", 164, 84, 32, 33),
    # board with stone studs: the frame every card and panel is built from
    "board":           ("Banners.png", 182, 310, 20, 21),
    # plank banners used as headers and strips
    "plank":           ("Banners.png", 216, 30, 32, 9),
    "plank_tall":      ("Banners.png", 304, 30, 32, 18),
    # seamless plank tile (rows 1..6 of a plank, period 3) for panel fills
    "wood":            ("Banners.png", 216, 31, 32, 6),
    # bars: one hollow track plus a fill per colour
    "bar_track":       ("Bars-Sliders-Scrollbars.png", 0, 97, 24, 6),
    "bar_red":         ("Bars-Sliders-Scrollbars.png", 1, 122, 22, 3),
    "bar_violet":      ("Bars-Sliders-Scrollbars.png", 73, 122, 22, 3),
    "bar_gold":        ("Bars-Sliders-Scrollbars.png", 97, 122, 22, 3),
    # checkbox
    "check_off":       ("Inputs.png", 1, 264, 7, 8),
    "check_on":        ("Inputs.png", 33, 264, 7, 8),
}

# Raven Fantasy icons: name, column, row on the 32x32 sheet (16 columns)
ICONS = [
    ("damage",        3, 1),    # sword
    ("attack_speed",  2, 1),    # speed arrow
    ("crit",         11, 0),    # star
    ("crit_power",   12, 24),   # enchanted sword
    ("gold",         12, 10),   # coin pile
    ("health",        8, 24),   # breastplate
    ("regen",         8, 20),   # green flask
    ("stride",        5, 20),   # horseshoe
    ("boss",          4, 28),   # skull
    ("stage",        14, 0),    # trophy
    # skill trees
    ("book",          2, 10),   # book, experience
    ("shield",        1, 23),   # armor, defence
    ("orb",           0, 22),   # orb, soul
    ("crown",         2, 22),   # crown, heirloom
    ("torch",         0, 14),   # torch, ancient fury
    ("dagger",        9, 24),   # dagger, deadly strike
    ("bag",          13, 24),   # coin bag, vault
    ("scout",         7, 0),    # scroll, scout
    ("relic",        11, 28),   # gold ring, relic
    # forge: one per equipment slot
    ("it_sword",      6, 341),  # sword
    ("it_chest",      1, 356),  # body armor
    ("it_helm",       5, 424),  # helmet
    ("it_pants",     15, 508),  # pants
    ("it_boot",       6, 508),  # boots
    ("it_amulet",     5, 505),  # amulet
    ("it_ring",       9, 505),  # ring
    ("dust",          1, 481),  # soul dust
    ("gear",          1, 0),    # cog, automation
    ("bolt",          0, 220),  # bolt, skills
    # mining
    ("ore",           5, 482),  # raw stone
    ("bar",           9, 486),  # stockpiled bars
    ("pick",          2, 337),  # pickaxe
    # chopping and fishing
    ("axe",           1, 339),  # axe
    ("rod",          10, 342),  # fishing rod
    ("log",          12, 484),  # stacked logs
    ("plank",        13, 484),  # sawn planks
    ("fish",          9, 455),  # fish
]
ICON_SIZE = 32


def char_dir(pack, folder):
    """No-shadow variant: the game draws the shadow itself, otherwise the bat
    (which flies) would carry its shadow up into the air."""
    for cand in (os.path.join(pack, folder, folder),
                 os.path.join(pack, folder, folder + " with shadows")):
        if os.path.isdir(cand):
            return cand
    raise SystemExit(f"could not find sprites for {folder}")


def content_box(im):
    """Bounding box of the visible content, in 100x100 frame coordinates."""
    bbox = im.getbbox()
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    return (x0 % FRAME, y0, x1, y1)


def extract_characters(pack):
    manifest = {}
    for slug, (folder, overrides) in ROSTER.items():
        src = char_dir(pack, folder)
        dst = os.path.join(OUT, "characters", slug)
        os.makedirs(dst, exist_ok=True)
        entry = {"anims": {}}
        for anim, default in ANIMS.items():
            name = overrides.get(anim, default)
            path = os.path.join(src, f"{folder}_{name}.png")
            if not os.path.exists(path):
                continue
            im = Image.open(path).convert("RGBA")
            im.save(os.path.join(dst, f"{anim}.png"))
            entry["anims"][anim] = im.width // FRAME
        # Content box of the idle animation: the game uses `top` to hang the
        # health bar at the right height and `left`/`right` for body width.
        # The vertical draw position does NOT come from here. Every frame in
        # the pack shares one ground line (GROUND_LINE), and that is what
        # keeps the bat flying and everyone else standing on the floor.
        idle = Image.open(os.path.join(dst, "idle.png")).convert("RGBA")
        left, right, top, bottom = FRAME, 0, FRAME, 0
        for i in range(idle.width // FRAME):
            box = idle.crop((i * FRAME, 0, (i + 1) * FRAME, FRAME)).getbbox()
            if not box:
                continue
            left, top = min(left, box[0]), min(top, box[1])
            right, bottom = max(right, box[2]), max(bottom, box[3])
        entry["top"] = top
        entry["bottom"] = bottom
        entry["left"] = left
        entry["right"] = right
        manifest[slug] = entry
        print(f"  {slug:22s} {entry['anims']}  body y=[{top},{bottom}] x=[{left},{right}]")
    return manifest


def extract_ui(ui_dir):
    os.makedirs(os.path.join(OUT, "ui"), exist_ok=True)
    for name, (sheet, x, y, w, h) in UI_CROPS.items():
        im = Image.open(os.path.join(ui_dir, sheet)).convert("RGBA")
        im.crop((x, y, x + w, y + h)).save(os.path.join(OUT, "ui", f"{name}.png"))
        print(f"  ui/{name}.png  {w}x{h}")


def extract_icons(sheet_path):
    os.makedirs(os.path.join(OUT, "icons"), exist_ok=True)
    sheet = Image.open(sheet_path).convert("RGBA")
    strip = Image.new("RGBA", (ICON_SIZE * len(ICONS), ICON_SIZE), (0, 0, 0, 0))
    order = []
    for i, (name, col, row) in enumerate(ICONS):
        box = (col * ICON_SIZE, row * ICON_SIZE, (col + 1) * ICON_SIZE, (row + 1) * ICON_SIZE)
        strip.paste(sheet.crop(box), (i * ICON_SIZE, 0))
        order.append(name)
    strip.save(os.path.join(OUT, "icons", "icons.png"))
    print(f"  icons/icons.png  {strip.width}x{strip.height}  {order}")
    return order


def write_sprites_module(chars):
    """Writes src/data/sprites.js from the manifest."""
    lines = [
        "// GENERATED by tools/extract_assets.py, do not edit by hand.", "",
        "export const FRAME = 100;", "",
        "// Ground line shared by every frame in the pack (feet sit around y=57",
        "// and the original baked shadow ran to y=60). Drawing everyone from",
        "// the same origin is what keeps the bat flying and the rest on the",
        "// floor: snapping each sprite down by its own box would land the bat.",
        "export const GROUND_LINE = 58;", "",
        "export const SPRITES = {",
    ]
    for slug in sorted(chars):
        c = chars[slug]
        anims = ", ".join(f"{k}: {v}" for k, v in sorted(c["anims"].items()))
        lines += [
            f"  {slug}: {{",
            f"    top: {c['top']}, bottom: {c['bottom']}, left: {c['left']}, right: {c['right']},",
            f"    anims: {{ {anims} }},",
            "  },",
        ]
    lines += ["};", ""]
    path = os.path.join(ROOT, "src", "data", "sprites.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"  src/data/sprites.js: {len(chars)} characters")


def patch_icon_css(icons):
    """Rewrites the `.ico--*` classes in styles.css.

    The block and the strip must agree on count and order: one new icon at the
    end of the list shifts every `background-position` if the CSS lags behind.
    Generating it here removes that whole class of mismatch.
    """
    path = os.path.join(ROOT, "styles.css")
    with open(path, encoding="utf-8") as fh:
        css = fh.read()

    block = "\n".join(f".ico--{name:<13} {{ --i: {i}; }}" for i, name in enumerate(icons))
    css = re.sub(r"  --n: \d+;", f"  --n: {len(icons)};", css, count=1)
    css = re.sub(
        r"\.ico--\w+\s*\{ --i: \d+; \}(\n\.ico--\w+\s*\{ --i: \d+; \})*",
        block,
        css,
        count=1,
    )

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(css)
    print(f"  styles.css: {len(icons)} .ico--* classes")


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        raise SystemExit(1)
    pack, ui_dir, icon_sheet = sys.argv[1:4]
    print("characters:")
    chars = extract_characters(pack)
    print("ui:")
    extract_ui(ui_dir)
    print("icons:")
    icons = extract_icons(icon_sheet)
    patch_icon_css(icons)
    write_sprites_module(chars)
    out = os.path.join(ROOT, "assets", "manifest.json")
    with open(out, "w") as fh:
        json.dump({"characters": chars, "icons": icons}, fh, indent=2, sort_keys=True)
    print("manifest ->", out)


if __name__ == "__main__":
    main()
