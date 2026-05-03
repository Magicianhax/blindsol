"""
Crop the transparent margin from blindSOL.png so the artwork fills the
icon canvas, then export favicon assets at the right sizes for Next.js
App Router.

Browsers render favicons at fixed sizes (16/32 in tabs, 180 on iOS,
192/512 on Android). Whatever transparent padding the source has gets
shrunk along with the artwork — so we crop to the bounding box of
opaque pixels first, add a small breathing-room margin, then resize.

Run from the repo root:
    python apps/web/scripts/build-icons.py
"""
from PIL import Image
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SRC = REPO_ROOT / "assets" / "brand" / "blindSOL.png"
APP_DIR = REPO_ROOT / "apps" / "web" / "src" / "app"
PUBLIC_DIR = REPO_ROOT / "apps" / "web" / "public"

# Trimmed master canvas — we resize from this for each output.
MASTER_SIZE = 512
# Transparent padding around the artwork as a fraction of the master canvas.
PAD_RATIO = 0.06  # ~6% breathing room

def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    # Bounding box of any non-transparent pixel (alpha > ~5 to ignore noise).
    alpha = im.split()[3]
    bbox = alpha.point(lambda a: 255 if a > 5 else 0).getbbox()
    if not bbox:
        raise SystemExit("source image is entirely transparent — refusing to write empty icons")

    cropped = im.crop(bbox)
    print(f"source: {im.size}  ->  cropped: {cropped.size}  bbox: {bbox}")

    # Pad to a square so the artwork sits centered without distortion.
    cw, ch = cropped.size
    side = max(cw, ch)
    pad = int(side * PAD_RATIO)
    canvas_side = side + pad * 2
    canvas = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    canvas.paste(cropped, ((canvas_side - cw) // 2, (canvas_side - ch) // 2), cropped)

    # Master at MASTER_SIZE; downscale with LANCZOS for crisp small sizes.
    master = canvas.resize((MASTER_SIZE, MASTER_SIZE), Image.LANCZOS)

    # Next.js App Router auto-discovers these:
    #   app/icon.png        -> standard favicon (Next picks size hint from file)
    #   app/apple-icon.png  -> iOS home-screen icon (180x180 recommended)
    targets = [
        (APP_DIR / "icon.png", 512),
        (APP_DIR / "apple-icon.png", 180),
        # Public copy used by the header <img src="/blindSOL.png">
        (PUBLIC_DIR / "blindSOL.png", 512),
    ]
    for dest, size in targets:
        out = master.resize((size, size), Image.LANCZOS) if size != MASTER_SIZE else master
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, "PNG", optimize=True)
        print(f"wrote {dest.relative_to(REPO_ROOT)}  {size}x{size}  ({dest.stat().st_size:,} bytes)")

if __name__ == "__main__":
    main()
