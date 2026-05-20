#!/usr/bin/env bash
set -euo pipefail

# Delete the atracker-rs database (and WAL/SHM sidecars). Leaves config alone.
# Intended for troubleshooting / fresh-start scenarios.
#
# Usage:
#   ./scripts/wipe-data.sh                  # uses default DB path
#   ./scripts/wipe-data.sh --yes            # skip confirmation prompt
#   ./scripts/wipe-data.sh --db /path/db    # custom DB path
#
# The default path matches install.sh / config-rs.yaml: ~/.local/share/atracker-rs/atracker-rs.db
# Edit your config-rs.yaml if your DB lives elsewhere, or pass --db.

DEFAULT_DB="$HOME/.local/share/atracker-rs/atracker-rs.db"
DB_PATH="$DEFAULT_DB"
ASSUME_YES=0

while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y) ASSUME_YES=1; shift ;;
        --db) DB_PATH="${2:?--db requires a path}"; shift 2 ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

if [ ! -f "$DB_PATH" ]; then
    echo "DB not found at $DB_PATH — nothing to wipe."
    echo "(If your config points elsewhere, pass --db /path/to/atracker-rs.db.)"
    exit 0
fi

echo "About to delete:"
for f in "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"; do
    if [ -e "$f" ]; then
        size=$(wc -c < "$f" 2>/dev/null || echo "?")
        echo "  $f  (${size} bytes)"
    fi
done
echo ""

if [ "$ASSUME_YES" -ne 1 ]; then
    read -r -p "Continue? [y/N] " ans
    case "$ans" in
        y|Y|yes|YES) ;;
        *) echo "Aborted."; exit 1 ;;
    esac
fi

# Recommend stopping the daemon first — but don't enforce, since SQLite WAL
# handles concurrent unlink reasonably and the user may know what they want.
if pgrep -x atracker-rs > /dev/null 2>&1; then
    echo "⚠️  atracker-rs is currently running. Consider stopping it first:"
    echo "    ./scripts/uninstall.sh    # or systemctl --user stop atracker-rs"
    echo ""
fi

for f in "$DB_PATH" "${DB_PATH}-wal" "${DB_PATH}-shm"; do
    if [ -e "$f" ]; then
        rm -f "$f"
        echo "  removed $f"
    fi
done

echo ""
echo "✅ Wipe complete. A fresh DB will be created on next daemon start."
