# Generates the app icon (256x256 PNG, must stay under 30KB).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$out = Join-Path $rootDir 'quicktype-overlay\icon.png'

$bmp = New-Object System.Drawing.Bitmap (256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

function Add-RoundedRect($path, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
}

# 1. Синий сквиркл с градиентом
$c1 = [System.Drawing.Color]::FromArgb(255, 59, 130, 246) # #3b82f6
$c2 = [System.Drawing.Color]::FromArgb(255, 29, 78, 216)  # #1d4ed8
$p1 = New-Object System.Drawing.PointF (0, 0)
$p2 = New-Object System.Drawing.PointF (256, 256)
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ($p1, $p2, $c1, $c2)

$squircle = New-Object System.Drawing.Drawing2D.GraphicsPath
Add-RoundedRect $squircle 10 10 236 236 60
$g.FillPath($gradBrush, $squircle)

# Тонкая внутренняя полупрозрачная обводка сквиркла для контраста
$borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 255, 255, 255), 2)
$g.DrawPath($borderPen, $squircle)

# 2. Белое поле ввода (Размер M: w=172, h=110, r=26)
$boxPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, 16)
$boxPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$boxPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$boxPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

$boxPath = New-Object System.Drawing.Drawing2D.GraphicsPath
Add-RoundedRect $boxPath 42 73 172 110 26
$g.DrawPath($boxPen, $boxPath)

# 3. Прямой I-beam курсор
$barPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, 15)
$barPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$barPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$stemPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White, 15)
$stemPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Flat
$stemPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Flat

# Вертикальный ствол (плоские концы стыкуются ровно с планками)
$g.DrawLine($stemPen, 80, 96, 80, 160)
# Верхняя горизонтальная планка
$g.DrawLine($barPen, 64, 96, 96, 96)
# Нижняя горизонтальная планка
$g.DrawLine($barPen, 64, 160, 96, 160)

# 4. Полупрозрачная черта текста
$textPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(195, 255, 255, 255), 15)
$textPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$textPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($textPen, 120, 128, 180, 128)

# Освобождение ресурсов
$squircle.Dispose()
$boxPath.Dispose()
$gradBrush.Dispose()
$borderPen.Dispose()
$boxPen.Dispose()
$barPen.Dispose()
$stemPen.Dispose()
$textPen.Dispose()
$g.Dispose()

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# 5. Сохранение Windows icon.ico с 4 разрешениями (16, 32, 48, 256) как у официальных приложений Overwolf
$outIco = Join-Path $rootDir 'quicktype-overlay\icon.ico'
$sizes = @(16, 32, 48, 256)
$src = [System.Drawing.Bitmap]::FromFile($out)

$pngStreams = @()
foreach ($sz in $sizes) {
    $subBmp = New-Object System.Drawing.Bitmap ($sz, $sz)
    $subG = [System.Drawing.Graphics]::FromImage($subBmp)
    $subG.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $subG.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $subG.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $subG.DrawImage($src, 0, 0, $sz, $sz)
    $subG.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $subBmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $subBmp.Dispose()
    $pngStreams += ,@($sz, $ms.ToArray())
    $ms.Dispose()
}
$src.Dispose()

$fs = [System.IO.File]::Create($outIco)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)          # Reserved
$bw.Write([uint16]1)          # Type: 1 = Icon
$bw.Write([uint16]$sizes.Count) # Count: 4 images

$offset = 6 + (16 * $sizes.Count)
foreach ($item in $pngStreams) {
    $sz = $item[0]
    $bytes = $item[1]
    $wByte = if ($sz -ge 256) { 0 } else { [byte]$sz }
    $hByte = if ($sz -ge 256) { 0 } else { [byte]$sz }
    $bw.Write([byte]$wByte)
    $bw.Write([byte]$hByte)
    $bw.Write([byte]0)        # Colors
    $bw.Write([byte]0)        # Reserved
    $bw.Write([uint16]1)      # Planes
    $bw.Write([uint16]32)     # BitCount
    $bw.Write([uint32]$bytes.Length) # ImageSize
    $bw.Write([uint32]$offset)       # Offset
    $offset += $bytes.Length
}

foreach ($item in $pngStreams) {
    $bw.Write($item[1])
}
$bw.Flush()
$fs.Close()

'{0} bytes -> {1}' -f (Get-Item $out).Length, $out
'{0} bytes (4 sizes: 16,32,48,256) -> {1}' -f (Get-Item $outIco).Length, $outIco
