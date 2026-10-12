#!/usr/bin/env python3
"""Render the existing logo into Android launcher resources, without web packages."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

APP = Path(__file__).resolve().parents[1]
SOURCE = APP / "public/icon-512.svg"
RES = APP / "android/app/src/main/res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def generate():
    convert = shutil.which("magick") or shutil.which("convert")
    if not convert:
        raise SystemExit("ImageMagick is needed only to regenerate the committed PNG resources.")
    with tempfile.TemporaryDirectory(prefix="pixel-stack-icons-") as temp:
        # Keep the artwork, not the square background, in the adaptive layer.
        foreground = ET.parse(SOURCE)
        svg = foreground.getroot()
        background = svg.find("{http://www.w3.org/2000/svg}rect")
        if background is None:
            raise SystemExit("SVG structure changed: review the adaptive layer.")
        color = background.attrib["fill"]
        svg.remove(background)
        foreground_svg = Path(temp) / "foreground.svg"
        foreground.write(foreground_svg, encoding="utf-8", xml_declaration=True)
        for density, scale in DENSITIES.items():
            folder = RES / f"mipmap-{density}"
            folder.mkdir(parents=True, exist_ok=True)
            size = int(48 * scale)
            square = folder / "ic_launcher.png"
            round_icon = folder / "ic_launcher_round.png"
            subprocess.run([
                convert, "-background", "none", str(SOURCE), "-resize", f"{size}x{size}",
                "-depth", "8", f"PNG32:{square}",
            ], check=True)
            center = (size - 1) / 2
            subprocess.run([
                convert, str(square), "(", "-size", f"{size}x{size}", "xc:none",
                "-fill", "white", "-draw", f"circle {center},{center} {center},0",
                ")", "-compose", "DstIn", "-composite", f"PNG32:{round_icon}",
            ], check=True)
            # 48dp artwork on a 108dp canvas stays inside the circular safe zone.
            adaptive_size = int(108 * scale)
            subprocess.run([
                convert, "-background", "none", str(foreground_svg),
                "-resize", f"{size}x{size}", "-gravity", "center",
                "-extent", f"{adaptive_size}x{adaptive_size}", "-depth", "8",
                f"PNG32:{folder / 'ic_launcher_foreground.png'}",
            ], check=True)
        (RES / "values/ic_launcher_background.xml").write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'    <color name="ic_launcher_background">{color}</color>\n</resources>\n'
        )
    print("Generated 15 customized launcher PNGs across 5 densities.")


if __name__ == "__main__":
    generate()
