---
trigger: always_on
---

- Dashboard V2 is the modern UI for the **Rust** backend (`atracker-rs`).
- The legacy Python backend is **Dashboard V1**.
- Both systems run in parallel to ensure stability.
- After updating **Python** files: restart with `systemctl --user restart atracker`.
- After updating **Rust** files:
    1. Run: `./scripts/deploy-rs-dashboard.sh`
- After updating **Frontend** (Dashboard V2) files:
    1. Run: `./scripts/deploy-rs-dashboard.sh`
    2. The Rust backend serves static files from `ATRACKER_DASHBOARD_DIST` (systemd env), defaulting to `dashboards/dashboard-v2/dist`.
