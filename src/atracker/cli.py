"""CLI entry point for atracker."""

import asyncio
import logging
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

if sys.platform == "win32":
    from atracker.watcher_windows import run_watcher
else:
    from atracker.watcher import run_watcher


from atracker.config import config, CONFIG_PATH
from atracker.lock import acquire_watcher_lock, release_watcher_lock


def main():
    """Main entry point — runs watcher + API server together."""
    first_run = not CONFIG_PATH.exists()
    config.ensure_config_file()

    # Use log level from config
    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logger = logging.getLogger("atracker.cli")

    args = sys.argv[1:]

    # Very basic arg parsing
    command = "start"
    poll_interval = None
    idle_threshold = None
    open_browser = True

    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "start":
            command = "start"
        elif arg == "status":
            command = "status"
        elif arg == "help":
            command = "help"
        elif arg == "install":
            command = "install"
        elif arg == "uninstall":
            command = "uninstall"
        elif arg == "--poll-interval" and i + 1 < len(args):
            poll_interval = int(args[i + 1])
            i += 1
        elif arg == "--idle-threshold" and i + 1 < len(args):
            idle_threshold = int(args[i + 1]) * 1000
            i += 1
        elif arg == "--no-browser":
            open_browser = False
        i += 1

    if command == "start":
        port = config.dashboard_port
        db_path = config.db_path

        print(f"atracker started")
        print(f"  Dashboard : http://localhost:{port}")
        print(f"  Data      : {db_path}")
        print(f"  Stop      : Ctrl+C")

        if first_run and sys.platform == "win32":
            print()
            print("  First run — tip: run `atracker install` to auto-start on login.")

        if not acquire_watcher_lock():
            print("Error: another atracker watcher is already running.")
            sys.exit(1)

        try:
            # Run API server in a background thread
            api_thread = threading.Thread(target=_run_api_server, daemon=True)
            api_thread.start()

            # Open browser after a short delay to let the server bind
            if open_browser:
                print()
                print("  Opening dashboard in browser...")
                timer = threading.Timer(1.5, webbrowser.open, args=[f"http://localhost:{port}"])
                timer.daemon = True
                timer.start()

            # Run the watcher in the main async loop
            try:
                asyncio.run(
                    run_watcher(
                        poll_interval=poll_interval, idle_threshold=idle_threshold
                    )
                )
            except KeyboardInterrupt:
                logger.info("Shutting down...")
        finally:
            release_watcher_lock()

    elif command == "install":
        if sys.platform != "win32":
            print("The `install` command is only available on Windows.")
            print("On Linux, use the provided systemd service instead.")
            sys.exit(1)
        _install_windows_startup()

    elif command == "uninstall":
        if sys.platform != "win32":
            print("The `uninstall` command is only available on Windows.")
            sys.exit(1)
        _uninstall_windows_startup()

    elif command == "status":
        import urllib.request

        try:
            with urllib.request.urlopen(
                f"http://localhost:{config.dashboard_port}/api/status", timeout=2
            ) as resp:
                import json

                data = json.loads(resp.read())
                print(f"atracker is running")
                print(f"  Database  : {data['db_path']}")
                print(f"  Timestamp : {data['timestamp']}")
        except Exception:
            print("atracker is not running")
            sys.exit(1)

    elif command == "help":
        print("Usage: atracker [command] [options]")
        print("")
        print("Commands:")
        print("  start      Start the activity tracker daemon (default)")
        print("  status     Check if the daemon is running")
        if sys.platform == "win32":
            print("  install    Register atracker to start automatically on Windows login")
            print("  uninstall  Remove the Windows auto-start registration")
        print("  help       Show this help message")
        print("")
        print("Options (for 'start'):")
        print(
            f"  --poll-interval SECS    How often to poll the active window (default: {config.poll_interval})"
        )
        print(
            f"  --idle-threshold SECS   How long to wait before marking as idle (default: {config.idle_threshold})"
        )
        print(f"  --no-browser            Do not open the dashboard in a browser on start")

    else:
        print(f"Unknown command: {command}")
        print("Run 'atracker help' for usage info.")
        sys.exit(1)


def _run_api_server():
    """Run the FastAPI server in a separate thread."""
    from atracker.api import app

    uvicorn.run(
        app, host=config.dashboard_host, port=config.dashboard_port, log_level="warning"
    )


_REGISTRY_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
_REGISTRY_VALUE = "atracker"


def _install_windows_startup():
    """Register atracker in HKCU Run registry key so it starts on login (no admin needed)."""
    import winreg

    scripts_dir = Path(sys.executable).parent  # e.g. .venv/Scripts/
    pythonw = scripts_dir / "pythonw.exe"

    if not pythonw.exists():
        print("Error: pythonw.exe not found.")
        print("Make sure atracker is installed inside a virtual environment (uv sync).")
        return

    # pythonw.exe runs Python without a console window — ideal for a background daemon
    cmd = f'"{pythonw}" -m atracker.cli start --no-browser'

    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            _REGISTRY_KEY,
            0,
            winreg.KEY_SET_VALUE,
        )
        winreg.SetValueEx(key, _REGISTRY_VALUE, 0, winreg.REG_SZ, cmd)
        winreg.CloseKey(key)
    except OSError as e:
        print(f"Failed to write registry key: {e}")
        return

    print("atracker will now start automatically on Windows login.")
    print()
    print(f"  Registry : HKCU\\{_REGISTRY_KEY}\\{_REGISTRY_VALUE}")
    print(f"  To remove: atracker uninstall")


def _uninstall_windows_startup():
    """Remove the atracker Windows startup registry entry."""
    import winreg

    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            _REGISTRY_KEY,
            0,
            winreg.KEY_SET_VALUE,
        )
        winreg.DeleteValue(key, _REGISTRY_VALUE)
        winreg.CloseKey(key)
        print("atracker auto-start removed.")
        print("atracker will no longer start automatically on login.")
    except FileNotFoundError:
        print("No atracker startup entry found (already removed or never installed).")
    except OSError as e:
        print(f"Failed to remove registry key: {e}")


if __name__ == "__main__":
    main()
