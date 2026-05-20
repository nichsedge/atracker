# GNOME Extension Guide

> **This guide applies to Linux (GNOME) only.** Windows uses Win32 APIs directly and macOS uses AppKit + CoreGraphics — neither needs a helper extension. See [architecture.md](architecture.md#4-platform-integration) for the per-platform breakdown.

To accurately track active windows on GNOME Shell (especially on Wayland), `atracker` requires a small helper extension.

## Why an extension?

On Wayland, security policies prevent applications from querying the state of other windows (like their title or class). The extension runs inside the GNOME Shell process and has the necessary permissions to see this metadata.

## Installation

The extension is located in `gnome-extension/atracker@local`.

```bash
# Copy to local extensions directory
mkdir -p ~/.local/share/gnome-shell/extensions/
cp -r gnome-extension/atracker@local ~/.local/share/gnome-shell/extensions/
```

### Enabling

1.  **Restart GNOME Shell**:
    - On X11: `Alt+F2`, type `r`, press `Enter`.
    - On Wayland: Log out and log back in.
2.  **Enable**: Use the "Extensions" app or run:
    ```bash
    gnome-extensions enable atracker@local
    ```

## D-Bus Interface

The extension exposes a simple interface that `atracker-rs` uses:

- **Bus Name**: `org.atracker.WindowTracker`
- **Object Path**: `/org/atracker/WindowTracker`
- **Interface**: `org.atracker.WindowTracker`
- **Method**: `GetActiveWindow()` -> Returns a JSON string:
  ```json
  {
    "wm_class": "Firefox",
    "title": "GitHub - Google/atracker",
    "pid": 1234
  }
  ```

## Troubleshooting

- **Extension not showing**: Ensure the folder name in `~/.local/share/gnome-shell/extensions/` exactly matches the `uuid` in `metadata.json` (which should be `atracker@local`).
- **No data in dashboard**: Check if the extension is enabled. You can test the D-Bus interface manually:
  ```bash
  gdbus call --session --dest org.atracker.WindowTracker \
             --object-path /org/atracker/WindowTracker \
             --method org.atracker.WindowTracker.GetActiveWindow
  ```
