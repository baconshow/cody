"""Builds packaging/cody.ico from web/icon-512.png (the same icon the phone uses). Build-time only: needs Pillow."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

if __name__ == "__main__":
    image = Image.open(ROOT / "web" / "icon-512.png").convert("RGBA")
    image.save(ROOT / "packaging" / "cody.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (256, 256)])
    print("packaging/cody.ico")
