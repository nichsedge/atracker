#!/usr/bin/env pwsh
# Windows equivalent of deploy-rs-dashboard.sh:
# builds dashboard-v2 + atracker-rs, stops the running instance, and relaunches it
# via the autostart VBS so the new config (e.g. DB path) is picked up.

$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path "$PSScriptRoot\..").Path
$FrontendDir = Join-Path $RootDir "dashboards\dashboard-v2"
$RustDir = Join-Path $RootDir "atracker-rs"
$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$VbsPath = Join-Path $StartupFolder "start-atracker.vbs"

# Pick a JS builder
$JsBuilder = if (Get-Command bun -ErrorAction SilentlyContinue) { "bun" }
             elseif (Get-Command npm -ErrorAction SilentlyContinue) { "npm" }
             else { throw "Neither bun nor npm is installed." }

Write-Host "[1/5] Building dashboard-v2 ($JsBuilder)..." -ForegroundColor Cyan
Set-Location $FrontendDir
if ($JsBuilder -eq "bun") {
    bun install
    bun run build
} else {
    npm install
    npm run build
}

Write-Host "[2/5] Stopping running atracker-rs (so cargo can replace the .exe)..." -ForegroundColor Cyan
$running = Get-Process -Name "atracker-rs" -ErrorAction SilentlyContinue
if ($running) {
    $running | ForEach-Object {
        Write-Host "  Stopping PID $($_.Id)" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force
    }
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "  (no running instance)" -ForegroundColor Gray
}

Write-Host "[3/5] Building atracker-rs release..." -ForegroundColor Cyan
Set-Location $RustDir
cargo build --release

Write-Host "[4/5] Launching atracker-rs..." -ForegroundColor Cyan
if (-not (Test-Path $VbsPath)) {
    throw "Autostart VBS not found at $VbsPath. Run install.ps1 first."
}
Start-Process "wscript.exe" -ArgumentList "`"$VbsPath`""
Start-Sleep -Seconds 1

Write-Host "[5/5] Status:" -ForegroundColor Cyan
$proc = Get-Process -Name "atracker-rs" -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host ("  Running (PID {0})" -f $proc.Id) -ForegroundColor Green
    Write-Host "  Dashboard: http://localhost:8933" -ForegroundColor Green
} else {
    Write-Host "  atracker-rs is NOT running" -ForegroundColor Red
    exit 1
}
