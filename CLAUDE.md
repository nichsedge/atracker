# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**atracker** is a local-first activity watcher & tracker for Linux (GNOME/Wayland). It monitors active windows and idle time, stores data in SQLite, and provides a web dashboard for visualization.

This repository uses a single unified stack:
- **Backend (`atracker-rs`)**: Rust core daemon with real-time broadcast and REST/WebSocket API.
- **Frontend (`dashboard-v2`)**: Modern React + Vite + Vanilla CSS dashboard.

## Common Commands

### Rust Backend

```bash
# Build atracker-rs in release mode
cd atracker-rs
cargo build --release

# Run atracker-rs
./target/release/atracker-rs
```

### React Dashboard (dashboard-v2)

```bash
cd dashboards/dashboard-v2

# Install dependencies
bun install

# Run Vite dev server (opens http://localhost:5173 by default)
bun run dev

# Build production assets (dist/ directory)
bun run build
```

### Full System Deployment

To build the dashboard and Rust backend, reload systemd, and restart the service, run:

```bash
./scripts/deploy-rs-dashboard.sh
```

## Architecture

### Backend & API (`atracker-rs`)

- **`src/watcher.rs`**: Core activity watcher. Polls the foreground window/app state and idle status every 5 seconds.
  - Integration: D-Bus listener with GNOME Shell extension `org.atracker.WindowTracker` and Mutter's `org.gnome.Mutter.IdleMonitor`.
- **`src/db.rs`**: Database abstraction using `sqlx` (SQLite). Automatically initializes tables/indexes at `~/.local/share/atracker-rs/atracker-rs.db`.
- **`src/api.rs`**: Axum-based web API server listening on port `8933`. Serves REST routes (e.g., `/api/summary`, `/api/timeline`, `/api/categories`, `/api/devices`) and WebSockets (`/ws`) for live-updating dashboard blocks.
- **`src/config.rs`**: Configuration model. Local configuration is saved at `~/.config/atracker-rs/config-rs.yaml`.

### Frontend (`dashboards/dashboard-v2`)

- React + Vite app serving a rich, high-performance visualization dashboard.
- Communicates with the Axum API on port `8933` and subscribes to the live `/ws` stream for real-time dashboard updates.

### Platform Services (Linux Systemd)

- Service unit: `deploy/systemd/atracker-rs.service`
- Controlled via systemd user manager:
  ```bash
  # Enable and start the service
  systemctl --user enable --now atracker-rs

  # Check status
  systemctl --user status atracker-rs

  # Restart service
  systemctl --user restart atracker-rs
  ```

## Helper Scripts

All helper scripts reside in the `scripts/` directory:
- `scripts/deploy-rs-dashboard.sh`: Complete deployment helper for Rust and React stacks.
- `scripts/dedup_events.py`: Cleans near-duplicate sequential rows in the SQLite database.
- `scripts/sync_db.py`: Merges and upserts track event databases.
- `scripts/generate_icons.py`: Compiles and exports launchers and web favicon assets.
- `scripts/benchmark_regex.py`: Profiles pattern matching speed for categories.