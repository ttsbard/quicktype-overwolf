# Checks both package layouts and compares every packaged file with its source.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$rootDir = Split-Path $PSScriptRoot -Parent
$src = Join-Path $rootDir 'quicktype-overlay'
$manifest = Get-Content -Raw (Join-Path $src 'manifest.json') | ConvertFrom-Json
$appId = $manifest.meta.name -replace '[^A-Za-z0-9]+', '-'
$packageName = '{0}-{1}' -f $appId, $manifest.meta.version
$required = @('manifest.json', $manifest.meta.icon, $manifest.meta.launcher_icon, $manifest.meta.window_icon)
$required += @($manifest.data.windows.PSObject.Properties | ForEach-Object { $_.Value.file })
$zipFiles = $null

foreach ($extension in @('zip', 'opk')) {
    $package = Join-Path $rootDir "dist/$packageName.$extension"
    $prefix = if ($extension -eq 'zip') { 'quicktype-overlay/' } else { '' }
    $archive = [System.IO.Compression.ZipFile]::OpenRead($package)
    try {
        foreach ($file in $required) {
            if (-not $archive.GetEntry("$prefix$file")) {
                throw "Missing required entry in ${package}: $prefix$file"
            }
        }
        $names = @()
        foreach ($entry in $archive.Entries) {
            if (-not $entry.FullName.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
                throw "Unexpected package entry: $($entry.FullName)"
            }
            $name = $entry.FullName.Substring($prefix.Length)
            $sourceHash = (Get-FileHash -LiteralPath (Join-Path $src $name) -Algorithm SHA256).Hash
            $stream = $entry.Open()
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try {
                $entryHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
            } finally {
                $sha.Dispose()
                $stream.Dispose()
            }
            if ($entryHash -ne $sourceHash) { throw "Package content differs from source: $name" }
            $names += $name
        }
        if ($extension -eq 'zip') {
            $zipFiles = $names
        } elseif (Compare-Object $zipFiles $names) {
            throw 'ZIP and OPK contain different files'
        }
    } finally {
        $archive.Dispose()
    }
    Write-Host "Verified $package ($($names.Count) files)."
}
