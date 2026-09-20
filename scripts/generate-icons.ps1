Add-Type -AssemblyName System.Drawing

$srcPath = "e:\Google-AntiGravity-Projects\Apps-Web-Applications\assets\The-Competitive-Edge-Logo.jpg"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source logo file not found: $srcPath"
    exit 1
}

$srcImage = [System.Drawing.Image]::FromFile($srcPath)
Write-Output "Loaded Source Logo: $($srcImage.Width) x $($srcImage.Height)"

function Save-ResizedImage {
    param (
        [System.Drawing.Image]$Image,
        [int]$Width,
        [int]$Height,
        [string]$DestinationPath,
        [bool]$Round = $false,
        [bool]$AdaptiveForeground = $false
    )

    $parent = [System.IO.Path]::GetDirectoryName($DestinationPath)
    if (-not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $destBmp = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    if ($Round) {
        $g.Clear([System.Drawing.Color]::Transparent)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $Width, $Height)
        $g.SetClip($path)
        # Background fill inside circle
        $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 11, 22, 40))
        $g.FillEllipse($bgBrush, 0, 0, $Width, $Height)
        $bgBrush.Dispose()
        # Draw image inside circle
        $g.DrawImage($Image, 0, 0, $Width, $Height)
        $path.Dispose()
    } elseif ($AdaptiveForeground) {
        # Transparent background, logo centered within the 66.6% safe zone (72dp of 108dp)
        $g.Clear([System.Drawing.Color]::Transparent)
        $safeSize = [int]($Width * 0.72)
        $offsetX = [int](($Width - $safeSize) / 2)
        $offsetY = [int](($Height - $safeSize) / 2)
        $g.DrawImage($Image, $offsetX, $offsetY, $safeSize, $safeSize)
    } else {
        # Square with background
        $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 22, 40))
        $g.DrawImage($Image, 0, 0, $Width, $Height)
    }

    $g.Dispose()

    # Save as PNG
    $destBmp.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
    Write-Output "Saved: $DestinationPath ($Width x $Height)"
}

# --- 1. WEB / PWA / DESKTOP ASSETS ---
$webTargets = @(
    @{ Size = 192; Path = "assets\icons\icon-192.png" },
    @{ Size = 512; Path = "assets\icons\icon-512.png" },
    @{ Size = 180; Path = "assets\icons\apple-touch-icon.png" },
    @{ Size = 64;  Path = "assets\icons\favicon-64.png" },
    @{ Size = 32;  Path = "assets\icons\favicon-32.png" },
    @{ Size = 192; Path = "web\assets\icons\icon-192.png" },
    @{ Size = 512; Path = "web\assets\icons\icon-512.png" },
    @{ Size = 180; Path = "web\assets\icons\apple-touch-icon.png" },
    @{ Size = 64;  Path = "web\assets\icons\favicon-64.png" },
    @{ Size = 32;  Path = "web\assets\icons\favicon-32.png" }
)

foreach ($t in $webTargets) {
    $fullPath = Join-Path "e:\Google-AntiGravity-Projects\Apps-Web-Applications" $t.Path
    Save-ResizedImage -Image $srcImage -Width $t.Size -Height $t.Size -DestinationPath $fullPath
}

# Copy favicon-32.png as favicon.png and favicon.ico in root and web
$ico32 = Join-Path "e:\Google-AntiGravity-Projects\Apps-Web-Applications" "assets\icons\favicon-32.png"
$favRoot = Join-Path "e:\Google-AntiGravity-Projects\Apps-Web-Applications" "favicon.png"
$favWeb = Join-Path "e:\Google-AntiGravity-Projects\Apps-Web-Applications" "web\favicon.png"
Copy-Item $ico32 $favRoot -Force
Copy-Item $ico32 $favWeb -Force
Copy-Item $ico32 (Join-Path "e:\Google-AntiGravity-Projects\Apps-Web-Applications" "favicon.ico") -Force
Copy-Item $ico32 (Join-Path "e:\Google-AntiGravity-Projects\Apps-Web-Applications" "web\favicon.ico") -Force

# --- 2. ANDROID MIPMAPS ---
$androidMipmaps = @(
    @{ Density = "mipmap-mdpi";    Size = 48 },
    @{ Density = "mipmap-hdpi";    Size = 72 },
    @{ Density = "mipmap-xhdpi";   Size = 96 },
    @{ Density = "mipmap-xxhdpi";  Size = 144 },
    @{ Density = "mipmap-xxxhdpi"; Size = 192 }
)

$androidResDir = "e:\Google-AntiGravity-Projects\Apps-Web-Applications\android\app\src\main\res"

foreach ($m in $androidMipmaps) {
    # Square launcher
    $sqPath = Join-Path $androidResDir "$($m.Density)\ic_launcher.png"
    Save-ResizedImage -Image $srcImage -Width $m.Size -Height $m.Size -DestinationPath $sqPath -Round $false

    # Round launcher
    $rdPath = Join-Path $androidResDir "$($m.Density)\ic_launcher_round.png"
    Save-ResizedImage -Image $srcImage -Width $m.Size -Height $m.Size -DestinationPath $rdPath -Round $true
}

# --- 3. ANDROID ADAPTIVE FOREGROUND ---
# Canvas is 108dp x 108dp (mdpi=108, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432)
$adaptiveTargets = @(
    @{ Density = "drawable-mdpi";    Size = 108 },
    @{ Density = "drawable-hdpi";    Size = 162 },
    @{ Density = "drawable-xhdpi";   Size = 216 },
    @{ Density = "drawable-xxhdpi";  Size = 324 },
    @{ Density = "drawable-xxxhdpi"; Size = 432 },
    @{ Density = "drawable";         Size = 432 }
)

foreach ($a in $adaptiveTargets) {
    $fgPath = Join-Path $androidResDir "$($a.Density)\ic_launcher_foreground.png"
    Save-ResizedImage -Image $srcImage -Width $a.Size -Height $a.Size -DestinationPath $fgPath -AdaptiveForeground $true
}

$srcImage.Dispose()
Write-Output "✅ All icons generated successfully!"
