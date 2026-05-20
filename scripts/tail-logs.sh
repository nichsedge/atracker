#!/usr/bin/env bash
set -euo pipefail

# Follow the atracker-rs log on Linux or macOS.

OS_NAME="$(uname -s)"
case "$OS_NAME" in
    Linux)  TARGET_OS="linux" ;;
    Darwin) TARGET_OS="macos" ;;
    *)
        echo "Unsupported OS: $OS_NAME. On Windows, run scripts/tail-logs.ps1."
        exit 1
        ;;
esac

if [ "$TARGET_OS" = "linux" ]; then
    echo "📜 Following journalctl --user -fu atracker-rs (Ctrl-C to stop)..."
    exec journalctl --user -fu atracker-rs
else
    LOG_PATH="$HOME/Library/Logs/atracker-rs.log"
    if [ ! -f "$LOG_PATH" ]; then
        echo "Log file not found at $LOG_PATH."
        echo "If the daemon has never run under launchd, start it with:"
        echo "    ./install.sh           # to register the LaunchAgent"
        echo "    ./scripts/deploy-rs-dashboard.sh   # to rebuild + (re)launch"
        exit 1
    fi
    echo "📜 tail -f $LOG_PATH (Ctrl-C to stop)..."
    exec tail -f "$LOG_PATH"
fi
