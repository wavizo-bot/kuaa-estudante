from pathlib import Path
from PIL import Image, ImageOps

source = Path('/home/ubuntu/webdev-static-assets/caderno-aprovacao-logo.png')
target = Path('/home/ubuntu/duolingo-concurso-preview/client/public/icons')
target.mkdir(parents=True, exist_ok=True)

logo = Image.open(source).convert('RGBA')

for size, padding, filename in [
    (192, 20, 'icon-192.png'),
    (512, 54, 'icon-512.png'),
    (512, 104, 'icon-maskable-512.png'),
]:
    canvas = Image.new('RGBA', (size, size), '#17324D')
    limit = size - (padding * 2)
    mark = ImageOps.contain(logo, (limit, limit), Image.Resampling.LANCZOS)
    x = (size - mark.width) // 2
    y = (size - mark.height) // 2
    canvas.alpha_composite(mark, (x, y))
    canvas.save(target / filename, 'PNG', optimize=True)
