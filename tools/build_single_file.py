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


def build_modules(entry):
    """Converte cada módulo numa data: URL, das folhas para a raiz."""
    urls = {}
    visiting = set()

    def visit(rel):
        if rel in urls:
            return urls[rel]
        if rel in visiting:
            raise SystemExit(f"ciclo de import em {rel}")
        visiting.add(rel)

        source = read(rel)
        for spec in dict.fromkeys(deps_of(source)):
            dep_url = visit(resolve(rel, spec))
            source = re.sub(
                rf"(['\"]){re.escape(spec)}\1",
                lambda _m, u=dep_url: f'"{u}"',
                source,
            )

        visiting.discard(rel)
        encoded = base64.b64encode(source.encode("utf-8")).decode()
        urls[rel] = f"data:text/javascript;base64,{encoded}"
        return urls[rel]

    return visit(entry)


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

    body_extra = (
        f"<script>globalThis.__ASSET_MAP={json.dumps(images, separators=(',', ':'))};</script>\n"
        f'<script type="module" src="{build_modules(ENTRY)}"></script>'
    )
    html = html.replace("</body>", body_extra + "\n</body>")

    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(html)
    size = os.path.getsize(out_path) / 1024
    print(f"{out_path}  ({size:.0f} KB, {len(images)} imagens embutidas)")


if __name__ == "__main__":
    main()
