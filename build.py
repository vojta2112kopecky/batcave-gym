#!/usr/bin/env python3
"""
Sbalí appku do jednoho HTML souboru (CSS i JS inline).
Použití:  python3 ~/trenink_app/build.py
Výstup:   dist/batcave-gym.html        – kompletní stránka (otevřeš dvojklikem)
          dist/artifact.html           – bez <html>/<head>/<body>, pro publikaci
"""
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


# --- otisk verze do odkazů, ať prohlížeč po nasazení nedrží starý soubor ---
def stamp_index():
    src = read("index.html")
    assets = re.findall(r'(?:href|src)="((?:css|js)/[^"?]+)(?:\?v=[^"]*)?"', src)
    h = hashlib.sha1()
    for a in sorted(set(assets)):
        h.update(read(a).encode())
    ver = h.hexdigest()[:8]
    out = re.sub(r'((?:href|src)="(?:css|js)/[^"?]+)(?:\?v=[^"]*)?"', r'\1?v=' + ver + '"', src)
    if out != src:
        with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8") as f:
            f.write(out)
    print("verze assetů:", ver)
    return out


html = stamp_index()

# CSS inline
for m in re.findall(r'<link rel="stylesheet" href="([^"]+)">', html):
    html = html.replace(f'<link rel="stylesheet" href="{m}">',
                        "<style>\n" + read(m.split("?")[0]) + "\n</style>")

# JS inline
for m in re.findall(r'<script src="([^"]+)"></script>', html):
    html = html.replace(f'<script src="{m}"></script>',
                        "<script>\n" + read(m.split("?")[0]) + "\n</script>")

# manifest a ikona nedávají ve standalone souboru smysl
html = re.sub(r'\s*<link rel="(manifest|apple-touch-icon|icon)"[^>]*>', "", html)

os.makedirs(DIST, exist_ok=True)
with open(os.path.join(DIST, "batcave-gym.html"), "w", encoding="utf-8") as f:
    f.write(html)

# verze pro publikaci: jen obsah, bez kostry dokumentu
body = html
body = re.sub(r"(?is)^.*?<head[^>]*>", "", body)
body = body.replace("</head>", "").replace("</html>", "")
body = re.sub(r"(?is)<meta[^>]*>", "", body)
body = re.sub(r"(?is)<body[^>]*>", "", body).replace("</body>", "")
body = re.sub(r"\n{3,}", "\n\n", body).strip()

with open(os.path.join(DIST, "artifact.html"), "w", encoding="utf-8") as f:
    f.write(body)

for name in ("batcave-gym.html", "artifact.html"):
    p = os.path.join(DIST, name)
    print(f"{name}: {os.path.getsize(p) // 1024} kB")
