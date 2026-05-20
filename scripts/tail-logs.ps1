#!/usr/bin/env pwsh
# Follow the atracker-rs log on Windows.
#
# Note: install.ps1 currently launches atracker-rs.exe via a hidden VBS that
# discards stdout/stderr. There is no log file by default. To capture logs:
#   1. Edit start-atracker.vbs in $env:APPDATA\...\Startup to run via:
#        cmd /c "<exe-path>" >> "%USERPROFILE%\atracker-rs.log" 2>&1
#   2. Restart with .\scripts\deploy-rs-dashboard.ps1
#
# This script just tails the log if it exists.

$ErrorActionPreference = "Stop"

$LogPath = Join-Path $env:USERPROFILE "atracker-rs.log"

if (-not (Test-Path $LogPath)) {
    Write-Host "No log file at $LogPath." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "By default the Windows install runs atracker-rs.exe via a hidden VBS"
    Write-Host "launcher that discards stdout. To enable logging, edit"
    Write-Host "  $env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\start-atracker.vbs"
    Write-Host "to invoke the exe via:"
    Write-Host "  cmd /c `"<exe-path>`" >> `"$LogPath`" 2>&1"
    Write-Host "then re-run .\scripts\deploy-rs-dashboard.ps1"
    exit 1
}

Write-Host "📜 Following $LogPath (Ctrl-C to stop)..." -ForegroundColor Cyan
Get-Content -Path $LogPath -Wait -Tail 50
