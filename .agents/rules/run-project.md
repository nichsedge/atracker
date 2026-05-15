---
trigger: always_on
---

- Dashboard V2 is the modern UI for the **Rust** backend (`atracker-rs`).
- The legacy Python backend is **Dashboard V1**.
- Both systems run in parallel to ensure stability.
- After updating **Python** files: restart with `systemctl --user restart atracker`.
- After updating **Rust** files:
    1. Rebuild: `cargo build --release` (in `atracker-rs` directory)
    2. Restart: `systemctl --user restart atracker-rs`
- After updating **Frontend** (Dashboard V2) files:
    1. Rebuild: `npm run build` (in `dashboards/dashboard-v2` directory)
    2. The Rust backend serves the static files from `dist/`.