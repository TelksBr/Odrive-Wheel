#Requires -Version 5.1
param(
  [string]$OutDir = 'dist'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

& (Join-Path $PSScriptRoot 'Sync-HubStatic.ps1')

$hubDir = Join-Path $repoRoot 'tools\wheelforge-hub'
$outPath = Join-Path $repoRoot $OutDir
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

Push-Location $hubDir
try {
  go mod tidy
  go build -ldflags="-s -w" -o (Join-Path $outPath 'wheelforge-hub.exe') .
  Write-Host "Built $(Join-Path $outPath 'wheelforge-hub.exe')" -ForegroundColor Green
} finally {
  Pop-Location
}
