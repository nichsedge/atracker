# atracker

Local-first activity watcher & tracker for Linux (GNOME/Wayland).

## Quick Start (Python)

```bash
# Install dependencies
uv sync

# Start the daemon + dashboard
uv run atracker start

# Open dashboard
xdg-open http://localhost:8932
```

## Quick Start (Rust)

```bash
# Build the Rust binary
cd rust && cargo build --release

# Start the daemon + dashboard
./rust/target/release/atracker start

# Open dashboard
xdg-open http://localhost:8932
```
