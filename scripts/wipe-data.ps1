#!/usr/bin/env pwsh
# Delete the atracker-rs database (and WAL/SHM sidecars). Leaves config alone.
# Intended for troubleshooting / fresh-start scenarios.
#
# Usage:
#   .\scripts\wipe-data.ps1                       # uses default DB path
#   .\scripts\wipe-data.ps1 -Yes                  # skip confirmation prompt
#   .\scripts\wipe-data.ps1 -DbPath C:\custom.db  # custom DB path

[CmdletBinding()]
param(
    [string]$DbPath = (Join-Path $env:USERPROFILE ".local\share\atracker-rs\atracker-rs.db"),
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DbPath)) {
    Write-Host "DB not found at $DbPath -- nothing to wipe."
    Write-Host "(If your config points elsewhere, pass -DbPath C:\path\to\atracker-rs.db.)"
    exit 0
}

$targets = @(
    $DbPath,
    "$DbPath-wal",
    "$DbPath-shm"
) | Where-Object { Test-Path $_ }

Write-Host "About to delete:" -ForegroundColor Yellow
foreach ($f in $targets) {
    $size = (Get-Item $f).Length
    Write-Host ("  {0}  ({1} bytes)" -f $f, $size)
}
Write-Host ""

if (-not $Yes) {
    $ans = Read-Host "Continue? [y/N]"
    if ($ans -notin @("y","Y","yes","YES")) {
        Write-Host "Aborted." -ForegroundColor Red
        exit 1
    }
}

# Warn (but don't block) if the daemon is running.
$running = Get-Process -Name "atracker-rs" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "⚠️  atracker-rs is currently running. Consider stopping it first:" -ForegroundColor Yellow
    Write-Host "    .\scripts\uninstall.ps1"
    Write-Host ""
}

foreach ($f in $targets) {
    Remove-Item -Force $f
    Write-Host "  removed $f" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Wipe complete. A fresh DB will be created on next daemon start." -ForegroundColor Green
