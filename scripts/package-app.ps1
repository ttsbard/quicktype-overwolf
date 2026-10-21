# Packages QuickType into an unpacked distribution ZIP archive.
# Users extract this ZIP and load the resulting folder in Overwolf
# via "Load unpacked extension".
$ErrorActionPreference = 'Stop'

$rootDir = Split-Path $PSScriptRoot -Parent
$src = Join-Path $rootDir 'quicktype-overlay'
$dist = Join-Path $rootDir 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$manifest = Get-Content -Raw (Join-Path $src 'manifest.json') | ConvertFrom-Json
$appId = ($manifest.meta.name -replace '[^A-Za-z0-9]+', '-')
$zipName = '{0}-{1}.zip' -f $appId, $manifest.meta.version

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

$stage = Join-Path $dist 'stage'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
$stageApp = Join-Path $stage 'quicktype-overlay'
New-Item -ItemType Directory -Force -Path $stageApp | Out-Null

foreach ($f in $files) {
    Copy-Item (Join-Path $src $f) (Join-Path $stageApp $f)
}

$zip = Join-Path $dist $zipName
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $stageApp -DestinationPath $zip
Remove-Item -Recurse -Force $stage

'{0} bytes -> {1}' -f (Get-Item $zip).Length, $zip
