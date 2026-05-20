# 🕒 atracker (v2)

**High-performance, local-first activity watcher & tracker for Linux (GNOME/Wayland), Windows, and macOS.**

`atracker` is a privacy-focused tool that automatically monitors your active windows and apps, helps you understand where your time goes, and provides beautiful visualizations—all while keeping your data strictly local.

This version (v2) is built with **Rust** for the backend and **React** for the dashboard, providing superior performance, real-time updates via WebSockets, and a modern "wealth management" aesthetic.

---

## ✨ Features

- 🔒 **Privacy-First**: No data leaves your machine. Your activity is your business.
- 🦀 **Rust Core**: Ultra-low overhead daemon using `atracker-rs`.
- ⚛️ **Modern Dashboard**: A professional React-based UI (`dashboard-v2`) with:
    - 📊 **Real-time Activity**: Instant updates via WebSockets.
    - 🕒 **Timeline View**: 24-hour activity visualization.
    - 📱 **Multi-Device**: View stats from your Linux desktop and Android phone in one place.
    - 🏷️ **Smart Categorization**: Auto-categorize apps using regex patterns.
- 📱 **Android Sync**: Companion app to track mobile usage.
- 🐧 **Linux Native**: Optimized for GNOME/Wayland via a dedicated shell extension.
- 🪟 **Windows Native**: Integrated natively using direct Win32 APIs for foreground window and idle monitoring.
- 🍎 **macOS Native**: Uses AppKit (NSWorkspace) and CoreGraphics for foreground app and idle detection — no extra runtime dependencies.

---

## 🚀 Installation & Setup

You can install, build, and configure both the frontend dashboard and backend service automatically with a single command.

### 🐧 On Linux / 🍎 On macOS

Run the unified installer script:
```bash
./install.sh
```

The script detects your OS (`uname -s`) and:
1. Verifies system dependencies (`cargo`, `bun` or `npm`).
2. Builds the React dashboard and Rust backend in release mode.
3. Templates and registers the appropriate login-time service with your actual workspace path:
   - **Linux** → systemd user unit `atracker-rs.service`.
   - **macOS** → `launchd` agent at `~/Library/LaunchAgents/com.atracker.atracker-rs.plist` (logs to `~/Library/Logs/atracker-rs.log`).
4. Enables and starts the background activity watcher.

### 🪟 On Windows

Run the PowerShell installer script:
```powershell
./install.ps1
```

This script will:
1. Verify system dependencies (`cargo`, `bun` or `npm`).
2. Build the React dashboard and Rust backend.
3. Set up the local configuration at `~/.config/atracker-rs/config-rs.yaml`.
4. Install a silent startup script in your Windows **Startup folder** (`start-atracker.vbs`), launching the tracker completely hidden in the background on logon.

#### macOS permission note

The macOS watcher reads two kinds of data, with different permission requirements:

- **No prompt required** for: idle detection, the frontmost app's bundle identifier / localized name, and its process id.
- **Screen Recording** permission is required to read per-window titles via `CGWindowListCopyWindowInfo`. Until granted, `title` falls back to the active app's localized name (e.g. `Safari` rather than the actual window/tab title). Grant it under *System Settings → Privacy & Security → Screen Recording*, then kick the service:

  ```bash
  launchctl kickstart -k gui/$(id -u)/com.atracker.atracker-rs
  ```

---

## 📊 Open Dashboard

Once the installation is complete, visit **[http://localhost:8933](http://localhost:8933)** in your web browser.

---

## 🏗️ Architecture

- **Backend (`atracker-rs`)**: Rust + Axum + SQLx (SQLite).
- **Frontend (`dashboard-v2`)**: React + Vite + Tailwind (Legacy) / Vanilla CSS.
- **Watcher**: D-Bus on Linux (GNOME Shell + Mutter), Win32 on Windows, AppKit + CoreGraphics on macOS.
- **Android**: Kotlin app syncing via REST API.


## ⚙️ Configuration

- **Rust Config**: `~/.config/atracker-rs/config-rs.yaml`
- **Rust DB**: `~/.local/share/atracker-rs/atracker-rs.db`

---

## 📖 Documentation

- [System Architecture](docs/architecture.md)
- [REST API Reference](docs/api.md)
- [GNOME Extension Guide](docs/gnome-extension.md)
- [Android Tracker Guide](docs/android.md)

---

## ⚖️ License

MIT License.
