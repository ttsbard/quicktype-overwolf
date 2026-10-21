# Packages QuickType as an unpacked distribution ZIP and an unsigned OPK.
# ZIP contains quicktype-overlay/; OPK contains the app files at its root.
$ErrorActionPreference = 'Stop'

$rootDir = Split-Path $PSScriptRoot -Parent
$src = Join-Path $rootDir 'quicktype-overlay'
$dist = Join-Path $rootDir 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$manifest = Get-Content -Raw (Join-Path $src 'manifest.json') | ConvertFrom-Json
$appId = ($manifest.meta.name -replace '[^A-Za-z0-9]+', '-')
$packageName = '{0}-{1}' -f $appId, $manifest.meta.version

$files = @(
    'manifest.json',
    'background.html',
    'config.js',
    'desktop.html',
    'desktop.css',
    'desktop.js',
    'overlay.html',
    'overlay.css',
    'overlay.js',
    'icon.png',
    'icon.ico'
)

foreach ($f in $files) {
    if (-not (Test-Path (Join-Path $src $f))) {
        throw "missing required file: $f"
    }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

foreach ($extension in @('zip', 'opk')) {
    $package = Join-Path $dist "$packageName.$extension"
    if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package -Force }
    $archive = [System.IO.Compression.ZipFile]::Open($package, 'Create')
    try {
        foreach ($f in $files) {
            $entryName = if ($extension -eq 'zip') { "quicktype-overlay/$f" } else { $f }
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, (Join-Path $src $f), $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }
    '{0} bytes -> {1}' -f (Get-Item -LiteralPath $package).Length, $package
}

& (Join-Path $PSScriptRoot 'verify-packages.ps1')
