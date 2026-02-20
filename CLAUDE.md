# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**atracker** is a local-first activity watcher & tracker for Linux (GNOME/Wayland) and Windows. It monitors active windows and idle time, stores data in SQLite, and provides a web dashboard for visualization.

## Common Commands

### Development (Python - primary implementation)

```bash
# Install dependencies
uv sync

# Start daemon + dashboard
uv run atracker start

# Check if daemon is running
uv run atracker status

# View dashboard (opens in browser)
# Linux: xdg-open http://localhost:8932
# Windows: start http://localhost:8932
```

### Service Installation (Linux)

The `atracker.service` systemd unit file can be installed for automatic startup. It uses:

```bash
ExecStart=%h/.local/bin/uv run --project %h/Projects/atracker atracker start
```

Requires `DISPLAY` and `DBUS_SESSION_BUS_ADDRESS` environment variables.

### Rust Implementation (in-development)

The Rust port exists in `.temp/rust/` but is not actively used:

```bash
cd .temp/rust
cargo build --release
./target/release/atracker start
```

## Architecture

### Dual-Process Structure

The CLI (`cli.py`) spawns two processes:
1. **Watcher** (main async loop): Polls for active window and idle state, saves events to SQLite
2. **API Server** (background thread): FastAPI server on port 8932 serving dashboard and REST API

### Key Components

- **`src/atracker/watcher.py`** (Linux): Core polling daemon. Polls every 5 seconds via:
  - Primary: GNOME Shell extension via D-Bus (`org.atracker.WindowTracker`)
  - Fallback: xdotool/xprop for XWayland windows
  - Idle detection: `org.gnome.Mutter.IdleMonitor`
  - Tracks: active window changes, idle state changes, suspend/resume (time jumps >20s)

- **`src/atracker/watcher_windows.py`** (Windows): Same logic but uses Windows API:
  - `GetForegroundWindow`, `GetLastInputInfo`, `QueryFullProcessImageNameW`
  - Platform selection happens in `cli.py` via `sys.platform` check

- **`src/atracker/db.py`**: SQLite database layer:
  - Location: `~/.local/share/atracker/atracker.db` (or `ATRACKER_DATA_DIR` env var)
  - Tables: `events` (id, device_id, timestamp, end_timestamp, wm_class, title, pid, duration_secs, is_idle), `categories`
  - Uses `aiosqlite` for async operations
  - Device ID persisted in `~/.local/share/atracker/device_id`
  - Migration: Handles old INTEGER id → new UUID TEXT id schema
  - Cleans up cr-sqlite artifacts from previous sync attempts

- **`src/atracker/api.py`**: FastAPI REST API endpoints:
  - `/api/status` - Health check
  - `/api/events` - Raw events for a date
  - `/api/summary` - Per-app usage summary
  - `/api/timeline` - Timeline blocks for visualization
  - `/api/history` - Daily totals over N days
  - `/api/categories` - All categories

- **`gnome-extension/atracker@local/`**: GNOME Shell extension:
  - Exposes D-Bus service `org.atracker.WindowTracker`
  - Method: `GetActiveWindow()` returns JSON with `wm_class`, `title`, `pid`
  - Essential for native Wayland support

- **`dashboard/`**: Web dashboard (vanilla JS/CSS/HTML):
  - Three views: Today, History, Settings
  - Auto-refreshes every 15 seconds

### Database Schema

Events use TEXT UUID IDs (not auto-increment integers). The `wm_class` field is used for app identification and categorization, not `title`. Idle events use `wm_class = "__idle__"`.

Default categories (seeded on first run in `db.py`):
- Browser, Terminal, Editor, Communication, Files, Media, Office
- Pattern matching via regex on `wm_class`

### Platform Detection

Platform selection happens in `cli.py`:
```python
if sys.platform == "win32":
    from atracker.watcher_windows import run_watcher
else:
    from atracker.watcher import run_watcher
```

## Testing

No automated tests or CI/CD configuration exists. Testing is manual via running the dashboard locally.

## Dependencies

- **Python**: uv for dependency management (`uv sync`), minimum Python 3.12
- **Database**: SQLite (local-first, no external dependencies)
- **CLI dependencies**: dbus-next, fastapi, uvicorn, aiosqlite

## Data Flow

```
Gnome Shell / Windows API → Watcher (5s polling) → SQLite → FastAPI → Dashboard
```