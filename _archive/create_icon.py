"""
create_icon.py — Generate a sharp AWS CloudShield icon for Windows toast notifications.

Technique: draw at 4× the target resolution, then downscale with LANCZOS.
This gives clean, anti-aliased edges at every export size.

Usage:
    python create_icon.py
Output:
    app/assets/aws_cloudshield.ico  — multi-size ICO (16–256px)
    app/assets/aws_cloudshield.png  — 256px PNG (fallback for Linux / HTML)
"""

import os
from PIL import Image, ImageDraw, ImageFont

# ── Config ────────────────────────────────────────────────────────────────────
AMBER   = "#FF9900"
AMBER_D = "#e68a00"   # slightly darker for gradient feel
DARK    = "#232F3E"   # AWS navy / dark text
WHITE   = "#FFFFFF"

ICON_SIZES  = [16, 24, 32, 48, 64, 128, 256]   # all embedded in the ICO
RENDER_SIZE = 1024                               # draw at 4× → sharp anti-aliasing
EXPORT_PNG  = 256                                # PNG export size


def _best_font(size_px: int) -> ImageFont.ImageFont:
    """Try common bold fonts in order; fall back to PIL default."""
    candidates = [
        "arialbd.ttf",          # Windows Arial Bold
        "Arial Bold.ttf",
        "DejaVuSans-Bold.ttf",  # Linux
        "Helvetica-Bold.ttf",
        "arial.ttf",
        "DejaVuSans.ttf",
    ]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size_px)
        except Exception:
            pass
    return ImageFont.load_default()


def make_aws_icon(target_size: int) -> Image.Image:
    """
    Render a crisp AWS-style icon at `target_size` px.
    Draws internally at RENDER_SIZE then downscales.
    """
    S = RENDER_SIZE   # shorthand for the large canvas

    img  = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # ── 1. Background circle ─────────────────────────────────────────────────
    margin = int(S * 0.03)
    draw.ellipse(
        [margin, margin, S - margin, S - margin],
        fill=AMBER,
        outline=AMBER_D,
        width=int(S * 0.015),
    )

    # ── 2. "aws" text — centred, bold, deep navy ─────────────────────────────
    font_size = int(S * 0.38)
    font = _best_font(font_size)

    text = "aws"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw   = bbox[2] - bbox[0]
    th   = bbox[3] - bbox[1]
    tx   = (S - tw) // 2 - bbox[0]
    # Push text slightly above centre to leave room for the swoosh
    ty   = int(S * 0.14) - bbox[1]

    draw.text((tx, ty), text, fill=DARK, font=font)

    # ── 3. Amazon swoosh ─────────────────────────────────────────────────────
    # A wide smile arc below the text — mimics the amazon.com swoosh arrow
    sw_thick  = int(S * 0.058)
    sw_top    = int(S * 0.59)
    sw_left   = int(S * 0.13)
    sw_right  = int(S * 0.87)
    sw_bottom = sw_top + int(S * 0.24)

    # PIL angles: 0°=East, 90°=South (clockwise).
    # start=10, end=170 traces the BOTTOM half of the ellipse
    # → smile arc from right-slightly-below → bottom → left-slightly-below
    ARC_START = 10    # right end of arc
    ARC_END   = 170   # left  end of arc

    draw.arc(
        [sw_left, sw_top, sw_right, sw_bottom],
        start=ARC_START, end=ARC_END,
        fill=DARK,
        width=sw_thick,
    )

    # ── 4. Arrow-head at the left tip of the swoosh ──────────────────────────
    # Compute the exact ellipse point at ARC_END (170°) using PIL's clockwise convention:
    #   x = cx + rx * cos(θ),  y = cy + ry * sin(θ)
    import math as _m
    cx_arc = (sw_left + sw_right)  / 2
    cy_arc = (sw_top  + sw_bottom) / 2
    rx     = (sw_right - sw_left)  / 2
    ry     = (sw_bottom - sw_top)  / 2

    tip_x = cx_arc + rx * _m.cos(_m.radians(ARC_END))
    tip_y = cy_arc + ry * _m.sin(_m.radians(ARC_END))

    # Tangent direction at ARC_END (clockwise tangent): (-sin θ, +cos θ)
    tang_x = -_m.sin(_m.radians(ARC_END))
    tang_y =  _m.cos(_m.radians(ARC_END))

    arr_len  = int(S * 0.09)
    arr_wing = int(S * 0.055)

    tip_px   = tip_x + tang_x * arr_len * 0.2
    tip_py   = tip_y + tang_y * arr_len * 0.2
    base_x   = tip_x - tang_x * arr_len
    base_y   = tip_y - tang_y * arr_len
    perp_x   = -tang_y
    perp_y   =  tang_x

    draw.polygon(
        [
            (tip_px, tip_py),
            (base_x + perp_x * arr_wing, base_y + perp_y * arr_wing),
            (base_x - perp_x * arr_wing, base_y - perp_y * arr_wing),
        ],
        fill=DARK,
    )


    # ── 5. Downscale to target size with LANCZOS (sharp, anti-aliased) ───────
    return img.resize((target_size, target_size), Image.LANCZOS)


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app", "assets")
    os.makedirs(out_dir, exist_ok=True)

    ico_path = os.path.join(out_dir, "aws_cloudshield.ico")
    png_path = os.path.join(out_dir, "aws_cloudshield.png")

    print(f"Rendering {len(ICON_SIZES)} icon sizes at {RENDER_SIZE}px (LANCZOS downscale)…")
    images = [make_aws_icon(s) for s in ICON_SIZES]   # [16,24,32,48,64,128,256]

    # ── Save ICO ─────────────────────────────────────────────────────────────
    # Key: use the LARGEST image as primary; Pillow embeds each image in
    # append_images as-is (preserving its size), giving us all 7 frames.
    images[-1].save(
        ico_path,
        format="ICO",
        append_images=images[:-1],
    )
    ico_kb = round(os.path.getsize(ico_path) / 1024, 1)
    print(f"✅ ICO  → {ico_path}  ({ico_kb} KB)")

    # ── Save PNG (256px — used directly by winotify for sharp notifications) ─
    images[-1].save(png_path, format="PNG")
    png_kb = round(os.path.getsize(png_path) / 1024, 1)
    print(f"✅ PNG  → {png_path}  ({png_kb} KB)")

    # Sanity check — verify all ICO frames are present
    ico_check = Image.open(ico_path)
    frames = []
    try:
        while True:
            frames.append(ico_check.size[0])
            ico_check.seek(ico_check.tell() + 1)
    except EOFError:
        pass
    print(f"✅ ICO frames: {sorted(frames, reverse=True)}")


if __name__ == "__main__":
    main()
