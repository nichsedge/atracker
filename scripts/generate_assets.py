#!/usr/bin/env python3
import os
import re
import subprocess
import sys

def main():
    print("🚀 Starting asset compiler for Atracker launcher icons...")

    # Paths
    workspace = "/home/al/Projects/atracker"
    svg_path = os.path.join(workspace, "dashboards/dashboard-v2/public/favicon.svg")
    logo_path = os.path.join(workspace, "dashboards/dashboard-v2/public/logo.png")
    android_res = os.path.join(workspace, "atracker-android/app/src/main/res")
    playstore_path = os.path.join(workspace, "atracker-android/app/src/main/ic_launcher-playstore.png")

    if not os.path.exists(svg_path):
        print(f"Error: Source SVG not found at {svg_path}")
        sys.exit(1)

    # 1. Generate high-resolution logo.png from SVG
    print("Creating dashboard logo.png from SVG...")
    subprocess.run(["convert", "-background", "none", "-size", "512x512", svg_path, logo_path], check=True)

    # Copy to Play Store icon
    print(f"Deploying Play Store high-res icon -> {playstore_path}")
    subprocess.run(["cp", logo_path, playstore_path], check=True)

    # 2. Read SVG content
    with open(svg_path, "r") as f:
        svg_content = f.read()

    # 3. Create Foreground SVG (transparent background, strips the rect element)
    rect_pattern = r'<rect[^>]*fill="url\(#bgGrad\)"[^>]*/>'
    fg_svg_content = re.sub(rect_pattern, '', svg_content)

    temp_fg_path = "/tmp/atracker_fg_temp.svg"
    with open(temp_fg_path, "w") as f:
        f.write(fg_svg_content)
    print("Created temporary foreground SVG.")

    # 4. Create Monochrome SVG (same as foreground, but tint white and remove glow filter)
    mono_svg_content = fg_svg_content
    mono_svg_content = mono_svg_content.replace('stroke="url(#loopGrad)"', 'stroke="#FFFFFF"')
    mono_svg_content = mono_svg_content.replace('filter="url(#subtleGlow)"', '')

    temp_mono_path = "/tmp/atracker_mono_temp.svg"
    with open(temp_mono_path, "w") as f:
        f.write(mono_svg_content)
    print("Created temporary monochrome SVG.")

    # 5. Define target directories and pixel sizes
    densities = {
        "mdpi": {"fg": 108, "launcher": 48},
        "hdpi": {"fg": 162, "launcher": 72},
        "xhdpi": {"fg": 216, "launcher": 96},
        "xxhdpi": {"fg": 324, "launcher": 144},
        "xxxhdpi": {"fg": 432, "launcher": 192}
    }

    for density, sizes in densities.items():
        dir_path = os.path.join(android_res, f"mipmap-{density}")
        os.makedirs(dir_path, exist_ok=True)
        print(f"\nProcessing density: {density}...")

        # A. Foreground icon (Adaptive)
        fg_out = os.path.join(dir_path, "ic_launcher_foreground.webp")
        subprocess.run([
            "convert", "-background", "none",
            "-size", f"{sizes['fg']}x{sizes['fg']}",
            temp_fg_path, fg_out
        ], check=True)
        print(f"  -> Generated foreground adaptive ({sizes['fg']}x{sizes['fg']}): {fg_out}")

        # B. Monochrome icon (Adaptive)
        mono_out = os.path.join(dir_path, "ic_launcher_monochrome.webp")
        subprocess.run([
            "convert", "-background", "none",
            "-size", f"{sizes['fg']}x{sizes['fg']}",
            temp_mono_path, mono_out
        ], check=True)
        print(f"  -> Generated monochrome adaptive ({sizes['fg']}x{sizes['fg']}): {mono_out}")

        # C. Full flat icon (Legacy fallback)
        launcher_out = os.path.join(dir_path, "ic_launcher.webp")
        subprocess.run([
            "convert", "-background", "none",
            "-size", f"{sizes['launcher']}x{sizes['launcher']}",
            svg_path, launcher_out
        ], check=True)
        print(f"  -> Generated legacy square launcher ({sizes['launcher']}x{sizes['launcher']}): {launcher_out}")

        # D. Full round icon (Legacy round fallback)
        round_out = os.path.join(dir_path, "ic_launcher_round.webp")
        subprocess.run([
            "convert", "-background", "none",
            "-size", f"{sizes['launcher']}x{sizes['launcher']}",
            svg_path, round_out
        ], check=True)
        print(f"  -> Generated legacy round launcher ({sizes['launcher']}x{sizes['launcher']}): {round_out}")

    # Clean up temps
    if os.path.exists(temp_fg_path):
        os.remove(temp_fg_path)
    if os.path.exists(temp_mono_path):
        os.remove(temp_mono_path)

    print("\n🎉 Android icons compiled successfully for all densities!")

if __name__ == "__main__":
    main()
