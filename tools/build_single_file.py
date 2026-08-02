#!/usr/bin/env python3
"""Empacota o jogo inteiro num único .html que abre com dois cliques.

    python3 tools/build_single_file.py [saida.html]

Sem servidor, sem pasta ao lado: CSS embutido, cada módulo ES vira uma
`data:` URL (mantendo o grafo de imports intacto) e as imagens viram data URI
num mapa que o loader consulta.
"""
import base64
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRY = "src/main.js"
IMPORT_RE = re.compile(r"""(\bfrom\s*|^\s*import\s*)(['"])([./][^'"]+)\2""", re.M)


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def data_uri(rel, mime):
    with open(os.path.join(ROOT, rel), "rb") as fh:
        return f"data:{mime};base64," + base64.b64encode(fh.read()).decode()


def deps_of(source):
    return [m.group(3) for m in IMPORT_RE.finditer(source)]


def resolve(importer, spec):
    return os.path.normpath(os.path.join(os.path.dirname(importer), spec)).replace(os.sep, "/")


def bare(rel):
    """Especificador nu de um módulo, resolvido pelo import map."""
    return "@rpg/" + rel


def build_modules(entry):
    """
    Cada módulo vira uma data: URL registrada num import map, e os imports
    relativos viram especificadores nus.

    A tentação é embutir a data: URL da dependência dentro de quem importa,
    mas aí um módulo usado por três outros entra três vezes no arquivo — e
    como isso é transitivo, o tamanho explode (o `format.js`, importado por
    meio projeto, chegou a aparecer umas dez vezes). Com o import map cada
    módulo aparece exatamente uma vez.
    """
    imports = {}
    seen = set()

    def visit(rel):
        if rel in seen:
            return
        seen.add(rel)

        source = read(rel)
        for spec in dict.fromkeys(deps_of(source)):
            dep = resolve(rel, spec)
            visit(dep)
            source = re.sub(rf"(['\"]){re.escape(spec)}\1", f'"{bare(dep)}"', source)

        encoded = base64.b64encode(source.encode("utf-8")).decode()
        imports[bare(rel)] = f"data:text/javascript;base64,{encoded}"

    visit(entry)
    return imports


def collect_images():
    """Todo PNG de assets/, indexado pelo caminho que o jogo pede em runtime."""
    out = {}
    for folder, _dirs, files in os.walk(os.path.join(ROOT, "assets")):
        for name in sorted(files):
            if not name.endswith(".png"):
                continue
            rel = os.path.relpath(os.path.join(folder, name), ROOT).replace(os.sep, "/")
            out[rel] = data_uri(rel, "image/png")
    return out


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "little-rpg.html")
    images = collect_images()

    css = read("styles.css")
    for rel, uri in images.items():
        css = css.replace(f"url({rel})", f"url({uri})")

    html = read("index.html")
    # remove os links externos: tudo passa a ser embutido
    html = re.sub(r'\s*<link rel="stylesheet"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="icon"[^>]*>', "", html)
    html = re.sub(r'\s*<script type="module"[^>]*></script>', "", html)

    head_extra = (
        f'<link rel="icon" href="{images["assets/icons/icons.png"]}" type="image/png">\n'
        f"<style>\n{css}\n</style>"
    )
    html = html.replace("</head>", head_extra + "\n</head>")

    modules = build_modules(ENTRY)
    import_map = json.dumps({"imports": modules}, separators=(",", ":"))
    body_extra = (
        f"<script>globalThis.__ASSET_MAP={json.dumps(images, separators=(',', ':'))};</script>\n"
        f'<script type="importmap">{import_map}</script>\n'
        f'<script type="module">import "{bare(ENTRY)}";</script>'
    )
    html = html.replace("</body>", body_extra + "\n</body>")

    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(html)
    size = os.path.getsize(out_path) / 1024
    print(f"{out_path}  ({size:.0f} KB, {len(images)} imagens, {len(modules)} módulos)")


if __name__ == "__main__":
    main()
