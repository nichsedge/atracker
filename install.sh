#!/usr/bin/env bash
set -euo pipefail

# Get absolute path of repository
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "🚀 Installing atracker on Linux..."
echo "Repository directory: $REPO_DIR"
echo ""

# 1. Check prerequisites
echo "📋 Checking prerequisites..."
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust (cargo) is not installed. Please install Rust from https://rustup.rs/ first."
    exit 1
fi

# Check for node/npm/bun to build the dashboard
JS_BUILDER=""
if command -v bun &> /dev/null; then
    JS_BUILDER="bun"
elif command -v npm &> /dev/null; then
    JS_BUILDER="npm"
else
    echo "⚠️ Warning: Neither 'bun' nor 'npm' was found. Dashboard assets cannot be built."
    echo "Please install Node.js/NPM or Bun first."
    exit 1
fi
echo "Using JS builder: $JS_BUILDER"
echo ""

# 2. Build React Dashboard
echo "📦 Building dashboard..."
cd "$REPO_DIR/dashboards/dashboard-v2"
if [ "$JS_BUILDER" = "bun" ]; then
    bun install
    bun run build
else
    npm install
    npm run build
fi
echo ""

# 3. Build Rust Backend
echo "🦀 Building Rust backend in release mode..."
cd "$REPO_DIR/atracker-rs"
cargo build --release
echo ""

# 4. Install & Template Systemd Service
echo "⚙️ Configuring systemd user service..."
SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

# Dynamically resolve variables
USER_ID="$(id -u)"
EXEC_PATH="$REPO_DIR/atracker-rs/target/release/atracker-rs"
WORKING_DIR="$REPO_DIR/atracker-rs"
DIST_PATH="$REPO_DIR/dashboards/dashboard-v2/dist"

# Generate templated systemd service
cat <<EOF > "$SERVICE_DIR/atracker-rs.service"
[Unit]
Description=Activity Tracker Daemon (Rust)
After=graphical-session.target

[Service]
Type=simple
ExecStart=$EXEC_PATH
WorkingDirectory=$WORKING_DIR
Restart=on-failure
RestartSec=5
Environment=DISPLAY=:0
Environment=DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$USER_ID/bus
Environment=ATRACKER_DASHBOARD_DIST=$DIST_PATH

[Install]
WantedBy=default.target
EOF

# Reload and restart systemd service
echo "🔄 Starting & enabling atracker-rs service..."
systemctl --user daemon-reload
systemctl --user enable --now atracker-rs
echo ""

echo "🎉 Installation completed successfully!"
echo "Visit http://localhost:8933 to view your dashboard."
echo ""
systemctl --user status atracker-rs --no-pager
