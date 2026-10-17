# Generates the app icon (256x256 PNG, must stay under 30KB).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$rootDir = Split-Path $PSScriptRoot -Parent
$out = Join-Path $rootDir 'quicktype-overlay\icon.png'

$bmp = New-Object System.Drawing.Bitmap (256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Blue speech bubble with an input caret, matching the desktop titlebar.
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 40, 91, 193))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$shape = New-Object System.Drawing.Drawing2D.GraphicsPath
$shape.AddArc(20, 20, 40, 40, 180, 90)
$shape.AddArc(196, 20, 40, 40, 270, 90)
$shape.AddArc(196, 156, 40, 40, 0, 90)
$shape.AddLine(216, 196, 122, 196)
$shape.AddLine(122, 196, 68, 238)
$shape.AddLine(68, 238, 68, 196)
$shape.AddArc(20, 156, 40, 40, 90, 90)
$shape.CloseFigure()
$g.FillPath($blue, $shape)
$g.FillRectangle($white, 118, 67, 20, 82)
$shape.Dispose()
$blue.Dispose()
$white.Dispose()

$g.Dispose()
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

'{0} bytes -> {1}' -f (Get-Item $out).Length, $out
