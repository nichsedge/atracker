# 🕒 atracker

**Local-first activity watcher & tracker for Linux (GNOME/Wayland), Windows, and Android.**

`atracker` is a privacy-focused tool that automatically monitors your active windows and apps, helps you understand where your time goes, and provides beautiful visualizations—all while keeping your data strictly local.

---

## ✨ Features

- 🔒 **Privacy-First**: No data leaves your machine unless you explicitly sync it. No cloud, no tracking.
- 🐧 **Linux Support**: First-class support for GNOME/Wayland via a dedicated shell extension.
- 🪟 **Windows Support**: Native tracking using Windows APIs.
- 📱 **Android App**: Track mobile usage and sync with your desktop.
- 📊 **Beautiful Dashboard**: A modern, glassmorphism web-based dashboard with:
    - Daily Activity Timelines
    - App Usage Analytics
    - Categorization & Regex rules
    - History & Productivity Trends
- ⚙️ **Highly Configurable**: Customize poll intervals, idle thresholds, and more.
- ⚡ **Lightweight**: Minimal CPU and memory footprint.

---

## 🚀 Quick Start (Python)

Ensure you have [uv](https://github.com/astral-sh/uv) installed.

### 1. Install & Setup
```bash
# Clone the repository
git clone https://github.com/user/atracker.git
cd atracker

# Install dependencies
uv sync
```

### 2. Start the Daemon
```bash
uv run atracker start
```
This will start both the tracking daemon and the web dashboard server.

### 3. Open Dashboard
Visit [http://localhost:8932](http://localhost:8932) in your browser.

---

## 🐧 Linux (GNOME/Wayland) Installation

To accurately track windows on Wayland, you **must** install the GNOME extension included in this repo.

1.  **Install the extension**:
    ```bash
    cp -r gnome-extension/atracker@local ~/.local/share/gnome-shell/extensions/
    ```
2.  **Enable it**:
    - Restart GNOME Shell (Alt+F2, type `r`, Enter—or logout and log back in on Wayland).
    - Enable "Activity Tracker Window Watcher" in the Extensions app.
3.  **Run as a Service**:
    You can install the provided systemd service for automatic startup:
    ```bash
    mkdir -p ~/.config/systemd/user/
    cp atracker.service ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user enable --now atracker
    ```

---

## 🪟 Windows Installation

1.  **Install Python 3.12+** and **[uv](https://github.com/astral-sh/uv)**.
2.  **Install dependencies**:
    ```powershell
    uv sync
    ```
3.  **Start the tracker**:
    ```powershell
    uv run atracker start
    ```
    The dashboard opens automatically in your browser at [http://localhost:8932](http://localhost:8932).

4.  **Auto-start on login** (optional):
    ```powershell
    uv run atracker install
    ```
    This registers a Windows startup entry (via `HKCU\...\Run` registry key, no admin needed) so atracker starts silently in the background every time you log in. To remove it:
    ```powershell
    uv run atracker uninstall
    ```

> **Tip:** Use `atracker start --no-browser` to suppress the automatic browser launch (e.g. when running headless or from the scheduled task).

---

## 📱 Android Sync

The Android app tracks application usage using the `UsageStats` service.

1.  **Build/Install**: Use Android Studio to build and install the `atracker-android` app.
2.  **Permissions**: Grant "Usage Access" permission when prompted.
3.  **Syncing**: Configure the desktop API URL (e.g., `http://192.168.1.5:8932`) in the app settings to sync your phone data to your centralized dashboard.

---

## ⚙️ Configuration

Configuration is stored in `~/.config/atracker/config.yaml`.

```yaml
dashboard:
  port: 8932
  host: "0.0.0.0"

database:
  path: "~/.local/share/atracker/atracker.db"
  retention_days: 90

tracking:
  poll_interval: 5    # seconds
  idle_threshold: 120 # seconds before marked as idle
```

---

## � Documentation

For more detailed information, check out:
- [System Architecture](docs/architecture.md)
- [REST API Reference](docs/api.md)
- [Android Tracker Guide](docs/android.md)

---

## �🛠️ Development

- **Backend**: Python (FastAPI, aiosqlite, dbus-next)
- **Frontend**: Vanilla JS, CSS, HTML
- **Android**: Kotlin, WorkManager
- **Gnome**: GJS (Gnome JavaScript)

### Running Tests
```bash
uv run pytest
```

---

## ⚖️ License

MIT License.

