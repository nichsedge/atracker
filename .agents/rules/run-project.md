---
trigger: always_on
---

- Dashboard V2 is the UI for the Rust backend (`atracker-rs`). There is no other backend.
- After updating **Rust** files:
    1. Run: `./scripts/deploy-rs-dashboard.sh` (Linux / macOS) or `./scripts/deploy-rs-dashboard.ps1` (Windows).
- After updating **Frontend** (Dashboard V2) files:
    1. Run the same deploy script.
    2. The Rust backend serves static files from `ATRACKER_DASHBOARD_DIST` (set by the systemd unit / launchd plist / VBS launcher), defaulting to `dashboards/dashboard-v2/dist`.
