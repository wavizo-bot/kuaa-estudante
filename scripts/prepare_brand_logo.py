"""Prepara variantes de ícone a partir do logo fornecido, preservando todo o símbolo colorido."""
from pathlib import Path
from PIL import Image, ImageChops

source = Path("/home/ubuntu/upload/logoappestudo.jpg")
target = Path("/home/ubuntu/webdev-static-assets")
target.mkdir(parents=True, exist_ok=True)

image = Image.open(source).convert("RGB")
background = Image.new("RGB", image.size, image.getpixel((0, 0)))
diff = ImageChops.difference(image, background).convert("L")
bounds = diff.point(lambda value: 255 if value > 18 else 0).getbbox()
if not bounds:
    raise RuntimeError("O logo não pôde ser identificado na imagem fornecida.")

left, top, right, bottom = bounds
padding = max(right - left, bottom - top) // 7
left, top = max(0, left - padding), max(0, top - padding)
right, bottom = min(image.width, right + padding), min(image.height, bottom + padding)
symbol = image.crop((left, top, right, bottom))

canvas_size = max(symbol.size)
canvas = Image.new("RGB", (canvas_size, canvas_size), (250, 250, 248))
offset = ((canvas_size - symbol.width) // 2, (canvas_size - symbol.height) // 2)
canvas.paste(symbol, offset)
canvas.save(target / "caderno-aprovacao-logo-master.png", optimize=True)

for size in (48, 72, 144, 192, 512):
    icon = canvas.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(target / f"caderno-aprovacao-logo-{size}.png", optimize=True)

canvas.resize((180, 180), Image.Resampling.LANCZOS).save(target / "caderno-aprovacao-favicon.png", optimize=True)
