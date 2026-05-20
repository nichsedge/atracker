#!/usr/bin/env pwsh
# Stop and remove the Windows atracker-rs autostart for the current user.
# Leaves the database and config in place; use scripts/wipe-data.ps1 to nuke those.

$ErrorActionPreference = "Stop"

Write-Host "🧹 Uninstalling atracker-rs on Windows..." -ForegroundColor Cyan

# 1. Kill any running instance so we can remove the VBS cleanly.
$running = Get-Process -Name "atracker-rs" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "  Stopping running atracker-rs (PID $($running.Id -join ', '))..." -ForegroundColor Gray
    $running | Stop-Process -Force
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "  (no running atracker-rs process)" -ForegroundColor Gray
}

# 2. Remove the autostart VBS.
$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$VbsPath = Join-Path $StartupFolder "start-atracker.vbs"

if (Test-Path $VbsPath) {
    Write-Host "  Removing $VbsPath" -ForegroundColor Gray
    Remove-Item -Force $VbsPath
} else {
    Write-Host "  (no autostart VBS installed)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Uninstall complete." -ForegroundColor Green
Write-Host ""
Write-Host "Local data left in place:" -ForegroundColor Gray
Write-Host "  DB:     $env:USERPROFILE\.local\share\atracker-rs\atracker-rs.db"
Write-Host "  Config: $env:USERPROFILE\.config\atracker-rs\config-rs.yaml"
Write-Host ""
Write-Host "To wipe local data too, run: .\scripts\wipe-data.ps1" -ForegroundColor Gray
