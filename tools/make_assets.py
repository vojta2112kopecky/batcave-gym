#!/usr/bin/env python3
"""
Vygeneruje ikony a úvodní obrazovky pro appku (netopýr na tmavém pozadí).
Bez externích knihoven – rasterizuje se přímo cesta z js/icons.js.

    python3 tools/make_assets.py
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# pravá polovina znaku, střed x = 1000 (shodné s js/icons.js)
RIGHT = [
    ("M", 1000, 360), ("L", 1080, 245), ("L", 1115, 440),
    ("C", 1300, 425, 1440, 372, 1495, 300),
    ("C", 1472, 240, 1450, 192, 1420, 155),
    ("C", 1600, 250, 1800, 400, 1930, 610),
    ("C", 1800, 656, 1640, 700, 1500, 738),
    ("C", 1400, 762, 1330, 780, 1270, 800),
    ("C", 1160, 850, 1060, 908, 1000, 965),
]
VX, VY, VW, VH = 60, 140, 1880, 840


def flatten(steps=26):
    pts, cur = [], (0.0, 0.0)
    for c in RIGHT:
        if c[0] in ("M", "L"):
            cur = (float(c[1]), float(c[2]))
            pts.append(cur)
        else:
            x1, y1, x2, y2, x3, y3 = map(float, c[1:])
            x0, y0 = cur
            for i in range(1, steps + 1):
                t = i / steps
                u = 1 - t
                pts.append((u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
                            u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3))
            cur = (x3, y3)
    return pts


def bat_polygon():
    right = flatten()
    return right + [(2000 - x, y) for x, y in reversed(right)]


def render(W, H, bat_width_ratio, out, flat_bg=False):
    poly0 = bat_polygon()
    scale = (W * bat_width_ratio) / VW
    ox = (W - VW * scale) / 2
    oy = (H - VH * scale) / 2
    poly = [((x - VX) * scale + ox, (y - VY) * scale + oy) for x, y in poly0]

    # pozadí
    px = []
    for y in range(H):
        if flat_bg:
            px.append([(0, 0, 0)] * W)
        else:
            t = y / max(1, H - 1)
            px.append([(round(13 * (1 - t)), round(23 * (1 - t)), round(41 * (1 - t)))] * W)

    SUB = 3
    n = len(poly)
    for sy in range(H * SUB):
        yy = (sy + 0.5) / SUB
        row_i = int(yy)
        if row_i >= H:
            continue
        xs = []
        for i in range(n):
            x1, y1 = poly[i]
            x2, y2 = poly[(i + 1) % n]
            if (y1 <= yy < y2) or (y2 <= yy < y1):
                xs.append(x1 + (yy - y1) * (x2 - x1) / (y2 - y1))
        if not xs:
            continue
        xs.sort()
        row = px[row_i]
        for i in range(0, len(xs) - 1, 2):
            a, b = xs[i], xs[i + 1]
            for x in range(max(0, int(a)), min(W, int(b) + 1)):
                l, r = max(a, x), min(b, x + 1)
                if r <= l:
                    continue
                c = (r - l) / SUB
                r0, g0, b0 = row[x]
                row[x] = (min(255, round(r0 + (255 - r0) * c)),
                          min(255, round(g0 + (255 - g0) * c)),
                          min(255, round(b0 + (255 - b0) * c)))

    raw = b"".join(b"\x00" + b"".join(struct.pack("3B", *px[y][x]) for x in range(W)) for y in range(H))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">2I5B", W, H, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path = os.path.join(ROOT, out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(png)
    print(f"{out}: {W}×{H}, {len(png)//1024} kB")


if __name__ == "__main__":
    # ikony
    render(1024, 1024, 0.80, "icon.png")
    render(180, 180, 0.80, "icon-180.png")
    # úvodní obrazovky (iPhone 15 Pro / Pro Max / 13–14)
    for w, h in [(1179, 2556), (1290, 2796), (1170, 2532), (1206, 2622), (1320, 2868)]:
        render(w, h, 0.62, f"splash/{w}x{h}.png", flat_bg=True)
