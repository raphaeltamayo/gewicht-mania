"""Generate the favicon / home-screen / link-preview set from the source artwork."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC = "tools/icon-source.png"
OUT = "public"

BLUE_900 = (18, 48, 95)
SKY_1 = (179, 212, 236)
SKY_2 = (228, 239, 247)
CARMINE = (216, 50, 74)

src = Image.open(SRC).convert("RGB")

# --- square icons -----------------------------------------------------------
# The artwork is a tight crop of the nose; at 16px that reads as mush, so the
# small sizes get a little breathing room and the brand blue behind them.
def square(size, pad_ratio=0.0, bg=None):
    img = Image.new("RGB", (size, size), bg or BLUE_900)
    inner = round(size * (1 - 2 * pad_ratio))
    art = src.resize((inner, inner), Image.LANCZOS)
    # A 630px illustration reduced to 16 or 32 goes muddy; a little unsharp mask
    # puts the nose and the livery stripe back. Larger sizes are left alone.
    if size <= 64:
        art = art.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))
    off = (size - inner) // 2
    img.paste(art, (off, off))
    return img

for size in (16, 32, 48, 64, 180, 192, 512):
    square(size).save(f"{OUT}/icon-{size}.png")

# Windows/Chrome shortcuts and the browser tab still ask for .ico first.
square(64).save(f"{OUT}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

# iOS home screen: opaque, no rounding of our own (iOS masks it itself).
square(180).save(f"{OUT}/apple-touch-icon.png")

# --- link preview (Open Graph) ---------------------------------------------
# 1200x630 is what Slack / Discord / WhatsApp / iMessage crop against.
W, H = 1200, 630
og = Image.new("RGB", (W, H), SKY_2)
d = ImageDraw.Draw(og)
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=tuple(round(SKY_1[i] + (SKY_2[i] - SKY_1[i]) * t) for i in range(3)))

art = src.resize((H, H), Image.LANCZOS)
og.paste(art, (W - H, 0))
# Feather the artwork's left edge into the sky so it reads as one image.
for x in range(90):
    alpha = 1 - x / 90
    col = tuple(round(SKY_1[i] + (SKY_2[i] - SKY_1[i]) * ((x / 90) * 0.3)) for i in range(3))
    band = Image.new("RGB", (1, H), col)
    og.paste(band, (W - H + x, 0), Image.new("L", (1, H), round(255 * alpha)))

# Text lives in the clear band left of the artwork. Stacking the title keeps it
# out of the train's nose, and the size is fitted rather than guessed so it can
# never collide again if the wording changes.
MARGIN = 72
TEXT_W = (W - H) - MARGIN - 40

size = 104
while size > 40:
    title = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", size)
    if max(d.textlength("Gewicht", font=title), d.textlength("Mania", font=title)) <= TEXT_W:
        break
    size -= 4

sub = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 34)
line = round(size * 1.02)
top = 176

d.text((MARGIN, top), "Gewicht", font=title, fill=BLUE_900)
d.text((MARGIN, top + line), "Mania", font=title, fill=CARMINE)
d.text((MARGIN + 4, top + line * 2 + 34), "Duel de trains, 2 joueurs", font=sub, fill=(93, 110, 131))
d.text((MARGIN + 4, top + line * 2 + 80), "Jouable dans le navigateur", font=sub, fill=(93, 110, 131))

og.save(f"{OUT}/og.png", optimize=True)
print("written:", OUT)
