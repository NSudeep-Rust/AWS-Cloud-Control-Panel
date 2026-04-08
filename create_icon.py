"""
Generate aws_cloudshield.ico for Windows toast notifications.
Requires: pip install Pillow
"""
import os
from PIL import Image, ImageDraw, ImageFont

def make_aws_icon(size=64):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Amber background circle
    pad = 2
    draw.ellipse([pad, pad, size - pad, size - pad], fill="#FF9900", outline="#e68a00", width=1)

    # "aws" text — try to use a bold font, fall back to default
    text = "aws"
    try:
        font = ImageFont.truetype("arialbd.ttf", int(size * 0.36))
    except Exception:
        try:
            font = ImageFont.truetype("arial.ttf", int(size * 0.36))
        except Exception:
            font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1] - int(size * 0.05)
    draw.text((tx, ty), text, fill="#232F3E", font=font)

    # Swoosh — small arc at the bottom
    sw_y = int(size * 0.72)
    sw_x1 = int(size * 0.22)
    sw_x2 = int(size * 0.78)
    draw.arc([sw_x1, sw_y - int(size*0.08), sw_x2, sw_y + int(size*0.10)],
             start=170, end=10, fill="#232F3E", width=max(1, int(size*0.04)))

    return img

def main():
    out_dir = os.path.join(os.path.dirname(__file__), "app", "assets")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "aws_cloudshield.ico")

    # Create multiple sizes for proper ICO
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [make_aws_icon(s) for s in sizes]

    # Save as ICO
    images[0].save(
        out_path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[1:],
    )
    print(f"✅ Icon saved to: {out_path}")

if __name__ == "__main__":
    main()
