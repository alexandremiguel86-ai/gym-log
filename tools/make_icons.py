"""Gera os icones do PWA (docs/icon-192.png e icon-512.png).

Parte de tools/icon_source.png (o galo): recorta o quadrado central e reduz.
Roda uma vez so; os PNGs ficam versionados. Requer Pillow.
Uso:  python tools/make_icons.py
"""

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "docs"


def main():
    img = Image.open(HERE / "icon_source.png").convert("RGB")
    w, h = img.size
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    square = img.crop((left, top, left + s, top + s))
    for size in (192, 512):
        square.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
