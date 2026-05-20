#!/usr/bin/env bash
set -euo pipefail

# Stop and remove the atracker-rs background service for the current user.
# Leaves the database and config in place so reinstalling preserves history.
# To wipe local data too, run scripts/wipe-data.sh after this.

OS_NAME="$(uname -s)"
case "$OS_NAME" in
    Linux)  TARGET_OS="linux" ;;
    Darwin) TARGET_OS="macos" ;;
    *)
        echo "Unsupported OS: $OS_NAME. On Windows, run scripts/uninstall.ps1."
        exit 1
        ;;
esac

echo "🧹 Uninstalling atracker-rs on ${TARGET_OS}..."

if [ "$TARGET_OS" = "linux" ]; then
    SERVICE="atracker-rs.service"
    UNIT_PATH="$HOME/.config/systemd/user/${SERVICE}"

    if systemctl --user list-unit-files "$SERVICE" &> /dev/null; then
        echo "  Stopping & disabling ${SERVICE}..."
        systemctl --user disable --now "$SERVICE" 2>/dev/null || true
    else
        echo "  (no systemd unit installed)"
    fi

    if [ -f "$UNIT_PATH" ]; then
        echo "  Removing ${UNIT_PATH}"
        rm -f "$UNIT_PATH"
        systemctl --user daemon-reload
    fi
else
    PLIST_LABEL="com.atracker.atracker-rs"
    PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

    if [ -f "$PLIST_PATH" ]; then
        echo "  Unloading ${PLIST_LABEL}..."
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
        echo "  Removing ${PLIST_PATH}"
        rm -f "$PLIST_PATH"
    else
        echo "  (no LaunchAgent installed)"
    fi

    # Belt-and-braces: kill any directly-launched dev instance too.
    if pgrep -x atracker-rs > /dev/null; then
        echo "  Killing running atracker-rs process(es)..."
        pkill -x atracker-rs 2>/dev/null || true
    fi
fi

echo ""
echo "✅ Uninstall complete."
echo ""
echo "Local data left in place:"
echo "  DB:     ~/.local/share/atracker-rs/atracker-rs.db"
echo "  Config: ~/.config/atracker-rs/config-rs.yaml"
echo ""
echo "To wipe local data too, run: ./scripts/wipe-data.sh"
