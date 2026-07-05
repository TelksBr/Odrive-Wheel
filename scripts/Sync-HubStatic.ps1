# Sync overlay-lan into Go hub embed tree (no Node required).
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repoRoot 'tools\overlay-lan'
$dest = Join-Path $repoRoot 'tools\wheelforge-hub\internal\server\public\overlay'

if (-not (Test-Path $src)) {
  Write-Error "overlay-lan source missing: $src"
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($file in @('index.html', 'overlay.css', 'overlay.js')) {
  Copy-Item -Path (Join-Path $src $file) -Destination (Join-Path $dest $file) -Force
}

Write-Host 'Copied overlay-lan -> wheelforge-hub/internal/server/public/overlay'
Write-Host 'Hub static assets synced for Go embed.'
