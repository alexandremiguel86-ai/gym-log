"""Gera os icones do PWA (docs/icon-192.png e icon-512.png).

Roda uma vez so; os PNGs ficam versionados. Requer Pillow.
Uso:  python tools/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "docs"
BG = (15, 17, 21)
FG = (47, 125, 255)


def draw_icon(size):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    u = size / 32.0  # unidade de grade

    # Halter estilizado: barra central + dois pares de anilhas.
    cy = size / 2
    d.rounded_rectangle(
        [8 * u, cy - 1.6 * u, 24 * u, cy + 1.6 * u], radius=u, fill=FG
    )
    for cx in (7 * u, 25 * u):
        d.rounded_rectangle(
            [cx - 2.2 * u, cy - 7 * u, cx + 2.2 * u, cy + 7 * u], radius=1.5 * u, fill=FG
        )
    for cx in (3.2 * u, 28.8 * u):
        d.rounded_rectangle(
            [cx - 1.6 * u, cy - 4 * u, cx + 1.6 * u, cy + 4 * u], radius=u, fill=FG
        )
    return img


def main():
    for size in (192, 512):
        path = OUT / f"icon-{size}.png"
        draw_icon(size).save(path)
        print(path)


if __name__ == "__main__":
    main()
