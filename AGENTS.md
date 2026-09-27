# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Project Overview

**atracker** is a local-first activity watcher & tracker for Linux (GNOME/Wayland), Windows, and macOS. It monitors active windows and idle time, stores data in SQLite, and provides a web dashboard for visualization.

This repository uses a single unified stack:
- **Backend (`atracker-rs`)**: Rust core daemon with real-time broadcast and REST/WebSocket API.
- **Frontend (`dashboard-v2`)**: Modern React + Vite + Vanilla CSS dashboard.

## 🏛️ Ecosystem Role & Telemetry Boundaries

`atracker` is the **High-Frequency Activity Telemetry Recorder** in the workstation's Personal Data Architecture ([`~/Projects/DATA_ARCHITECTURE.md`](file:///home/al/Projects/DATA_ARCHITECTURE.md)):

- **Primary Domain**: Continuous foreground window polling, process usage tracking, and idle detection across Linux (Niri/Hyprland/GNOME), Windows, and macOS.
- **Storage**: Local SQLite database at `~/.local/share/atracker-rs/atracker-rs.db`.
- **Promotion to Core SSOTs**:
  - Significant work sessions, project milestones, or travel blocks can be promoted to structured timeline events in `ierp` (`uv run ierp insert`).
  - Long-form work reflections or focus notes belong in `digital-graveyard/content/`.
- **Boundary**: Do NOT build general task managers, CRM contact directories, or financial ledgers inside `atracker`.

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

- **`src/watcher.rs`**: Core activity watcher. Polls the foreground window/app state and idle status every 5 seconds. Each platform is gated with `#[cfg(target_os = ...)]`:
  - **Linux**: Dynamic compositor and desktop environment detection with per-event tagging (`desktop_env`: `niri`, `gnome`, `hyprland`). Native Niri JSON IPC (`FocusedWindow` via `$NIRI_SOCKET` or runtime socket discovery), native Hyprland IPC support (`activewindow`), and D-Bus listener with the GNOME Shell extension `org.atracker.WindowTracker` / Mutter's `org.gnome.Mutter.IdleMonitor` (via `zbus`).
  - **Windows**: Direct Win32 FFI — `GetForegroundWindow`/`QueryFullProcessImageNameW` for the active window, `GetLastInputInfo` for idle time.
  - **macOS**: Raw `objc_msgSend` calls into `NSWorkspace.sharedWorkspace.frontmostApplication` for the active app, and `CGEventSourceSecondsSinceLastEventType` for idle time. AppKit is linked via [atracker-rs/build.rs](atracker-rs/build.rs) so `objc_getClass("NSWorkspace")` resolves at runtime. Per-window titles are read via `CGWindowListCopyWindowInfo` (matching on `kCGWindowOwnerPID` and `kCGWindowLayer == 0`); if Screen Recording permission isn't granted, `kCGWindowName` is absent and `title` falls back to the app's localized name. NSStrings from accessor methods are drained via an `NSAutoreleasePool` around the per-poll work.
- **`src/db.rs`**: Database abstraction using `sqlx` (SQLite). Automatically initializes tables/indexes at `~/.local/share/atracker-rs/atracker-rs.db`.
- **`src/api.rs`**: Axum-based web API server listening on port `8933`. Serves REST routes (e.g., `/api/summary`, `/api/timeline`, `/api/categories`, `/api/devices`) and WebSockets (`/ws`) for live-updating dashboard blocks.
- **`src/config.rs`**: Configuration model. Local configuration is saved at `~/.config/atracker-rs/config-rs.yaml`.

### Frontend (`dashboards/dashboard-v2`)

- React + Vite app serving a rich, high-performance visualization dashboard.
- Communicates with the Axum API on port `8933` and subscribes to the live `/ws` stream for real-time dashboard updates.

### Platform Services

- **Linux (systemd)**: Service unit at `deploy/systemd/atracker-rs.service`, controlled via the systemd user manager:
  ```bash
  # Enable and start the service
  systemctl --user enable --now atracker-rs

  # Check status
  systemctl --user status atracker-rs

  # Restart service
  systemctl --user restart atracker-rs
  ```
- **Windows**: `install.ps1` drops a silent `start-atracker.vbs` launcher into the user's Startup folder so the daemon starts hidden on logon.
- **macOS (launchd)**: The unified `install.sh` script detects macOS via `uname -s` and writes a LaunchAgent plist to `~/Library/LaunchAgents/com.atracker.atracker-rs.plist`, then `launchctl load -w`s it. Logs go to `~/Library/Logs/atracker-rs.log`. Common ops:
  ```bash
  # Reload after rebuild (or after granting Screen Recording permission)
  launchctl kickstart -k gui/$(id -u)/com.atracker.atracker-rs

  # Unload entirely
  launchctl unload ~/Library/LaunchAgents/com.atracker.atracker-rs.plist
  ```

## Helper Scripts

All helper scripts reside in the `scripts/` directory.

**Deploy / lifecycle (one pair per platform family):**
- `scripts/deploy-rs-dashboard.sh` (Linux + macOS, detected via `uname -s`): rebuilds dashboard + Rust, then restarts. Linux uses `systemctl --user restart`; macOS uses `launchctl kickstart -k` if the LaunchAgent is loaded, otherwise falls back to `pkill -x` + a fresh `nohup` launch for dev work.
- `scripts/deploy-rs-dashboard.ps1` (Windows): stops the running `.exe`, rebuilds, relaunches via the autostart VBS.
- `scripts/uninstall.sh` / `scripts/uninstall.ps1`: stop the daemon and remove the systemd unit / LaunchAgent plist / Startup VBS. Leaves DB and config in place.
- `scripts/tail-logs.sh` / `scripts/tail-logs.ps1`: follow daemon logs. Linux uses `journalctl --user -fu`; macOS tails `~/Library/Logs/atracker-rs.log`; Windows prints how to enable file logging (the current VBS launcher discards stdout).
- `scripts/wipe-data.sh` / `scripts/wipe-data.ps1`: delete the SQLite DB and its WAL/SHM sidecars after a `[y/N]` confirmation (or `--yes` / `-Yes` to skip). Leaves the config file alone. Pass `--db <path>` / `-DbPath <path>` if your DB lives outside the default.

**Maintenance:**
- `scripts/dedup_events.py`: Cleans near-duplicate sequential rows in the SQLite database.
- `scripts/sync_db.py`: Merges and upserts track event databases.
- `scripts/generate_icons.py`: Compiles and exports launchers and web favicon assets.
- `scripts/benchmark_regex.py`: Profiles pattern matching speed for categories.
- `scripts/SYNC_GUIDE.md`: Cross-platform DB sync walkthrough (Linux / macOS / Windows).