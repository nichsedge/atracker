#!/usr/bin/env bash
set -euo pipefail

# Get absolute path of repository
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Detect OS so we can install the right login-time service.
OS_NAME="$(uname -s)"
case "$OS_NAME" in
    Linux)  TARGET_OS="linux" ;;
    Darwin) TARGET_OS="macos" ;;
    *)
        echo "❌ Unsupported OS: $OS_NAME"
        echo "   This installer supports Linux (systemd) and macOS (launchd)."
        echo "   On Windows, run ./install.ps1 instead."
        exit 1
        ;;
esac

echo "🚀 Installing atracker on ${TARGET_OS}..."
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

# Shared paths used by the service setup below
EXEC_PATH="$REPO_DIR/atracker-rs/target/release/atracker-rs"
WORKING_DIR="$REPO_DIR/atracker-rs"
DIST_PATH="$REPO_DIR/dashboards/dashboard-v2/dist"

if [ "$TARGET_OS" = "linux" ]; then
    # 4a. Install & Template Systemd Service (Linux)
    echo "⚙️ Configuring systemd user service..."
    SERVICE_DIR="$HOME/.config/systemd/user"
    mkdir -p "$SERVICE_DIR"

    USER_ID="$(id -u)"

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

    echo "🔄 Starting & enabling atracker-rs service..."
    systemctl --user daemon-reload
    systemctl --user enable --now atracker-rs
    echo ""

    echo "🎉 Installation completed successfully!"
    echo "Visit http://localhost:8933 to view your dashboard."
    echo ""
    systemctl --user status atracker-rs --no-pager
else
    # 4b. Install & Template launchd Agent (macOS)
    echo "⚙️ Configuring launchd LaunchAgent..."
    LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
    LOG_DIR="$HOME/Library/Logs"
    PLIST_LABEL="com.atracker.atracker-rs"
    PLIST_PATH="$LAUNCH_AGENT_DIR/${PLIST_LABEL}.plist"
    mkdir -p "$LAUNCH_AGENT_DIR" "$LOG_DIR"

    cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${EXEC_PATH}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${WORKING_DIR}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>ATRACKER_DASHBOARD_DIST</key>
        <string>${DIST_PATH}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/atracker-rs.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/atracker-rs.log</string>
</dict>
</plist>
EOF

    echo "🔄 (Re)loading LaunchAgent..."
    # Make the load idempotent: unload first if it was previously loaded.
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    launchctl load -w "$PLIST_PATH"
    echo ""

    echo "🎉 Installation completed successfully!"
    echo "Visit http://localhost:8933 to view your dashboard."
    echo ""
    echo "Service status:"
    launchctl list | grep "${PLIST_LABEL}" || echo "  (not yet listed — give it a moment)"
    echo ""
    echo "Logs: ${LOG_DIR}/atracker-rs.log"
    echo ""
    echo "ℹ️  For per-window titles (not just app names), grant Screen Recording"
    echo "    permission to your terminal / the atracker-rs binary under"
    echo "    System Settings → Privacy & Security → Screen Recording, then run:"
    echo "        launchctl kickstart -k gui/\$(id -u)/${PLIST_LABEL}"
fi
