# Generates all Android launcher icons from kuaa.png (1024x1024, opaque cream bg)
# - mipmap-*/ic_launcher.png          : full-bleed square (legacy, API < 26)
# - mipmap-*/ic_launcher_round.png    : circle-cropped, zoomed to hide the border frame
# - mipmap-*/ic_launcher_foreground.png: adaptive-icon foreground (72% of 108dp canvas,
#                                        key content stays inside the 72dp safe zone)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$srcPath = 'C:\Users\Maycon\Downloads\ManusIA\Kuaa\Atual com build\kuaa-app\kuaa.png'
$resPath = 'C:\Users\Maycon\Downloads\ManusIA\Kuaa\Atual com build\kuaa-app\android\app\src\main\res'

# Sample the background cream color from the source image corner
$srcFull = [System.Drawing.Bitmap]::FromFile($srcPath)
$c = $srcFull.GetPixel(5, 5)
$cream = '#{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B
$srcFull.Dispose()
Write-Output "Background cream: $cream"

# density -> legacy launcher icon size (dp * density)
$densities = [ordered]@{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }

function New-Canvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    return @($bmp, $g)
}

function Save-Png($bmp, [string]$path) {
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$src = New-Object System.Drawing.Bitmap($srcPath)

foreach ($entry in $densities.GetEnumerator()) {
    $density = $entry.Key
    $size = [int]$entry.Value
    $dir = Join-Path $resPath "mipmap-$density"

    # 1) Legacy square icon: full bleed (clamp alpha: GDI+ leaves semi-transparent edges)
    $r = New-Canvas $size $size
    $r[1].DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)))
    $r[1].Dispose()
    for ($y = 0; $y -lt $size; $y++) {
        for ($x = 0; $x -lt $size; $x++) {
            $p = $r[0].GetPixel($x, $y)
            if ($p.A -ne 255) { $r[0].SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B)) }
        }
    }
    Save-Png $r[0] (Join-Path $dir 'ic_launcher.png')

    # 2) Round icon: circle mask + 1.16 zoom so the decorative frame falls outside the circle
    $r = New-Canvas $size $size
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $size, $size)
    $r[1].SetClip($path)
    $zoom = [int]($size * 1.16)
    $off = [int](($size - $zoom) / 2)
    $r[1].DrawImage($src, (New-Object System.Drawing.Rectangle($off, $off, $zoom, $zoom)))
    $r[1].Dispose()
    Save-Png $r[0] (Join-Path $dir 'ic_launcher_round.png')

    # 3) Adaptive foreground: canvas = 108dp at this density (= icon * 2.25),
    #    art drawn at 72% so key content stays within the 72dp safe zone.
    $fg = [int]($size * 2.25)
    $r = New-Canvas $fg $fg
    $art = [int]($fg * 0.72)
    $aoff = [int](($fg - $art) / 2)
    $r[1].DrawImage($src, (New-Object System.Drawing.Rectangle($aoff, $aoff, $art, $art)))
    $r[1].Dispose()
    Save-Png $r[0] (Join-Path $dir 'ic_launcher_foreground.png')

    Write-Output "$density -> ic_launcher.png ${size}x${size} | round circle ${size}px | foreground ${fg}x${fg}"
}

$src.Dispose()

# 4) Adaptive-icon background color = cream sampled from the artwork
$bgXml = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$cream</color>
</resources>
"@
Set-Content -Path (Join-Path $resPath 'values\ic_launcher_background.xml') -Value $bgXml -Encoding UTF8
Write-Output "values/ic_launcher_background.xml -> $cream"
