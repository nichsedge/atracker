#!/bin/bash
# Install and enable the atracker GNOME Shell Extension
set -e

EXT_DIR="$HOME/.local/share/gnome-shell/extensions/atracker@local"

echo "🔗 Symlinking extension to GNOME Shell extensions directory..."
mkdir -p "$(dirname "$EXT_DIR")"
ln -sf "$(dirname "$(realpath "$0")")/atracker@local" "$EXT_DIR"

echo "✅ Extension installed at $EXT_DIR"
echo ""
echo "⚠️  On Wayland, you need to log out and back in for GNOME Shell to detect new extensions."
echo "   After re-logging, run:"
echo "     gnome-extensions enable atracker@local"
echo ""
echo "   Or you can enable it immediately via:"
echo "     gnome-extensions install --force $EXT_DIR && gnome-extensions enable atracker@local"
echo ""
echo "   To verify it's working:"
echo "     gdbus call --session --dest org.atracker.WindowTracker --object-path /org/atracker/WindowTracker --method org.atracker.WindowTracker.GetActiveWindow"
