#!/usr/bin/env python3
"""Bundle the whole game into a single .html you can open with two clicks.

    python3 tools/build_single_file.py [output.html]

No server, no folder alongside it: CSS inlined, every ES module becomes a
`data:` URL (with the import graph intact) and images become data URIs in a
map the loader reads.
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
    """Bare specifier for a module, resolved through the import map."""
    return "@rpg/" + rel


def build_modules(entry):
    """
    Every module becomes a data: URL registered in an import map, and relative
    imports become bare specifiers.

    The tempting shortcut is inlining a dependency's data: URL inside whoever
    imports it, but then a module used by three others lands in the file three
    times, and since that is transitive the size explodes (`format.js`,
    imported by half the project, ended up appearing about ten times). With an
    import map every module appears exactly once.
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
    """Every PNG under assets/, keyed by the path the game asks for at runtime."""
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
    # drop the external links: everything is inlined from here on
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
    print(f"{out_path}  ({size:.0f} KB, {len(images)} images, {len(modules)} modules)")


if __name__ == "__main__":
    main()
