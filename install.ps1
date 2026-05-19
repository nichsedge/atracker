# Windows Installation Script for atracker
$RepoDir = Get-Location
Write-Host "🚀 Installing atracker on Windows..." -ForegroundColor Cyan
Write-Host "Repository directory: $RepoDir" -ForegroundColor Gray
Write-Host ""

# 1. Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Gray
if ((Get-Command "cargo" -ErrorAction SilentlyContinue) -eq $null) {
    Write-Host "❌ Error: Rust (cargo) is not installed. Please install Rust from https://rustup.rs/ first." -ForegroundColor Red
    Exit
}

# Check for node/npm/bun to build the dashboard
$JsBuilder = ""
if ((Get-Command "bun" -ErrorAction SilentlyContinue) -ne $null) {
    $JsBuilder = "bun"
} elseif ((Get-Command "npm" -ErrorAction SilentlyContinue) -ne $null) {
    $JsBuilder = "npm"
} else {
    Write-Host "⚠️ Warning: Neither 'bun' nor 'npm' was found. Dashboard assets cannot be built." -ForegroundColor Yellow
    Write-Host "Please install Node.js/NPM or Bun first." -ForegroundColor Yellow
    Exit
}
Write-Host "Using JS builder: $JsBuilder" -ForegroundColor Gray
Write-Host ""

# 2. Build React Dashboard
Write-Host "📦 Building dashboard..." -ForegroundColor Gray
Set-Location "$RepoDir\dashboards\dashboard-v2"
if ($JsBuilder -eq "bun") {
    bun install
    bun run build
} else {
    npm install
    npm run build
}
Write-Host ""

# 3. Build Rust Backend
Write-Host "🦀 Building Rust backend in release mode..." -ForegroundColor Gray
Set-Location "$RepoDir\atracker-rs"
cargo build --release
Write-Host ""

# 4. Setup Silent Autostart on Windows
Write-Host "⚙️ Configuring Windows Startup..." -ForegroundColor Gray
$TargetExe = "$RepoDir\atracker-rs\target\release\atracker-rs.exe"
$StartupFolder = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$VbsPath = Join-Path $StartupFolder "start-atracker.vbs"

# Create config folder and copy default if needed
$ConfigDir = [System.IO.Path]::Combine($env:USERPROFILE, ".config\atracker-rs")
if (!(Test-Path $ConfigDir)) {
    New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
}

$ConfigFile = Join-Path $ConfigDir "config-rs.yaml"
if (!(Test-Path $ConfigFile)) {
    # Generate default config with resolved dashboard paths
    $DistPath = "$RepoDir\dashboards\dashboard-v2\dist"
    # Create default config content
    $DefaultConfig = @"
dashboard:
  port: 8933
  host: 0.0.0.0
database:
  path: "~/.local/share/atracker-rs/atracker-rs.db"
  retention_days: 90
tracking:
  poll_interval: 5
  idle_threshold: 120
"@
    Set-Content -Path $ConfigFile -Value $DefaultConfig
}

# Write VBS script for background launch without flashing command window
$VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
' Set environment variable for static assets
WshShell.Environment("PROCESS")("ATRACKER_DASHBOARD_DIST") = "$RepoDir\dashboards\dashboard-v2\dist"
' Run silently in background (0 = hide window, false = run asynchronously)
WshShell.Run """$TargetExe""", 0, false
"@
Set-Content -Path $VbsPath -Value $VbsContent -Encoding UTF8

# Start the service right away
Write-Host "🔄 Starting atracker-rs silently in the background..." -ForegroundColor Gray
Start-Process "wscript.exe" -ArgumentList """$VbsPath"""
Write-Host ""

Write-Host "🎉 Installation completed successfully!" -ForegroundColor Green
Write-Host "Visit http://localhost:8933 to view your dashboard." -ForegroundColor Green
