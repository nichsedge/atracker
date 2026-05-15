# 🕒 atracker (v2)

**High-performance, local-first activity watcher & tracker for Linux (GNOME/Wayland).**

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

---

## 🚀 Quick Start (Rust Stack)

### 1. Build & Install
```bash
# Build the Rust backend
cd atracker-rs
cargo build --release

# Build the React dashboard
cd ../dashboards/dashboard-v2
npm install
npm run build
```

### 2. Start the Service
You can run it directly:
```bash
./atracker-rs/target/release/atracker-rs
```
Or install as a systemd user service (recommended):
```bash
mkdir -p ~/.config/systemd/user/
cp deploy/systemd/atracker-rs.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now atracker-rs
```

### 3. Open Dashboard
Visit [http://localhost:8933](http://localhost:8933) in your browser.

---

## 🏗️ Architecture

- **Backend (`atracker-rs`)**: Rust + Axum + SQLx (SQLite).
- **Frontend (`dashboard-v2`)**: React + Vite + Tailwind (Legacy) / Vanilla CSS.
- **Watcher**: D-Bus integration with GNOME Shell and Mutter.
- **Android**: Kotlin app syncing via REST API.

---

## 🐍 Legacy Python Stack (Isolated)

The original Python implementation is still available in `atracker-py`. It runs independently on port **8932** and uses a separate database.

To run the legacy stack:
```bash
cd atracker-py
uv sync
uv run atracker start
```

---

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
