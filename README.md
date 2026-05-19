# 🕒 atracker (v2)

**High-performance, local-first activity watcher & tracker for Linux (GNOME/Wayland) and Windows.**

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

---

## 🚀 Installation & Setup

You can install, build, and configure both the frontend dashboard and backend service automatically with a single command.

### 🐧 On Linux

Run the unified installer script:
```bash
./install.sh
```

This script will:
1. Verify system dependencies (`cargo`, `bun` or `npm`).
2. Build the React dashboard and Rust backend in release mode.
3. Automatically template and register the systemd user service `atracker-rs.service` with your actual workspace path.
4. Enable and start the background activity watcher.

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

---

## 📊 Open Dashboard

Once the installation is complete, visit **[http://localhost:8933](http://localhost:8933)** in your web browser.

---

## 🏗️ Architecture

- **Backend (`atracker-rs`)**: Rust + Axum + SQLx (SQLite).
- **Frontend (`dashboard-v2`)**: React + Vite + Tailwind (Legacy) / Vanilla CSS.
- **Watcher**: D-Bus integration with GNOME Shell and Mutter.
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
