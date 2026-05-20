#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/dashboards/dashboard-v2"
RUST_DIR="$ROOT_DIR/atracker-rs"

OS_NAME="$(uname -s)"
case "$OS_NAME" in
    Linux)  TARGET_OS="linux" ;;
    Darwin) TARGET_OS="macos" ;;
    *)
        echo "Unsupported OS: $OS_NAME. Use deploy-rs-dashboard.ps1 on Windows."
        exit 1
        ;;
esac

printf "[1/4] Building dashboard-v2...\n"
cd "$FRONTEND_DIR"
bun install
bun run build

printf "[2/4] Building atracker-rs release...\n"
cd "$RUST_DIR"
cargo build --release

if [ "$TARGET_OS" = "linux" ]; then
    printf "[3/4] Reloading user systemd units...\n"
    systemctl --user daemon-reload

    printf "[4/4] Restarting atracker-rs service...\n"
    systemctl --user restart atracker-rs

    printf "Done. Service status:\n"
    systemctl --user --no-pager --full status atracker-rs
else
    # macOS: prefer the installed LaunchAgent; fall back to a direct relaunch
    # for the development case where install.sh hasn't been run yet.
    PLIST_LABEL="com.atracker.atracker-rs"
    PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
    UID_NUM="$(id -u)"
    AGENT_TARGET="gui/${UID_NUM}/${PLIST_LABEL}"

    if [ -f "$PLIST_PATH" ] && launchctl print "$AGENT_TARGET" &> /dev/null; then
        printf "[3/4] Restarting LaunchAgent (%s)...\n" "$PLIST_LABEL"
        # kickstart -k = stop the job if running, then start it. Picks up the
        # freshly-built binary because the plist points at the release path.
        launchctl kickstart -k "$AGENT_TARGET"

        printf "[4/4] Status:\n"
        # `launchctl list <label>` prints pid + last exit code without needing root.
        launchctl list "$PLIST_LABEL" || true
        printf "  Dashboard: http://localhost:8933\n"
        printf "  Logs: ~/Library/Logs/atracker-rs.log\n"
    else
        printf "[3/4] No LaunchAgent loaded — killing any running atracker-rs...\n"
        # -x = exact match on process name; ignore "no process" exit code.
        pkill -x atracker-rs 2>/dev/null || true
        sleep 1

        printf "[4/4] Launching atracker-rs in the background...\n"
        EXEC_PATH="$RUST_DIR/target/release/atracker-rs"
        DIST_PATH="$ROOT_DIR/dashboards/dashboard-v2/dist"
        LOG_DIR="$HOME/Library/Logs"
        mkdir -p "$LOG_DIR"

        # nohup + disown so the daemon survives this shell exiting.
        ATRACKER_DASHBOARD_DIST="$DIST_PATH" \
            nohup "$EXEC_PATH" \
            >> "$LOG_DIR/atracker-rs.log" 2>&1 &
        disown

        sleep 1
        if pgrep -x atracker-rs > /dev/null; then
            printf "  Running (PID %s)\n" "$(pgrep -x atracker-rs)"
            printf "  Dashboard: http://localhost:8933\n"
            printf "  Logs: %s/atracker-rs.log\n" "$LOG_DIR"
            printf "  (Tip: run ./install.sh once to set up a LaunchAgent so it restarts on login.)\n"
        else
            printf "  atracker-rs failed to start. Check %s/atracker-rs.log\n" "$LOG_DIR" >&2
            exit 1
        fi
    fi
fi
