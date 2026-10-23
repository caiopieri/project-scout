"""Draws synthetic product photos for the visual checkup lab (no real listing photos are used).

Writes phone_cracked.jpg (shattered screen, screen on), phone_clean.jpg (intact, screen on),
phone_back_dent.jpg (dented corner) and laptop_missing_key.jpg into the given directory.
Usage: python3 -I scripts/lab/make-checkup-images.py <outDir>
"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
random.seed(7)


def phone(screen_on=True):
    image = Image.new("RGB", (768, 1024), (214, 208, 196))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((214, 112, 554, 912), radius=48, fill=(28, 28, 30))
    screen = (232, 150, 536, 874)
    if screen_on:
        draw.rounded_rectangle(screen, radius=30, fill=(60, 120, 200))
        for row in range(4):
            for col in range(4):
                x, y = 262 + col * 68, 200 + row * 90
                draw.rounded_rectangle((x, y, x + 48, y + 48), radius=12, fill=(240, 240, 245))
        draw.text((330, 170), "12:41", fill=(255, 255, 255))
    else:
        draw.rounded_rectangle(screen, radius=30, fill=(8, 8, 10))
    draw.rounded_rectangle((344, 128, 424, 142), radius=7, fill=(10, 10, 10))
    return image, draw


def cracks(draw, origin, count=26):
    ox, oy = origin
    for _ in range(count):
        x, y = ox, oy
        for _ in range(random.randint(4, 9)):
            nx = x + random.randint(-70, 70)
            ny = y + random.randint(-90, 90)
            draw.line((x, y, nx, ny), fill=(235, 235, 235), width=random.choice([2, 2, 3]))
            x, y = nx, ny
    draw.ellipse((ox - 16, oy - 16, ox + 16, oy + 16), outline=(250, 250, 250), width=3)


image, draw = phone(screen_on=True)
cracks(draw, (420, 640))
image.filter(ImageFilter.SMOOTH).save(out / "phone_cracked.jpg", quality=88)

image, _ = phone(screen_on=True)
image.save(out / "phone_clean.jpg", quality=88)

image = Image.new("RGB", (768, 1024), (214, 208, 196))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((214, 112, 554, 912), radius=48, fill=(70, 72, 78))
draw.rounded_rectangle((246, 150, 376, 290), radius=28, fill=(40, 40, 44))
for cx, cy in ((286, 190), (336, 190), (286, 245)):
    draw.ellipse((cx - 20, cy - 20, cx + 20, cy + 20), fill=(15, 15, 18))
draw.polygon([(554, 760), (500, 812), (520, 880), (554, 912)], fill=(120, 122, 128))
draw.line((500, 812, 554, 760), fill=(30, 30, 30), width=4)
draw.line((500, 812, 520, 880), fill=(30, 30, 30), width=4)
image.save(out / "phone_back_dent.jpg", quality=88)

image = Image.new("RGB", (1024, 768), (214, 208, 196))
draw = ImageDraw.Draw(image)
draw.rectangle((112, 260, 912, 660), fill=(180, 182, 188))
for row in range(5):
    for col in range(13):
        x, y = 160 + col * 54, 300 + row * 54
        if (row, col) in {(1, 4), (2, 7)}:
            draw.rectangle((x, y, x + 44, y + 44), fill=(90, 90, 96))
            draw.ellipse((x + 18, y + 18, x + 26, y + 26), fill=(200, 200, 200))
        else:
            draw.rectangle((x, y, x + 44, y + 44), fill=(30, 30, 34))
draw.rectangle((400, 590, 624, 650), fill=(160, 162, 168))
image.save(out / "laptop_missing_key.jpg", quality=88)
print("wrote", sorted(p.name for p in out.iterdir()))
