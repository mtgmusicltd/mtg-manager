"""
Generate app icons for Mac (.icns) and Windows (.ico) from the MTG logo PNG.
Run from the build-assets directory: python3 generate_icons.py
"""
from PIL import Image
import os
import struct
import zlib

SRC = os.path.join(os.path.dirname(__file__), 'icon-source.png')
OUT = os.path.dirname(__file__)

img = Image.open(SRC).convert('RGBA')

# ── PNG sizes needed ──────────────────────────────────────────────────────────
sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
pngs = {}
for s in sizes:
    resized = img.resize((s, s), Image.LANCZOS)
    path = os.path.join(OUT, f'icon_{s}.png')
    resized.save(path, 'PNG')
    pngs[s] = path
    print(f'  Generated {s}x{s} PNG')

# ── icon.png (512x512 for Linux) ──────────────────────────────────────────────
img.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon.png'), 'PNG')
print('  Generated icon.png (Linux)')

# ── icon.ico (Windows — multi-size) ──────────────────────────────────────────
ico_sizes = [16, 32, 48, 64, 128, 256]
ico_images = [Image.open(pngs[s]).convert('RGBA') for s in ico_sizes]
ico_path = os.path.join(OUT, 'icon.ico')
ico_images[0].save(
    ico_path,
    format='ICO',
    sizes=[(s, s) for s in ico_sizes],
    append_images=ico_images[1:]
)
print('  Generated icon.ico (Windows)')

# ── icon.icns (macOS) — manual ICNS construction ─────────────────────────────
# ICNS format: 4-byte magic + 4-byte file size + sequence of (type, size, data) chunks
icns_map = {
    'icp4': 16,   # 16x16
    'icp5': 32,   # 32x32
    'icp6': 64,   # 64x64
    'ic07': 128,  # 128x128
    'ic08': 256,  # 256x256
    'ic09': 512,  # 512x512
    'ic10': 1024, # 1024x1024
}

chunks = b''
for icon_type, size in icns_map.items():
    png_data = open(pngs[size], 'rb').read()
    chunk_size = 8 + len(png_data)
    chunks += icon_type.encode('ascii') + struct.pack('>I', chunk_size) + png_data

icns_data = b'icns' + struct.pack('>I', 8 + len(chunks)) + chunks
icns_path = os.path.join(OUT, 'icon.icns')
with open(icns_path, 'wb') as f:
    f.write(icns_data)
print('  Generated icon.icns (macOS)')

# ── Clean up intermediate PNGs ────────────────────────────────────────────────
for s in sizes:
    if s != 512:  # keep 512 as icon.png
        os.remove(pngs[s])

print('\nDone! Icons written to build-assets/:')
print('  icon.icns  — macOS')
print('  icon.ico   — Windows')
print('  icon.png   — Linux')
