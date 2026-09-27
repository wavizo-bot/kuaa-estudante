"""Instala o símbolo de marca como ícone Android em todas as densidades suportadas."""
from pathlib import Path
from PIL import Image

source = Path("/home/ubuntu/webdev-static-assets/caderno-aprovacao-logo-master.png")
res = Path("/home/ubuntu/duolingo-concurso-preview/android/app/src/main/res")
sizes = {"mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96, "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192}
master = Image.open(source).convert("RGBA")

for folder, size in sizes.items():
    target = res / folder
    target.mkdir(parents=True, exist_ok=True)
    icon = master.resize((size, size), Image.Resampling.LANCZOS)
    for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
        icon.save(target / name, optimize=True)
