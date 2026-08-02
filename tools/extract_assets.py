#!/usr/bin/env python3
"""Extrai do pacote original apenas os sprites usados pelo jogo.

Uso:
    python3 tools/extract_assets.py <pasta-do-pacote-de-personagens> \
                                    <pasta-Mini-Medieval-UI> \
                                    <Raven-Fantasy-32x32.png>

Gera assets/characters/**, assets/ui/** e assets/icons/icons.png, alem de
imprimir o manifesto (frames + baseline) usado em src/data/sprites.js.
"""
import json
import os
import re
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets")
FRAME = 100

# personagem -> {nome-no-jogo: nome-do-arquivo-original}
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

# recortes do Mini Medieval UI (sheet, x, y, w, h) -> assets/ui/<nome>.png
UI_CROPS = {
    "button":          ("Inputs.png", 7, 7, 26, 12),
    "button_pressed":  ("Inputs.png", 8, 24, 24, 10),
    "button_disabled": ("Inputs.png", 127, 7, 26, 12),
    "panel":           ("Frames.png", 85, 5, 30, 32),
    "banner":          ("Inputs.png", 3, 165, 34, 15),
}

# icones Raven Fantasy: nome, coluna, linha na spritesheet 32x32 (16 colunas)
ICONS = [
    ("damage",        3, 1),    # espada
    ("attack_speed",  2, 1),    # flecha de velocidade
    ("crit",         11, 0),    # estrela
    ("crit_power",   12, 24),   # espada encantada
    ("gold",         12, 10),   # pilha de moedas
    ("health",        8, 24),   # peitoral
    ("regen",         8, 20),   # frasco verde
    ("stride",        5, 20),   # ferradura
    ("boss",          4, 28),   # caveira
    ("stage",        14, 0),    # troféu
    # árvores de talento
    ("book",          2, 10),   # livro — experiência
    ("shield",        1, 23),   # armadura — defesa
    ("orb",           0, 22),   # orbe — alma
    ("crown",         2, 22),   # coroa — herança
    ("torch",         0, 14),   # tocha — fúria antiga
    ("dagger",        9, 24),   # adaga — golpe mortal
    ("bag",          13, 24),   # saco de moedas — cofre
    ("scout",         7, 0),    # corno — batedor
    ("relic",        11, 28),   # anel dourado — relíquia
    # forja: um por slot de equipamento
    ("it_sword",      6, 341),  # espada
    ("it_chest",      1, 356),  # armadura
    ("it_helm",       5, 424),  # capacete
    ("it_pants",     15, 508),  # calça
    ("it_boot",       6, 508),  # bota
    ("it_amulet",     5, 505),  # amuleto
    ("it_ring",       9, 505),  # anel
    ("dust",          1, 481),  # poeira de alma
    ("gear",          1, 0),    # engrenagem — automação
    ("bolt",          0, 220),  # raio — skills
]
ICON_SIZE = 32


def char_dir(pack, folder):
    """Variante sem sombra: o jogo desenha a sombra por baixo, senão o
    morcego (que voa) levaria a sombra junto pro alto."""
    for cand in (os.path.join(pack, folder, folder),
                 os.path.join(pack, folder, folder + " with shadows")):
        if os.path.isdir(cand):
            return cand
    raise SystemExit(f"nao achei os sprites de {folder}")


def content_box(im):
    """Bounding box do conteudo visivel, em coordenadas do frame de 100x100."""
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
        # Todas as animacoes compartilham o mesmo frame de 100x100 e o artista
        # alinhou o personagem entre elas, entao a base do idle serve de chao
        # para o conjunto todo (death/hurt deitam o sprite e falseariam a conta).
        # Caixa do conteúdo no idle: o jogo usa `top` pra pendurar a barra
        # de vida na altura certa e `left`/`right` pra saber a largura do corpo.
        # A posição vertical do desenho NÃO vem daqui — todo frame do pacote
        # compartilha a mesma linha de chão (GROUND_LINE), e é ela que mantém
        # o morcego voando e o resto pisando no chão.
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
        print(f"  {slug:22s} {entry['anims']}  corpo y=[{top},{bottom}] x=[{left},{right}]")
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


def patch_icon_css(icons):
    """Regrava as classes `.ico--*` no styles.css.

    O bloco e a strip precisam concordar no numero e na ordem: um icone novo
    no fim da lista desloca todos os `background-position` se o CSS ficar pra
    tras. Gerar aqui elimina esse desencontro.
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
    print(f"  styles.css: {len(icons)} classes .ico--*")


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        raise SystemExit(1)
    pack, ui_dir, icon_sheet = sys.argv[1:4]
    print("personagens:")
    chars = extract_characters(pack)
    print("ui:")
    extract_ui(ui_dir)
    print("icones:")
    icons = extract_icons(icon_sheet)
    patch_icon_css(icons)
    out = os.path.join(ROOT, "assets", "manifest.json")
    with open(out, "w") as fh:
        json.dump({"characters": chars, "icons": icons}, fh, indent=2, sort_keys=True)
    print("manifesto ->", out)


if __name__ == "__main__":
    main()
