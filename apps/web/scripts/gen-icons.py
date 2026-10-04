#!/usr/bin/env python3
"""Erzeugt PWA-Icons (Motiv: Tagesschiene mit drei Knoten). Aufruf: python3 scripts/gen-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
INK = (16, 34, 46)       # #10222E
VERDIGRIS = (70, 183, 163)  # #46B7A3
COPPER = (214, 125, 70)
LEMON = (242, 194, 48)
S = 2048  # Supersampling-Fläche

def draw(safe: float) -> Image.Image:
    img = Image.new("RGB", (S, S), INK)
    d = ImageDraw.Draw(img)
    cx = S * 0.5
    span = S * safe            # nutzbare Höhe
    top = (S - span) / 2
    ys = [top + span * f for f in (0.12, 0.50, 0.88)]
    w = int(S * 0.028)
    d.rounded_rectangle([cx - w, ys[0], cx + w, ys[2]], radius=w, fill=(60, 96, 112))
    r = S * 0.07 * safe / 0.74
    # Knoten 1: Krafttraining (Kupfer-Raute)
    y = ys[0]; rr = r * 0.95
    d.polygon([(cx, y - rr), (cx + rr, y), (cx, y + rr), (cx - rr, y)], fill=COPPER)
    # Knoten 2: Mahlzeit (Patina-Kreis) mit Zitronen-Ring = „jetzt"
    y = ys[1]; ring = r * 1.5
    d.ellipse([cx - ring, y - ring, cx + ring, y + ring], outline=LEMON, width=int(S * 0.026))
    d.ellipse([cx - r, y - r, cx + r, y + r], fill=VERDIGRIS)
    # Knoten 3: Spätsnack (Patina-Ring)
    y = ys[2]; rr = r * 0.8
    d.ellipse([cx - rr, y - rr, cx + rr, y + rr], outline=VERDIGRIS, width=int(S * 0.04))
    return img

def save(name: str, size: int, safe: float):
    draw(safe).resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)

save("icon-192.png", 192, 0.74)
save("icon-512.png", 512, 0.74)
save("icon-maskable-512.png", 512, 0.52)   # Safe-Zone (Maskable: Inhalt im inneren 80 % Kreis)
save("apple-touch-icon.png", 180, 0.74)
print("Icons:", sorted(p.name for p in OUT.iterdir()))
