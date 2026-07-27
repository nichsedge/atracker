#!/usr/bin/env python3
import os
from PIL import Image, ImageDraw

def generate_assets():
    source_path = '/home/al/.gemini/antigravity/brain/08d7f087-f708-43b1-abc3-70799d41109f/atracker_glassmorphic_icon_no_text_1785155953306.jpg'
    workspace = '/home/al/Projects/atracker'
    res_dir = os.path.join(workspace, 'atracker-android/app/src/main/res')
    logo_path = os.path.join(workspace, 'dashboards/dashboard-v2/public/logo.png')
    playstore_path = os.path.join(workspace, 'atracker-android/app/src/main/ic_launcher-playstore.png')
    
    if not os.path.exists(source_path):
        print(f"Error: Source image not found at {source_path}")
        return

    img = Image.open(source_path).convert('RGBA')
    # Crop squircle area (768x768 centered in 1024x1024)
    squircle_crop = img.crop((128, 128, 896, 896))
    
    # Save dashboard logo
    logo = squircle_crop.resize((512, 512), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(logo_path), exist_ok=True)
    logo.save(logo_path, 'PNG')
    print(f"Generated dashboard logo: {logo_path}")
    
    # Save Play Store high-res icon
    os.makedirs(os.path.dirname(playstore_path), exist_ok=True)
    logo.save(playstore_path, 'PNG')
    print(f"Generated Play Store launcher: {playstore_path}")
    
    # Create round icon mask
    w, h = squircle_crop.size
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, w, h), fill=255)
    
    round_crop = squircle_crop.copy()
    round_crop.putalpha(mask)
    
    # Create foreground for adaptive icon (108dp canvas with safe zone margin)
    fg_canvas_size = 1080
    fg_canvas = Image.new('RGBA', (fg_canvas_size, fg_canvas_size), (0, 0, 0, 0))
    
    # Scale squircle to safe zone (approx 720x720 inside 1080x1080 canvas)
    scaled_symbol = squircle_crop.resize((720, 720), Image.Resampling.LANCZOS)
    offset = (1080 - 720) // 2
    fg_canvas.paste(scaled_symbol, (offset, offset))
    
    densities = {
        'mipmap-mdpi': (48, 108),
        'mipmap-hdpi': (72, 162),
        'mipmap-xhdpi': (96, 216),
        'mipmap-xxhdpi': (144, 324),
        'mipmap-xxxhdpi': (192, 432),
    }
    
    for density, (full_size, fg_size) in densities.items():
        out_dir = os.path.join(res_dir, density)
        os.makedirs(out_dir, exist_ok=True)
        
        # 1. Full launcher icon (ic_launcher.webp)
        ic_full = squircle_crop.resize((full_size, full_size), Image.Resampling.LANCZOS)
        ic_full.save(os.path.join(out_dir, 'ic_launcher.webp'), 'WEBP', quality=95)
        
        # 2. Round launcher icon (ic_launcher_round.webp)
        ic_round = round_crop.resize((full_size, full_size), Image.Resampling.LANCZOS)
        ic_round.save(os.path.join(out_dir, 'ic_launcher_round.webp'), 'WEBP', quality=95)
        
        # 3. Foreground icon (ic_launcher_foreground.webp)
        ic_fg = fg_canvas.resize((fg_size, fg_size), Image.Resampling.LANCZOS)
        ic_fg.save(os.path.join(out_dir, 'ic_launcher_foreground.webp'), 'WEBP', quality=95)
        
        # 4. Monochrome icon (ic_launcher_monochrome.webp)
        ic_fg.save(os.path.join(out_dir, 'ic_launcher_monochrome.webp'), 'WEBP', quality=95)
        
        print(f"Generated assets for {density} ({full_size}x{full_size}, fg: {fg_size}x{fg_size})")

if __name__ == '__main__':
    generate_assets()
