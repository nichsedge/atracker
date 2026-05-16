#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/dashboards/dashboard-v2"
RUST_DIR="$ROOT_DIR/atracker-rs"

printf "[1/4] Building dashboard-v2...\n"
cd "$FRONTEND_DIR"
bun install
bun run build

printf "[2/4] Building atracker-rs release...\n"
cd "$RUST_DIR"
cargo build --release

printf "[3/4] Reloading user systemd units...\n"
systemctl --user daemon-reload

printf "[4/4] Restarting atracker-rs service...\n"
systemctl --user restart atracker-rs

printf "Done. Service status:\n"
systemctl --user --no-pager --full status atracker-rs
